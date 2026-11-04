import {describe,it,expect} from 'vitest';
import {normalizeChamber,validateChamberCompleteness} from './chambers';
import rawFixture from '../../tests/fixtures/chambers.json';
type TestRace={nyt_id:string;election_date:string;office_id:string;race_type_id:string;type:string;seat_number:string|null;race_call_status:string|null;updated_at:string;top_reporting_unit:{state_postal:string;provider_updated_at:string};candidate_metadata:Record<string,{party:{nyt_id:string}}>;outcome:{called_by:string[];won:string[];gained:boolean|null}};
const fixture=rawFixture as unknown as {house:{races:TestRace[]};senate:{races:TestRace[];partyControlData:{results:{offices:{S:{party_balance:{DEM:{no_election:number}}}}}[]}}};
const stamp='2026-11-04T05:00:00Z';
describe('published congressional seats',()=>{
 it('excludes the national aggregate and preserves only explicit AP calls',()=>{
  const house=structuredClone(fixture.house);
  const first=house.races[1];first.outcome.called_by=['nyt'];first.outcome.gained=true;
  const result=normalizeChamber(house,'House',stamp);
  expect(result.seats).toHaveLength(2);expect(result.total).toBe(435);expect(result.majority).toBe(218);
  expect(result.seats[0]).toMatchObject({state:'AL',district:'1',called:false,winner_name:null,winner_party:null,flip:null,called_at:null});
  expect(result.seats[1].called).toBe(true);
 });
 it('includes special general Senate seats and publishes the valid continuing baseline',()=>{
  const senate=normalizeChamber(fixture.senate,'Senate',stamp);
  expect(senate.seats.map(s=>s.state)).toEqual(['AL','FL','OH']);
  expect(senate.continuing).toEqual([{party:'D',label:'Democratic / aligned',count:34},{party:'R',label:'Republican',count:31}]);
  expect(senate).toMatchObject({total:100,majority:51});
  expect(senate.seats[0]).toMatchObject({called:true,winner_name:'Barry Moore',winner_party:'R',previous_party:'R',flip:false});
 });
 it('rejects invalid baseline, primaries, special House duplicates, wrong years and territories',()=>{
  const senate=structuredClone(fixture.senate);senate.partyControlData.results[0].offices.S.party_balance.DEM.no_election=35;
  expect(normalizeChamber(senate,'Senate',stamp).continuing).toEqual([]);
  const house=structuredClone(fixture.house);const base=house.races[1];
  house.races.push({...base,nyt_id:'special',race_type_id:'W'},{...base,nyt_id:'primary',race_type_id:'P'},{...base,nyt_id:'old',election_date:'2024-11-05'},{...base,nyt_id:'delegate',top_reporting_unit:{...base.top_reporting_unit,state_postal:'PR'}});
  expect(normalizeChamber(house,'House',stamp).seats).toHaveLength(2);
 });
 it('keeps missing and non-major-party identities distinct and rejects ambiguous winners',()=>{
  const house=structuredClone(fixture.house);const race=house.races[1];const winner=race.outcome.won[0];
  race.candidate_metadata[winner].party.nyt_id='IND';race.outcome.gained=true;
  expect(normalizeChamber(house,'House',stamp).seats[0]).toMatchObject({winner_party:'I',flip:true});
  race.outcome.won.push('unknown');expect(normalizeChamber(house,'House',stamp).seats[0]).toMatchObject({called:false,flip:null,winner_party:null});
 });
 it('rejects malformed and incomplete feeds and duplicate seats',()=>{
  expect(()=>normalizeChamber({},'House',stamp)).toThrow('race array');
  const partial=normalizeChamber(fixture.house,'House',stamp);
  expect(()=>validateChamberCompleteness(partial)).toThrow('expected 435');
  const duplicate=structuredClone(fixture.house);duplicate.races.push(structuredClone(duplicate.races[1]));
  expect(()=>normalizeChamber(duplicate,'House',stamp)).toThrow('Duplicate House seat');
  const senate=normalizeChamber(fixture.senate,'Senate',stamp);
  senate.seats=Array.from({length:35},(_,i)=>({...senate.seats[0],id:String(i)}));senate.continuing=[];
  expect(()=>validateChamberCompleteness(senate)).toThrow('continuing seats');
 });
 it('includes Louisiana nonpartisan general contests',()=>{
  const house=structuredClone(fixture.house);house.races[1].top_reporting_unit.state_postal='LA';house.races[1].race_type_id='L';house.races[1].type='Nonpartisan Election';
  expect(normalizeChamber(house,'House',stamp).seats.some(s=>s.state==='LA')).toBe(true);
 });
 it('retains 435 distinct districts while excluding the national aggregate',()=>{
  const house=structuredClone(fixture.house);const template=house.races[1];
  house.races=[house.races[0],...Array.from({length:435},(_,i)=>({...structuredClone(template),nyt_id:`AL-G-H-${i+1}`,seat_number:String(i+1)}))];
  const normalized=normalizeChamber(house,'House',stamp);
  expect(normalized.seats).toHaveLength(435);
  expect(()=>validateChamberCompleteness(normalized)).toThrow('invalid AL districts');
 });
});
