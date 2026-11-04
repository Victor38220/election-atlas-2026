import type {NotableRace} from '../components/NotableRaces';
type Result=NonNullable<NotableRace['result']>;
type Row=Record<string,unknown>;
const row=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const strings=(v:unknown):string[]=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[];
const text=(v:unknown):string=>typeof v==='string'?v:'';
/** Preserve only an explicit AP call; a market resolution is not an election call. */
export function normalizeNotableResults(house:unknown,california:unknown):Record<string,Result>{
 const out:Record<string,Result>={};
 for(const [kind,raw] of [['house',house],['california',california]] as const){
  const races=row(raw).races;if(!Array.isArray(races))continue;
  for(const item of races){
   const r=row(item);if(r.election_date!=='2026-11-03')continue;
   let id='';
   if(kind==='house'&&r.office_id==='H'&&r.race_type_id==='G'&&r.type==='General'){
    const state=text(row(r.top_reporting_unit).state_postal),district=text(r.seat_number);
    if(/^[A-Z]{2}$/.test(state)&&/^\d{1,2}$/.test(district))id=`KXHOUSERACE-${state}${district.padStart(2,'0')}-26`;
   }else if(kind==='california'&&r.nyt_id==='CA-Z-M-los_angeles-2026-11-03'&&r.office==='Mayor')id='KXMAYORLA-26';
   if(!id)continue;
   const sourceUrl=kind==='house'?'https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-house.json':'https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-california.json';
   const outcome=row(r.outcome),won=strings(outcome.won),by=strings(outcome.called_by).map(v=>v.toLowerCase());
   const candidate=won.length===1?row(row(r.candidate_metadata)[won[0]]):{};
   const asOf=text(row(r.top_reporting_unit).provider_updated_at)||text(r.updated_at)||undefined;
   if(r.race_call_status==='called'&&by.includes('ap')&&won.length===1&&Object.keys(candidate).length){
    const winner=['first_name','middle_name','last_name','suffix'].map(key=>text(candidate[key])).filter(Boolean).join(' ');
    const partyId=text(row(candidate.party).nyt_id).toUpperCase();const party=partyId==='DEM'?'D':partyId==='GOP'?'R':partyId==='IND'?'I':undefined;
    out[id]={status:'called',calledBy:'AP',winner:winner||undefined,party,sourceUrl,asOf};
   }else if(r.race_call_status!=='called')out[id]={status:'uncalled',sourceUrl,asOf};
  }
 }
 return out;
}
