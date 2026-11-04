import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectNotableSnapshot} from './refresh_notable.ts';
const snapshot={updatedAt:'2026-11-04T00:00:00Z',methodology:'ranking',races:[{id:'KXMAYORLA-26',title:'Mayor',markets:[{provider:'Kalshi',outcomes:[]},{provider:'Polymarket',outcomes:[]}],polls:[{pollster:'A'}],news:[]},{id:'KXHOUSERACE-TX23-26',title:'House',markets:[{provider:'Kalshi',outcomes:[]}],polls:[{pollster:'B',fieldEnd:'2026-10-01'}],news:[]}]};
test('accepts a complete response',()=>{assert.deepEqual(selectNotableSnapshot(snapshot,null,'public, max-age=30'),snapshot)});
test('retains previous snapshot for incomplete rankings',()=>{
 assert.throws(()=>selectNotableSnapshot(snapshot,snapshot,'no-store'),/Incomplete/);
 assert.throws(()=>selectNotableSnapshot({...snapshot,races:[]},snapshot,'public'),/Invalid/);
});
test('retains prior polls only on explicit failure and keeps current market observation time',()=>{
 const next={...snapshot,updatedAt:'2026-11-04T01:00:00Z',polling_status:{house:'error',la:'ok'},races:snapshot.races.map(r=>({...r,polls:undefined}))};
 const selected=selectNotableSnapshot(next,snapshot,'public');assert.equal(selected.updatedAt,next.updatedAt);assert.deepEqual(selected.races[1].polls,snapshot.races[1].polls);assert.equal(selected.races[1].pollsRetained,true);assert.equal(selected.races[0].polls,undefined);
 const recovered=selectNotableSnapshot({...next,polling_status:{house:'ok',la:'ok'}},snapshot,'public');assert.equal(recovered.races[1].polls,undefined);
});
test('allows the ranking to change when LA falls out',()=>{const next={...snapshot,races:[snapshot.races[1]]};assert.deepEqual(selectNotableSnapshot(next,snapshot,'public'),next)});

test('retains the saved LA Polymarket only on explicit failure',()=>{
 const la=snapshot.races[0];const next={...snapshot,updatedAt:'2026-11-04T01:00:00Z',polymarket_status:'error',races:[{...la,markets:[la.markets[0]]},snapshot.races[1]]};
 const selected=selectNotableSnapshot(next,snapshot,'public');assert.equal(selected.updatedAt,next.updatedAt);assert.deepEqual(selected.races[0].markets[1],{...la.markets[1],retained:true});
 const recovered=selectNotableSnapshot({...next,polymarket_status:'ok'},snapshot,'public');assert.equal(recovered.races[0].markets.length,1);
});
