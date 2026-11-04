import {describe,it,expect,vi,afterEach} from 'vitest';
import {normalizeResults,fetchResults} from './results';
import fixtures from '../../tests/fixtures/openamerica-results.json';
import manifest from '../../config/races.json';
import type {Race} from '../types';
afterEach(()=>vi.restoreAllMocks());
describe('actual 2026 reported results',()=>{
 it('preserves actual candidate counts and treats reporting units separately from vote shares',()=>{const races=normalizeResults(fixtures.Senate,'Senate');const ga=races.find(r=>r.state==='GA')!;expect(ga.total).toBe(3520276);expect(ga.pct_reporting).toBe(96.23);expect(ga.candidates[0]).toMatchObject({name:'Jon Ossoff',party:'D',votes:2082039,share:.5914});expect('winner' in ga).toBe(false)});
 it('matches the actual FL state-key response to its unique special election',()=>{const race=normalizeResults(fixtures.Senate,'Senate').find(r=>r.state==='FL');expect(race?.race_id).toBe('2026-senate-fl-special')});
 it('rejects mismatched years, offices and schema versions',()=>{for(const payload of [{...fixtures.Senate,year:2024},{...fixtures.Senate,office:'Governor'},{...fixtures.Senate,api:2}])expect(()=>normalizeResults(payload,'Senate')).toThrow()});
 it('never maps an ambiguous state key over two Senate contests',()=>{const fl=manifest.find(r=>r.office==='Senate'&&r.state==='FL')!;const races=[...manifest,{...fl,id:'second-fl',election_type:'regular'}] as Race[];expect(normalizeResults(fixtures.Senate,'Senate',races).some(r=>r.state==='FL')).toBe(false)});
 it('keeps real no-vote-yet shares null and independents independent',()=>{const races=normalizeResults(fixtures.Senate,'Senate');const id=races.find(r=>r.state==='ID')!;expect(id.total).toBe(0);expect(id.candidates[0].party).toBe('I');expect(id.candidates.every(c=>c.share===null)).toBe(true)});
 it('rejects negative or invalid vote counts',()=>{const payload={...fixtures.Senate,races:{GA:{...fixtures.Senate.races.GA,total:-1}}};expect(()=>normalizeResults(payload,'Senate')).toThrow('vote total')});
 it('tolerates extra fields and a genuinely empty result feed',()=>{expect(normalizeResults({...fixtures.Senate,new_field:'ignore',races:{}},'Senate')).toEqual([])});
 it('retains previous count timestamps when both public requests fail',async()=>{vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));const previous={fetched_at:'2026-11-04T02:55:00Z',as_of:fixtures.Senate.as_of,races:normalizeResults(fixtures.Senate,'Senate')};await expect(fetchResults(previous)).rejects.toThrow('offline');expect(previous.races[0].as_of).toBe(fixtures.Senate.as_of);vi.unstubAllGlobals()});
});
