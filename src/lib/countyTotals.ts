import type {CountyLiveData} from '../types/countyResults';
import type {RaceResult,ResultCandidate} from './results';
import races from '../../config/races.json';
/** Sum only distinct county reports from the same official feed and office. */
export function countyTotals(data:CountyLiveData|null):RaceResult[]{
 if(!data||data.status!=='ok'||data.year!==2026||data.election_date!=='2026-11-03')return [];
 return (['Senate','Governor'] as const).flatMap(office=>{const records=data.rows.filter(r=>r.office===office);const race=races.find(r=>r.state===data.state&&r.office===office);if(!race||!records.length||new Set(records.map(r=>r.fips)).size!==records.length)return [];
  const grouped=new Map<string,ResultCandidate>();let total=0;for(const row of records){if(row.total==null)continue;total+=row.total;for(const c of row.candidates){const key=c.party+'|'+c.name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');const old=grouped.get(key);grouped.set(key,{name:c.name,party:c.party,votes:c.votes+(old?.votes??0),share:null})}}
  const candidates=[...grouped.values()].map(c=>({...c,share:total>0?c.votes/total:null})).sort((a,b)=>b.votes-a.votes);
  const timestamps=records.map(r=>r.source_time).filter((t):t is string=>Boolean(t&&Number.isFinite(Date.parse(t))));
  return [{race_id:race.id,state:race.state,office,as_of:timestamps.sort().at(-1)??null,pct_reporting:null,total,candidates,stale:false,source_url:data.source_url}];
 });
}
