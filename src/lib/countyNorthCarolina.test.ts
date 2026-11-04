import {describe,it,expect} from 'vitest';
import type {FeatureCollection,Geometry} from 'geojson';
import {normalizeNorthCarolina} from './countyNorthCarolina';
import raw from '../../tests/fixtures/nc-county-live.json';
import geo from '../../public/geo/counties/NC.json';
const geometry=geo as FeatureCollection<Geometry>;
const fetched='2026-11-04T03:20:00Z';
describe('official live 2026 North Carolina county returns',()=>{
 it('maps recorded county Senate votes to exact FIPS and preserves precinct reporting',()=>{const data=normalizeNorthCarolina(raw,geometry,fetched);expect(data.rows).toHaveLength(2);const county=data.rows.find(r=>r.fips==='37001')!;expect(county.county).toBe('Alamance');expect(county.total).toBe(67849);expect(county.candidates[0]).toMatchObject({name:'Roy Cooper',party:'D',votes:38109,share:.5617});expect(county.reported).toBe(39);expect(county.reporting_total).toBe(39);expect(county.source_time).toBe('November 3, 2026 9:53 pm');expect(county.source_time).not.toBe(fetched);expect(county.office).toBe('Senate');expect('winner' in county).toBe(false)});
 it('rejects a historical or primary election instead of passing it as live',()=>{const value=structuredClone(raw);value.county[0].tle='03/03/2026 UNOFFICIAL PRIMARY ELECTION RESULTS - STATEWIDE';expect(()=>normalizeNorthCarolina(value,geometry,fetched)).toThrow('November 3, 2026')});
 it('uses actual zero counts as awaiting with missing shares',()=>{const value=structuredClone(raw);for(const r of value.results){r.vct='0';r.pct='0.00%'}const county=normalizeNorthCarolina(value,geometry,fetched).rows[0];expect(county.status).toBe('awaiting');expect(county.total).toBe(0);expect(county.candidates.every(c=>c.share===null)).toBe(true)});
 it('rejects missing votes and does not confuse state senate with the U.S. Senate',()=>{const value=structuredClone(raw);value.results[0].vct='';expect(()=>normalizeNorthCarolina(value,geometry,fetched)).toThrow('votes missing');const noFederal=structuredClone(raw);for(const c of noFederal.candidates)c.cnm='NC STATE SENATE DISTRICT 01';expect(()=>normalizeNorthCarolina(noFederal,geometry,fetched)).toThrow('U.S. Senate')});
 it('never assigns unmatched county names by fuzzy matching',()=>{const value=structuredClone(raw);value.county[1].cnm='ALAMANCE DIFFERENT';const data=normalizeNorthCarolina(value,geometry,fetched);expect(data.rows).toHaveLength(1);expect(data.status).toBe('partial')});
});
