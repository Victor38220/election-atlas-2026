import {describe,it,expect} from 'vitest';
import type {FeatureCollection,Geometry} from 'geojson';
import {normalizeGeorgia} from './countyGeorgia';
import raw from '../../tests/fixtures/ga-county-live.json';
import geo from '../../public/geo/counties/GA.json';
const geometry=geo as FeatureCollection<Geometry>;
const fetched='2026-11-04T03:30:00Z';
describe('official 2026 Georgia county returns',()=>{
 it('links actual county candidate counts to both offices and exact FIPS',()=>{const data=normalizeGeorgia(raw,geometry,fetched);expect(data.rows).toHaveLength(4);const appling=data.rows.find(r=>r.fips==='13001'&&r.office==='Senate')!;expect(appling.county).toBe('Appling');expect(appling.total).toBe(6176);expect(appling.candidates[0]).toMatchObject({name:'Mike Collins',party:'R',votes:4628});expect(appling.reported).toBe(9);expect(appling.reporting_total).toBe(9);expect(appling.source_time).not.toBe(fetched)});
 it('does not mistake the source incumbent (I) label for an independent party',()=>{const data=normalizeGeorgia(raw,geometry,fetched);expect(data.rows[0].candidates.find(c=>c.name==='Jon Ossoff')?.party).toBe('D')});
 it('rejects a different year, primary or wrong office',()=>{for(const field of ['date','primary','office']){const value=structuredClone(raw);if(field==='date')value.Senate.election.electionDate='2024-11-05';if(field==='primary')value.Senate.election.isPrimary=true;if(field==='office')value.Senate.ballotItemWithBreakdown.name[0].text='State Senate';expect(()=>normalizeGeorgia(value,geometry,fetched)).toThrow()}});
 it('keeps true zero counts awaiting with null shares',()=>{const value=structuredClone(raw);for(const office of ['Senate','Governor'] as const)for(const r of value[office].ballotItemWithBreakdown.breakdownResults){r.voteTotal=0;for(const c of r.ballotOptions)c.voteCount=0}const data=normalizeGeorgia(value,geometry,fetched);expect(data.rows.every(r=>r.status==='awaiting'&&r.candidates.every(c=>c.share===null))).toBe(true)});
 it('does not fuzzy-match a changed county boundary name',()=>{const value=structuredClone(raw);value.Senate.ballotItemWithBreakdown.breakdownResults[0].locality.mapFeatureId='Appling DIFFERENT';const data=normalizeGeorgia(value,geometry,fetched);expect(data.status).toBe('partial');expect(data.rows.filter(r=>r.office==='Senate')).toHaveLength(1)});
});
