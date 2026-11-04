import {describe,it,expect} from 'vitest';
import {normalizeCalifornia} from './countyCalifornia';
import raw from '../../tests/fixtures/california-live-counties.json';
import geo from '../../tests/fixtures/california-county-identities.json';
import seed from '../../public/data/live-counties/CA.json';
const fetched='2026-11-04T03:10:00Z';
describe('official live California county feed',()=>{
 it('matches all58county rows to exact actual FIPS identities',()=>{const data=normalizeCalifornia(raw,geo,fetched);expect(data.rows).toHaveLength(58);expect(data.rows.find(r=>r.county==='Los Angeles')?.fips).toBe('06037');expect(data.rows.every(r=>r.year===2026&&r.office==='Governor')).toBe(true)});
 it('keeps initialized zero-vote records awaiting with null shares',()=>{const data=normalizeCalifornia(raw,geo,fetched);expect(data.rows.every(r=>r.status==='awaiting'&&r.total===0&&r.candidates.every(c=>c.share===null))).toBe(true);expect(data.source_time).toBe('November 2, 2026, 6:28 p.m.');expect(data.rows[0].fetched_at).toBe(fetched)});
 it('preserves source precinct counts separately from candidate vote shares',()=>{const row=normalizeCalifornia(raw,geo,fetched).rows.find(r=>r.county==='Alameda')!;expect(row.reported).toBe(0);expect(row.reporting_total).toBe(627);expect(row.reporting_unit).toBe('precincts')});
 it('rejects historical years instead of substituting old election data',()=>{const old=raw.map(r=>({...r,ReportingTime:r.ReportingTime.replace('2026','2024')}));expect(()=>normalizeCalifornia(old,geo,fetched)).toThrow('2026')});
 it('rejects a 2026 primary reporting window',()=>{const primary=raw.map(r=>({...r,ReportingTime:r.ReportingTime.replace('November','June')}));expect(()=>normalizeCalifornia(primary,geo,fetched)).toThrow('general-election')});
 it('does not accept a fuzzy county identity or missing FIPS',()=>{const other={features:geo.features.filter(f=>f.properties.name!=='Alameda')};const data=normalizeCalifornia(raw,other,fetched);expect(data.status).toBe('partial');expect(data.rows.some(r=>r.county==='Alameda')).toBe(false)});
 it('rejects duplicate or corrupt county observations',()=>{expect(()=>normalizeCalifornia([...raw,raw[1]],geo,fetched)).toThrow('Duplicate');const bad=raw.map((r,i)=>i===1?{...r,candidates:r.candidates.map(c=>({...c,Votes:'-1'}))}:r);expect(()=>normalizeCalifornia(bad,geo,fetched)).toThrow('vote count')});
 it('ships the actual recorded normalized source with no historical substitute',()=>{const normalized=normalizeCalifornia(raw,geo,seed.fetched_at);expect(normalized).toEqual(seed)});
});
