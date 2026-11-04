import {describe,it,expect} from 'vitest';
import type {FeatureCollection,Geometry} from 'geojson';
import {normalizeColorado,unzipColoradoReport} from './countyColorado';
import fixture from '../../tests/fixtures/colorado-county-live.json';
import zipped from '../../tests/fixtures/colorado-county-zip.json';
import geo from '../../public/geo/counties/CO.json';
const fetched='2026-11-04T03:55:00Z';
describe('official Colorado2026 county report',()=>{
 it('normalizes both2026 contests acrossall64counties fromactualcountyvotes',()=>{const data=normalizeColorado(fixture.xml,geo as FeatureCollection<Geometry>,fetched);expect(data.rows).toHaveLength(128);const adams=data.rows.find(r=>r.county==='Adams'&&r.office==='Senate')!;expect(adams.fips).toBe('08001');expect(adams.candidates.find(c=>c.name==='John Hickenlooper')?.votes).toBe(92334);expect(data.rows.some(r=>r.office==='Governor')).toBe(true)});
 it('keeps local source time verbatim and separates retrieval and precinct units',()=>{const data=normalizeColorado(fixture.xml,geo as FeatureCollection<Geometry>,fetched);expect(data.source_time).toBe('11/3/2026 8:30:47 PM MST');expect(data.fetched_at).toBe(fetched);const adams=data.rows.find(r=>r.county==='Adams'&&r.office==='Senate')!;expect(adams.reported).toBe(372);expect(adams.reporting_total).toBe(395)});
 it('rejects other electionyears/states or ambiguity',()=>{expect(()=>normalizeColorado(fixture.xml.replace('<ElectionDate>11/3/2026</ElectionDate>','<ElectionDate>11/5/2024</ElectionDate>'),geo as FeatureCollection<Geometry>,fetched)).toThrow('2026 election');expect(()=>normalizeColorado(fixture.xml.replace('<Region>CO</Region>','<Region>TX</Region>'),geo as FeatureCollection<Geometry>,fetched)).toThrow('2026 election')});
 it('rejects malformed XML and a ZIP without official report',async()=>{expect(()=>normalizeColorado('<ElectionResult>',geo as FeatureCollection<Geometry>,fetched)).toThrow('XML');await expect(unzipColoradoReport(new ArrayBuffer(8))).rejects.toThrow('ZIP')});
 it('decodes the actualreportformat without thirdpartyzip code',async()=>{const bytes=Uint8Array.from(atob(zipped.base64),c=>c.charCodeAt(0));expect(await unzipColoradoReport(bytes.buffer)).toBe(fixture.xml)});
});
