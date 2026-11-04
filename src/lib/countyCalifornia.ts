import type {CountyLiveData,CountyLiveResult} from '../types/countyResults';
import type {ResultCandidate} from './results';
export const CALIFORNIA_SOURCE='https://media.sos.ca.gov/media/governor.json';
export const CALIFORNIA_SOURCE_NAME='California Secretary of State';
interface CountyGeo{features:{id?:unknown;properties?:{name?:unknown}|null}[]}
function object(raw:unknown):Record<string,unknown>{if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid California result row');return raw as Record<string,unknown>}
function text(raw:unknown){return typeof raw==='string'?raw:''}
function count(raw:unknown,label:string):number{const value=typeof raw==='string'?raw.replaceAll(',',''):raw;const n=Number(value);if(value===null||value===undefined||value===''||!Number.isInteger(n)||n<0)throw new Error('Invalid '+label);return n}
export function normalizeCalifornia(raw:unknown,geo:CountyGeo,fetchedAt:string):CountyLiveData{
 if(!Array.isArray(raw))throw new Error('Expected the official California result array');
 if(!geo||!Array.isArray(geo.features))throw new Error('Missing county geography');
 const counties=new Map<string,string>();
 for(const feature of geo.features){const name=feature.properties?.name;const id=String(feature.id??'');if(typeof name==='string'&&/^06\d{3}$/.test(id))counties.set(name,id)}
 const rows:CountyLiveResult[]=[];const seen=new Set<string>();let skipped=0;
 for(const value of raw){const row=object(value);const match=/^Governor - (.+) County Results$/.exec(text(row.raceTitle));if(!match)continue;
  const sourceTime=text(row.ReportingTime);if(!/^(November|December) \d{1,2}, 2026,/.test(sourceTime))throw new Error('California response is not in the 2026 general-election reporting window');
  const county=match[1],fips=counties.get(county);if(!fips){skipped++;continue}if(seen.has(fips))throw new Error('Duplicate California county result');seen.add(fips);
  if(!Array.isArray(row.candidates)||row.candidates.length===0)throw new Error('Missing California candidate counts');
  const observed=row.candidates.map(value=>{const candidate=object(value);const name=text(candidate.Name);if(!name)throw new Error('Missing California candidate name');const votes=count(candidate.Votes,'California vote count');return {raw:candidate,name,votes}});
  const total=observed.reduce((sum,c)=>sum+c.votes,0);
  const candidates:ResultCandidate[]=observed.map(candidate=>{const affiliation=text(candidate.raw.Party);const party=affiliation==='Dem'?'D':affiliation==='Rep'?'R':affiliation==='No Party Preference'?'I':affiliation;const percent=candidate.raw.Percent==null?null:Number(candidate.raw.Percent);if(percent!==null&&(!Number.isFinite(percent)||percent<0||percent>100))throw new Error('Invalid California candidate share');return {name:candidate.name,party,votes:candidate.votes,share:total>0?(percent===null?candidate.votes/total:percent/100):null}});
  const reporting=/\(([\d,]+)\s+of\s+([\d,]+)\)\s+(.+?)\s+reporting/i.exec(text(row.Reporting));
  const reported=reporting?count(reporting[1],'precinct reporting count'):null;const reportingTotal=reporting?count(reporting[2],'precinct total'):null;
  if(reported!==null&&reportingTotal!==null&&reported>reportingTotal)throw new Error('California reporting count exceeds total');
  rows.push({fips,county,state:'CA',office:'Governor',year:2026,candidates,total,reported,reporting_total:reportingTotal,reporting_unit:reporting?.[3]??null,source_time:sourceTime,fetched_at:fetchedAt,source_url:CALIFORNIA_SOURCE,source_name:CALIFORNIA_SOURCE_NAME,status:total>0?'reporting':'awaiting'});
 }
 if(!rows.length)throw new Error('No verified 2026 California county rows');
 const times=[...new Set(rows.map(row=>row.source_time).filter((time):time is string=>time!==null))];
 return {state:'CA',year:2026,election_date:'2026-11-03',fetched_at:fetchedAt,source_time:times.length===1?times[0]:null,source_name:CALIFORNIA_SOURCE_NAME,source_url:CALIFORNIA_SOURCE,rows,status:skipped?'partial':'ok',message:skipped?`${skipped} source counties did not match a verified FIPS identity.`:rows.every(row=>row.status==='awaiting')?'The official 2026 feed is initialized; no votes have been reported yet.':'Official reported 2026 governor counts. Precinct reporting is not a measure of votes counted.'};
}
