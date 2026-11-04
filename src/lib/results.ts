import type {Office,Race} from '../types';
import manifest from '../../config/races.json';
import {getJSON,numeric,probability} from './live';
export interface ResultCandidate{name:string;party:string;votes:number;share:number|null}
export interface RaceResult{race_id:string;state:string;office:Office;as_of:string|null;pct_reporting:number|null;total:number;candidates:ResultCandidate[];stale:boolean;source_url:string}
export interface ResultsData{fetched_at:string;as_of:string|null;races:RaceResult[];status?:'ok'|'partial';errors?:string[]}
export const RESULTS_ATTRIBUTION='Official state election offices via Open America';
export const RESULTS_DOCS='https://openamerica.io/elections/api/';
export const RESULTS_STATES=['AR','AZ','CO','CT','FL','GA','IA','ID','IN','LA','MI','MN','NC','PA','RI','SC','TX','UT','VA','VT','WA','WV'];
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid results object');return value as Record<string,unknown>}
function text(value:unknown){return typeof value==='string'?value:''}
function integer(value:unknown,label:string){const n=numeric(value);if(n===null||!Number.isInteger(n)||n<0)throw new Error('Invalid '+label);return n}
export function normalizeResults(payload:unknown,office:Office,races:Race[]=manifest as Race[]):RaceResult[]{
 const data=record(payload);
 if(data.api!==1||data.year!==2026||data.office!==office)throw new Error('Unexpected election results API version, year or office');
 if(typeof data.stale!=='boolean'||typeof data.counting!=='boolean')throw new Error('Invalid results freshness metadata');
 const sourceTimestamp=text(data.as_of);if(sourceTimestamp&&!Number.isFinite(Date.parse(sourceTimestamp)))throw new Error('Invalid source timestamp');
 const result:RaceResult[]=[];
 for(const [key,value] of Object.entries(record(data.races))){
  const match=/^([A-Z]{2})(?:-(special))?$/.exec(key);if(!match)continue;
  const matches=races.filter(r=>r.year===2026&&r.office===office&&r.state===match[1]&&(!match[2]||r.election_type==='special'));
  // Some live feeds use FL rather than documented FL-special. Accept only a unique
  // canonical contest for that state and office; never overwrite a second seat.
  if(matches.length!==1)continue;
  const raw=record(value);if(!Array.isArray(raw.cands))throw new Error('Invalid result candidate list');
  const total=integer(raw.total,'vote total');const candidates=raw.cands.map(value=>{const c=record(value);const name=text(c.n);if(!name)throw new Error('Missing result candidate name');const votes=integer(c.v,'candidate vote count');let share:number|null=null;if(c.pct!==null&&c.pct!==undefined){const reported=numeric(c.pct);if(reported===null||reported<0||reported>100)throw new Error('Invalid candidate share');share=probability(reported/100)}if(total===0)share=null;return {name,party:text(c.p),votes,share}});
  const reporting=raw.pct_in==null?null:numeric(raw.pct_in);if((raw.pct_in!=null&&reporting===null)||(reporting!==null&&(reporting<0||reporting>100)))throw new Error('Invalid reporting percentage');
  result.push({race_id:matches[0].id,state:matches[0].state,office,as_of:sourceTimestamp||null,pct_reporting:reporting,total,candidates,stale:data.stale,source_url:'https://openamerica.io/elections/results.json?year=2026&office='+office});
 }
 return result;
}
export async function fetchResults(previous:ResultsData|null,signal?:AbortSignal):Promise<ResultsData>{
 const fetched_at=new Date().toISOString();const errors:string[]=[];let races=[...(previous?.races??[])];
 const offices=['Senate','Governor'] as const;
 const payload=await getJSON('/api/batch?'+new URLSearchParams({paths:JSON.stringify(offices.map(office=>'/api/results/'+office))}),signal);
 if(!Array.isArray(payload)||payload.length!==2)throw new Error('Incomplete results batch');
 const outcomes=await Promise.allSettled(offices.map(async(office,index)=>{const raw=record(payload[index]);if(raw.error)throw new Error(String(raw.error));return {office,races:normalizeResults(raw,office)}}));
 for(let index=0;index<outcomes.length;index++){const value=outcomes[index];const office=index===0?'Senate':'Governor';if(value.status==='fulfilled')races=[...races.filter(r=>r.office!==value.value.office),...value.value.races];else errors.push(`${office}: ${String(value.reason)}`)}
 if(errors.length===2)throw new Error(errors.join('; '));
 return {fetched_at,as_of:races.map(r=>r.as_of).filter((value):value is string=>value!==null).sort().at(-1)??null,races,status:errors.length?'partial':'ok',errors};
}

export function reportedLeader(result:RaceResult|undefined){
 if(!result||result.total<=0)return null;
 const sorted=[...result.candidates].sort((a,b)=>b.votes-a.votes);
 if(!sorted[0]||sorted[0].votes<=0||sorted[0].votes===sorted[1]?.votes)return null;
 return sorted[0];
}
