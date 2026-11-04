import type {FeatureCollection,Geometry} from 'geojson';
import type {CountyLiveData,CountyLiveResult} from '../types/countyResults';
type Row=Record<string,unknown>;
const SOURCE='https://enr.elections.virginia.gov/results/public/virginia/elections/2026-November-General';
function row(v:unknown):Row{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid Virginia result object');return v as Row}
function array(v:unknown):Row[]{if(!Array.isArray(v))throw new Error('Invalid Virginia result array');return v.map(row)}
const text=(v:unknown)=>typeof v==='string'?v:'';
const key=(v:unknown)=>text(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function translated(v:unknown){if(typeof v==='string')return v;const a=array(v);return text(a.find(x=>x.languageId==='en')?.text??a[0]?.text)}
function count(v:unknown):number|null{if(v===null||v===undefined||v==='')return null;const n=Number(v);if(!Number.isInteger(n)||n<0)throw new Error('Invalid Virginia count');return n}
function party(v:unknown){const p=row(v);const code=text(p.abbreviation)||text(p.standardName);return ({dem:'D',democratic:'D',rep:'R',republican:'R',ind:'I',independent:'I',lib:'L'} as Record<string,string>)[code.toLowerCase()]??code}
export function normalizeVirginia(raw:unknown,geo:FeatureCollection<Geometry>,fetchedAt:string):CountyLiveData{
 const response=row(raw);const election=row(response.election);if(election.electionDate!=='2026-11-03'||election.isPrimary!==false)throw new Error('Virginia source is not the November 3, 2026 general election');
 const contest=row(response.ballotItemWithBreakdown);if(translated(contest.name)!=='Member, United States Senate')throw new Error('Virginia contest is not U.S. Senate');
 const sourceTime=text(election.asOf)||text(election.lastUpdated)||null;if(sourceTime&&!Number.isFinite(Date.parse(sourceTime)))throw new Error('Invalid Virginia source timestamp');
 const geometry=new Map(geo.features.map(f=>[String(f.id).padStart(5,'0'),f]));const normalized:CountyLiveResult[]=[];let skipped=0;
 for(const breakdown of array(contest.breakdownResults)){
  const locality=row(breakdown.locality);const countyName=translated(locality.name);const fipsSuffix=text(locality.mapFeatureId);if(!/^\d{3}$/.test(fipsSuffix)){skipped++;continue}const fips='51'+fipsSuffix;const boundary=geometry.get(fips);if(!boundary||key(boundary.properties?.name)!==key(countyName.replace(/ (COUNTY|CITY)$/i,''))){skipped++;continue}
  const total=count(breakdown.voteTotal);const options=array(breakdown.ballotOptions);if(total===null||!options.length||options.some(o=>o.voteCount==null)){skipped++;continue}
  const candidates=options.map(option=>{const name=translated(option.name);if(!name)throw new Error('Missing Virginia candidate name');const votes=count(option.voteCount);if(votes===null)throw new Error('Missing Virginia votes');return {name,party:party(option.party),votes,share:total>0?votes/total:null}}).sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name));
  if(candidates.some(c=>c.share!==null&&c.share>1))throw new Error('Virginia candidate votes exceed total');
  const reporting=breakdown.precinctReportingStatus?row(breakdown.precinctReportingStatus):null;
  normalized.push({fips,county:String(boundary.properties?.name??countyName),state:'VA',office:'Senate',year:2026,candidates,total,reported:count(reporting?.reportingUnits),reporting_total:count(reporting?.totalUnits),reporting_unit:reporting?'precincts':null,source_time:text(reporting?.asOf)||sourceTime,fetched_at:fetchedAt,source_url:SOURCE,source_name:'Virginia Department of Elections',status:total>0?'reporting':'awaiting'});
 }
 return {state:'VA',year:2026,election_date:'2026-11-03',fetched_at:fetchedAt,source_time:sourceTime,source_name:'Virginia Department of Elections',source_url:SOURCE,rows:normalized,status:skipped?'partial':normalized.length?'ok':'unavailable',message:`${normalized.length} Virginia county and independent-city Senate returns. Unofficial counts; no race calls.`};
}
