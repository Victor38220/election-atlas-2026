import {describe,it,expect} from 'vitest';
import type {FeatureCollection,Geometry} from 'geojson';
import {normalizeTexas} from './countyTexas';
import {countyTotals} from './countyTotals';
import raw from '../../tests/fixtures/texas-live-counties.json';
import geo from '../../public/geo/counties/TX.json';
const geometry=geo as FeatureCollection<Geometry>,fetched='2026-11-04T04:20:00Z';
describe('live 2026 Texas county returns via secondary SOS mirror',()=>{
 it('maps real Harris county Senate and governor counts to the correct FIPS and outcomes',()=>{
  const data=normalizeTexas(raw,geometry,fetched);expect(data.rows).toHaveLength(6);expect(data.status).toBe('partial');
  const senate=data.rows.find(r=>r.fips==='48201'&&r.office==='Senate')!;
  expect(senate.total).toBe(1072564);expect(senate.candidates.find(c=>c.name==='James Talarico')).toMatchObject({party:'D',votes:711712});
  expect(senate.candidates.find(c=>c.name==='Ken Paxton')).toMatchObject({party:'R',votes:345943});
  const governor=data.rows.find(r=>r.fips==='48201'&&r.office==='Governor')!;
  expect(governor.total).toBe(1072673);expect(governor.candidates.find(c=>c.name==='Gina Hinojosa')?.votes).toBe(692724);
  expect(data.source_name).toContain('secondary mirror');expect(data.source_time).toBe(raw.Senate.sourceUpdatedAt);
  expect(data.fetched_at).toBe(raw.Senate.fetchedAt);expect(governor.fetched_at).toBe(raw.Governor.fetchedAt);
 });
 it('preserves zero observed totals with null shares and keeps write-ins distinct from independents',()=>{
  const data=normalizeTexas(raw,geometry,fetched);const blanco=data.rows.find(r=>r.fips==='48031')!;
  expect(blanco).toMatchObject({status:'awaiting',total:0});expect(blanco.candidates.every(c=>c.share===null)).toBe(true);
  expect(data.rows[0].candidates.find(c=>c.name==='Avery Ayers')?.party).toBe('W');
 });
 it('normalizes only punctuation and spacing for DeWitt and La Salle county names',()=>{
  const changed=structuredClone(raw);changed.Senate.counties[0].id='DE WITT';changed.Senate.counties[1].id='LA SALLE';
  const data=normalizeTexas(changed,geometry,fetched);
  expect(data.rows.filter(r=>r.office==='Senate').map(r=>r.fips)).toEqual(expect.arrayContaining(['48123','48283']));
 });
 it('rejects wrong election dates, primaries and mismatched offices',()=>{
  expect(()=>normalizeTexas({...raw,election_date:'2024-11-05'},geometry,fetched)).toThrow('2026');
  expect(()=>normalizeTexas({...raw,Senate:{...raw.Senate,key:'state-senate'}},geometry,fetched)).toThrow('office');
  expect(()=>normalizeTexas({...raw,Senate:{...raw.Senate,race:'U.S. Senator Republican Primary'}},geometry,fetched)).toThrow('office');
 });
 it('rejects missing votes, inconsistent totals and duplicate county records',()=>{
  const changed=structuredClone(raw);changed.Senate.counties[0].votes.pop();expect(()=>normalizeTexas(changed,geometry,fetched)).toThrow('outcomes');
  const invalid=structuredClone(raw);invalid.Senate.counties[0].total++;expect(()=>normalizeTexas(invalid,geometry,fetched)).toThrow('sum');
  const duplicate=structuredClone(raw);duplicate.Senate.counties.push(duplicate.Senate.counties[0]);expect(()=>normalizeTexas(duplicate,geometry,fetched)).toThrow('Duplicate Texas county');
 });
 it('rejects absent or invalid mirror timestamps and data outside the live general-election window',()=>{
  expect(()=>normalizeTexas({...raw,Senate:{...raw.Senate,fetchedAt:null}},geometry,fetched)).toThrow('collection timestamp');
  expect(()=>normalizeTexas({...raw,Senate:{...raw.Senate,sourceUpdatedAt:'invalid'}},geometry,fetched)).toThrow('timestamp');
  expect(()=>normalizeTexas({...raw,Senate:{...raw.Senate,sourceUpdatedAt:'2026-03-04T04:13:41Z'}},geometry,fetched)).toThrow('general-election window');
  expect(()=>normalizeTexas({...raw,Senate:{...raw.Senate,fetchedAt:'2026-11-05T04:13:41Z'}},geometry,fetched)).toThrow('future');
 });
 it('does not fuzzy match unknown counties or pretend missing precinct counts are zero',()=>{
  const changed=structuredClone(raw);changed.Senate.counties[0].id='HARRISS';const data=normalizeTexas(changed,geometry,fetched);expect(data.status).toBe('partial');
  const missing={...raw,Senate:{...raw.Senate,counties:[{...raw.Senate.counties[0],reported:null,precincts:null}]}};
  const result=normalizeTexas(missing,geometry,fetched).rows.find(r=>r.office==='Senate')!;
  expect(result.reported).toBeNull();expect(result.reporting_total).toBeNull();expect(result.reporting_unit).toBeNull();
 });
 it('excludes truncated county coverage or missing offices from statewide totals',()=>{
  const truncated=normalizeTexas(raw,geometry,fetched);expect(truncated.status).toBe('partial');expect(countyTotals(truncated)).toEqual([]);
  const missingOffice=normalizeTexas({election_date:raw.election_date,Senate:raw.Senate},geometry,fetched);expect(missingOffice.status).toBe('partial');expect(countyTotals(missingOffice)).toEqual([]);
  const completeGeometry={...geometry,features:geometry.features.filter(feature=>['48001','48031','48201'].includes(String(feature.id)))};
  const complete=normalizeTexas(raw,completeGeometry,fetched);expect(complete.status).toBe('ok');
  const dropped=structuredClone(raw);dropped.Senate.counties.pop();const incomplete=normalizeTexas(dropped,completeGeometry,fetched);
  expect(incomplete.status).toBe('partial');expect(countyTotals(incomplete)).toEqual([]);
 });
});
