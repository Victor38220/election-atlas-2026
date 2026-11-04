import {describe,it,expect} from 'vitest';
import type {FeatureCollection,Geometry} from 'geojson';
import {normalizeVirginia} from './countyVirginia';
import raw from '../../tests/fixtures/virginia-live-counties.json';
import geo from '../../public/geo/counties/VA.json';
const geometry=geo as FeatureCollection<Geometry>;const fetched='2026-11-04T04:00:00Z';
describe('live Virginia county and independent-city returns',()=>{
 it('maps county and city official FIPS independently and preserves actual counts',()=>{const data=normalizeVirginia(raw,geometry,fetched);expect(data.rows).toHaveLength(2);const county=data.rows.find(r=>r.fips==='51001')!;expect(county.total).toBe(6004);expect(county.candidates.find(c=>c.name==='Mark R. Warner')?.votes).toBe(2265);expect(county.reported).toBe(13);expect(county.reporting_total).toBe(16);expect(data.rows.find(r=>r.fips==='51510')?.county).toBe('Alexandria');expect(county.source_time).not.toBe(fetched)});
 it('rejects primaries and different elections or offices',()=>{for(const variant of ['year','primary','office']){const value=structuredClone(raw);if(variant==='year')value.election.electionDate='2024-11-05';if(variant==='primary')value.election.isPrimary=true;if(variant==='office')value.ballotItemWithBreakdown.name[0].text='State Senate';expect(()=>normalizeVirginia(value,geometry,fetched)).toThrow()}});
 it('does not fabricate a county match or hidden vote count',()=>{const value=structuredClone(raw);value.ballotItemWithBreakdown.breakdownResults[0].locality.mapFeatureId='999';expect(normalizeVirginia(value,geometry,fetched).rows).toHaveLength(1);expect(normalizeVirginia(value,geometry,fetched).status).toBe('partial')});
 it('keeps zero totals awaiting with unknown shares',()=>{const value=structuredClone(raw);for(const r of value.ballotItemWithBreakdown.breakdownResults){r.voteTotal=0;for(const c of r.ballotOptions)c.voteCount=0}const data=normalizeVirginia(value,geometry,fetched);expect(data.rows.every(r=>r.status==='awaiting'&&r.candidates.every(c=>c.share===null))).toBe(true)});
});
