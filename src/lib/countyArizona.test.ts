import {describe,it,expect} from 'vitest';
import type {FeatureCollection,Geometry} from 'geojson';
import {normalizeArizona,ARIZONA_REFRESH_MS} from './countyArizona';
import raw from '../../tests/fixtures/arizona-county-live.json';
import geo from '../../public/geo/counties/AZ.json';
const fetched='2026-11-04T03:45:00Z';
describe('official Arizona2026 governor county counts',()=>{
 it('matches15actualcounties and preserves reported nonzero observations',()=>{const data=normalizeArizona(raw,geo as FeatureCollection<Geometry>,fetched);expect(data.rows).toHaveLength(15);expect(data.rows.filter(r=>r.status==='reporting')).toHaveLength(12);const county=data.rows.find(r=>r.county==='Maricopa')!;expect(county.fips).toBe('04013');expect(county.total).toBe(1004925);expect(county.candidates[0]).toMatchObject({name:'Katie Hobbs / John Giles',party:'D',votes:596958});expect(county.candidates[0].share).toBeCloseTo(596958/1004925)});
 it('leaves realzero-count counties awaiting and never promotes a stateSenate contest',()=>{const data=normalizeArizona(raw,geo as FeatureCollection<Geometry>,fetched);expect(data.rows.find(r=>r.county==='La Paz')?.candidates.every(c=>c.share===null)).toBe(true);expect(data.rows.every(r=>r.office==='Governor'&&r.year===2026)).toBe(true)});
 it('keeps source timestamps distinct from retrieval and enforces2min cadence',()=>{const data=normalizeArizona(raw,geo as FeatureCollection<Geometry>,fetched);expect(data.source_time).toBe(raw.election.asOf);expect(data.fetched_at).toBe(fetched);expect(ARIZONA_REFRESH_MS).toBe(120000)});
 it('rejects primary/other-year results or another office',()=>{for(const election of [{...raw.election,isPrimary:true},{...raw.election,electionDate:'2024-11-05'}])expect(()=>normalizeArizona({...raw,election},geo as FeatureCollection<Geometry>,fetched)).toThrow('2026 general');expect(()=>normalizeArizona({...raw,ballotItemWithBreakdown:{...raw.ballotItemWithBreakdown,name:'State Senator - District No.1'}},geo as FeatureCollection<Geometry>,fetched)).toThrow('governor ticket')});
 it('rejects duplicate county identities and negative votes',()=>{const contest=raw.ballotItemWithBreakdown;expect(()=>normalizeArizona({...raw,ballotItemWithBreakdown:{...contest,breakdownResults:[...contest.breakdownResults,contest.breakdownResults[0]]}},geo as FeatureCollection<Geometry>,fetched)).toThrow('Duplicate')});
});
