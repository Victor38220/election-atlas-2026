import {describe,it,expect} from 'vitest';
import type {FeatureCollection,Geometry} from 'geojson';
import {normalizeMinnesota} from './countyMinnesota';
import raw from '../../tests/fixtures/minnesota-live-counties.json';
import geo from '../../public/geo/counties/MN.json';
const geometry=geo as FeatureCollection<Geometry>,fetched='2026-11-04T04:00:00Z';
describe('live Minnesota downloadable county returns',()=>{
 it('matches the official county table to FIPS and keeps real votes, independent parties and source time',()=>{const data=normalizeMinnesota(raw,geometry,fetched);expect(data.rows).toHaveLength(4);const beltrami=data.rows.find(r=>r.fips==='27007'&&r.office==='Senate')!;expect(beltrami.total).toBe(1853);expect(beltrami.candidates.find(c=>c.name==='Peggy Flanagan')).toMatchObject({party:'D',votes:548,share:.2957});expect(beltrami.candidates.find(c=>c.name==='Marisa Simonetti')?.party).toBe('I');expect(beltrami.reported).toBe(30);expect(beltrami.reporting_total).toBe(61);expect(beltrami.source_time).toBe('Wed, 04 Nov 2026 03:38:56 GMT')});
 it('keeps true zero reports separate from missing shares',()=>{const data=normalizeMinnesota(raw,geometry,fetched);const aitkin=data.rows.find(r=>r.fips==='27001'&&r.office==='Senate')!;expect(aitkin.total).toBe(0);expect(aitkin.status).toBe('awaiting');expect(aitkin.candidates.every(c=>c.share===null)).toBe(true)});
 it('rejects a wrong election year or invalid candidate counts',()=>{expect(()=>normalizeMinnesota({...raw,election_date:'2024-11-05'},geometry,fetched)).toThrow('2026');expect(()=>normalizeMinnesota({...raw,results:raw.results.replace(';548;',';;')},geometry,fetched)).toThrow('count')});
 it('does not turn a state Senate race into U.S. Senate or double-count a governor ticket',()=>{const data=normalizeMinnesota(raw,geometry,fetched);expect(data.rows.find(r=>r.fips==='27007'&&r.office==='Governor')?.candidates).toHaveLength(4);expect(()=>normalizeMinnesota({...raw,results:raw.results.replaceAll('U.S. Senator','State Senator District 7').replaceAll('Governor & Lt Governor','Attorney General')},geometry,fetched)).toThrow('No Minnesota Senate')});
});
