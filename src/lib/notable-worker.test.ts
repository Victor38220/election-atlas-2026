import {afterEach,describe,expect,it,vi} from 'vitest';
import {notableRaces} from '../../worker/notable';
const market=(name:string,volume:string,price:string,rules_primary:string)=>({yes_sub_title:name,volume_fp:volume,last_price_dollars:price,status:'active',rules_primary});
const event=(event_ticker:string,volume:string)=>({event_ticker,markets:[market('Candidate A',volume,'0.7',event_ticker.startsWith('KXHOUSERACE-') ? `If the House member sworn in for ${event_ticker.split('-')[1].slice(0,2)}-${event_ticker.split('-')[1].slice(2)} for the term beginning in 2027 is a member of the Democratic Party, then the market resolves to Yes.` : 'If Candidate A wins the 2026 Los Angeles Mayoral Election, then the market resolves to Yes.'),market('Candidate B','2','0.3','Unrecognized rules')]});
afterEach(()=>vi.unstubAllGlobals());
describe('notable market rankings',()=>{
 it('follows House pagination, excludes other years and primaries, and keeps volume in contracts',async()=>{
  const mocked=vi.fn(async(input:RequestInfo|URL)=>{
   const u=new URL(String(input));
   if(u.host==='gamma-api.polymarket.com')return Response.json({id:'57111',title:'Los Angeles Mayoral Election',slug:'los-angeles-mayoral-election-117',volume:1200,active:true,markets:[{question:'Will Nithya Raman win the 2026 Los Angeles mayoral election?',groupItemTitle:'Nithya Raman',outcomes:'["Yes","No"]',lastTradePrice:.9,active:true}]});
   if(u.searchParams.get('series_ticker')==='KXMAYORLA')return Response.json({events:[event('KXMAYORLA-26','100')],cursor:''});
   if(u.searchParams.get('cursor'))return Response.json({events:[event('KXHOUSERACE-TX23-26','20'),event('KXHOUSERACE-TX23-24','9999')],cursor:''});
   return Response.json({events:[event('KXHOUSERACE-CA01-26','40'),event('KXHOUSERACE-CA01-26-PRIMARY','9999')],cursor:'next'});
  });
  vi.stubGlobal('fetch',mocked);
  const response=await notableRaces(); const data=await response.json();
  expect(data.races.map((race:{id:string})=>race.id)).toEqual(['KXMAYORLA-26','KXHOUSERACE-CA01-26','KXHOUSERACE-TX23-26']);
  expect(data.races[0].markets[0].volumeContracts).toBe(102);
  expect(data.races[0].markets[0].outcomes.map((outcome:{name:string})=>outcome.name)).toEqual(['Candidate A']);
  expect(data.races[2].markets[0].outcomes.map((outcome:{name:string})=>outcome.name)).toEqual(['Democratic Party']);
  expect(data.races[0].markets[1].volumeUsd).toBe(1200);
  expect(data.methodology).toMatch(/not election results/);
  expect(mocked).toHaveBeenCalledTimes(4);
 });
 it('reports unavailable sources without fabricating a ranking',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:503})));
  expect((await notableRaces()).status).toBe(502);
 });
});
