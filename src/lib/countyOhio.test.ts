import {describe,it,expect} from 'vitest';
import type {FeatureCollection,Geometry} from 'geojson';
import {normalizeOhio} from './countyOhio';
import raw from '../../tests/fixtures/ohio-live-counties.xml?raw';
import geo from '../../public/geo/counties/OH.json';
const geometry=geo as FeatureCollection<Geometry>;const fetched='2026-11-04T04:00:00Z';
describe('live Ohio NIST county results',()=>{
 it('uses only county aggregation records for both offices, not statewide/district totals',()=>{const data=normalizeOhio(raw,geometry,fetched);expect(data.rows).toHaveLength(4);const adams=data.rows.find(r=>r.fips==='39001'&&r.office==='Governor')!;expect(adams.candidates.find(c=>c.name==='Amy Acton')?.votes).toBe(2054);expect(adams.candidates.some(c=>c.name==='David Pepper')).toBe(false);expect(adams.reported).toBe(16);expect(adams.reporting_total).toBe(21);expect(adams.source_time).toBe('2026-11-04T03:39:36Z');expect(adams.total).toBeLessThan(30000);expect(data.rows.some(r=>r.office==='Senate')).toBe(true)});
 it('rejects mismatched years, primary elections and invalid XML',()=>{for(const value of [raw.replace('Date="2026-11-03"','Date="2024-11-05"'),raw.replace('Type="General"','Type="Primary"'),'<invalid>'])expect(()=>normalizeOhio(value,geometry,fetched)).toThrow()});
 it('does not turn missing vote count attributes into zero',()=>{expect(()=>normalizeOhio(raw.replace('Count="2054"','Count=""'),geometry,fetched)).toThrow('vote count missing')});
 it('does not double-count the governor running mate',()=>{const data=normalizeOhio(raw,geometry,fetched);const adams=data.rows.find(r=>r.fips==='39001'&&r.office==='Governor')!;expect(adams.candidates).toHaveLength(6);expect(adams.candidates.find(c=>c.name==='Amy Acton')?.party).toBe('D');expect(adams.candidates.find(c=>c.name==='Vivek Ramaswamy')?.party).toBe('R')});
});
