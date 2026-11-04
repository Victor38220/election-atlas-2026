import {describe,expect,it} from 'vitest';
import {normalizeNotableResults} from './notableResults';
import fixture from '../../tests/fixtures/notable-results.json';
describe('notable election calls',()=>{
 it('matches House and mayor results and identifies explicit AP calls only',()=>{
  const data=normalizeNotableResults(fixture.house,fixture.california);
  expect(data['KXHOUSERACE-TX23-26']).toMatchObject({status:'called',calledBy:'AP',winner:'Katy Padilla Stout'});
  expect(data['KXMAYORLA-26']).toMatchObject({status:'uncalled'});
  const race=structuredClone(fixture.house.races.find(r=>r.nyt_id==='TX-G-H-23-2026-11-03')!);
  race.outcome.called_by=['cnn'];
  expect(normalizeNotableResults({races:[race]},null)['KXHOUSERACE-TX23-26']).toBeUndefined();
 });
 it('does not infer a call from a closed market or another election',()=>{
  const race=structuredClone(fixture.house.races.find(r=>r.nyt_id==='TX-G-H-23-2026-11-03')!);
  race.election_date='2024-11-05';
  expect(normalizeNotableResults({races:[race]},null)).toEqual({});
 });
});
