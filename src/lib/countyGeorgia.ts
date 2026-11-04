import type {FeatureCollection,Geometry} from 'geojson';
import type {Office} from '../types';
import type {CountyLiveData,CountyLiveResult} from '../types/countyResults';
type Row=Record<string,unknown>;
const SOURCE='https://results.sos.ga.gov/results/public/Georgia/elections/11032026GeneralAndSpecialElection';
const SOURCE_NAME='Georgia Secretary of State';
function row(v:unknown):Row{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid Georgia result object');return v as Row}
function array(v:unknown):Row[]{if(!Array.isArray(v))throw new Error('Invalid Georgia result array');return v.map(row)}
const text=(v:unknown)=>typeof v==='string'?v:'';
const key=(v:unknown)=>text(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function translated(v:unknown){if(typeof v==='string')return v;const a=array(v);return text(a.find(x=>x.languageId==='en')?.text??a[0]?.text)}
function count(v:unknown):number|null{if(v===null||v===undefined||v==='')return null;const n=Number(v);if(!Number.isInteger(n)||n<0)throw new Error('Invalid Georgia count');return n}
function candidateName(v:unknown){let name=translated(v);for(let i=0;i<3;i++)name=name.replace(/\s*\((?:Rep|Dem|Ind|Lib|I)\)\s*$/i,'');return name.trim()}
function party(v:unknown){const p=row(v);const code=text(p.abbreviation)||text(p.standardName);return ({dem:'D',rep:'R',ind:'I',lib:'L',gre:'G'} as Record<string,string>)[code.toLowerCase()]??code}
export function normalizeGeorgia(raw:unknown,geo:FeatureCollection<Geometry>,fetchedAt:string):CountyLiveData{
 const payload=row(raw);const geometry=new Map(geo.features.map(f=>[key(f.properties?.name),String(f.id).padStart(5,'0')]));
 const normalized:CountyLiveResult[]=[];const sourceTimes:string[]=[];let skipped=0;
 for(const office of ['Senate','Governor'] as const){if(!payload[office])continue;const response=row(payload[office]);const election=row(response.election);if(election.electionDate!=='2026-11-03'||election.isPrimary!==false)throw new Error('Georgia source is not the November 3, 2026 general election');
  const contest=row(response.ballotItemWithBreakdown);const expected=office==='Senate'?'US Senate':'Governor';if(translated(contest.name)!==expected)throw new Error('Georgia contest office mismatch');
  const sourceTime=text(election.asOf)||text(election.lastUpdated)||null;if(sourceTime&&!Number.isFinite(Date.parse(sourceTime)))throw new Error('Invalid Georgia source timestamp');if(sourceTime)sourceTimes.push(sourceTime);
  for(const breakdown of array(contest.breakdownResults)){
   const locality=row(breakdown.locality);const countyName=translated(locality.name).replace(/ County$/,'');const geographyName=text(locality.mapFeatureId)||countyName;
   const fips=geometry.get(key(geographyName));if(!fips||!fips.startsWith('13')||key(countyName)!==key(geographyName)){skipped++;continue}
   const total=count(breakdown.voteTotal);const options=array(breakdown.ballotOptions);if(total===null||!options.length||options.some(o=>o.voteCount==null)){skipped++;continue}
   const candidates=options.map(option=>{const name=candidateName(option.name);if(!name)throw new Error('Missing Georgia candidate identity');const votes=count(option.voteCount);if(votes===null)throw new Error('Missing Georgia votes');return {name,party:party(option.party),votes,share:total>0?votes/total:null}}).sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name));
   if(candidates.some(c=>c.share!==null&&(c.share<0||c.share>1)))throw new Error('Georgia candidate votes exceed total');
   const reporting=breakdown.precinctReportingStatus?row(breakdown.precinctReportingStatus):null;const countyTime=text(reporting?.asOf)||sourceTime;
   normalized.push({fips,county:String(geo.features.find(f=>String(f.id)===fips)?.properties?.name??countyName),state:'GA',office:office as Office,year:2026,candidates,total,reported:count(reporting?.reportingUnits),reporting_total:count(reporting?.totalUnits),reporting_unit:reporting?'precincts':null,source_time:countyTime,fetched_at:fetchedAt,source_url:SOURCE,source_name:SOURCE_NAME,status:total>0?'reporting':'awaiting'});
  }
 }
 if(!Object.keys(payload).some(k=>k==='Senate'||k==='Governor'))throw new Error('No Georgia election payload');
 return {state:'GA',year:2026,election_date:'2026-11-03',fetched_at:fetchedAt,source_time:sourceTimes.sort().at(-1)??null,source_name:SOURCE_NAME,source_url:SOURCE,rows:normalized,status:skipped?'partial':normalized.length?'ok':'unavailable',message:normalized.length?`${new Set(normalized.map(r=>r.fips)).size} counties with official 2026 returns. Unofficial counts; precinct reporting does not establish certification.`:'No county vote counts published.'};
}
