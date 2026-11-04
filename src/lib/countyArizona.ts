import type {FeatureCollection,Geometry} from 'geojson';
import type {CountyLiveData,CountyLiveResult} from '../types/countyResults';
export const ARIZONA_SOURCE='https://app.enhancedvoting.com/results/public/Arizona/elections/110326GeneralElection';
export const ARIZONA_API='https://app.enhancedvoting.com/results/public/api/elections/Arizona/110326GeneralElection/data/ballot-item/248c0000-c0a3-7204-3acd-08df11bc03cf?lang=en';
export const ARIZONA_REFRESH_MS=120000;
type Row=Record<string,unknown>;
function row(value:unknown):Row{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid Arizona data object');return value as Row}
function array(value:unknown):Row[]{if(!Array.isArray(value))throw new Error('Invalid Arizona data array');return value.map(row)}
const text=(value:unknown)=>typeof value==='string'?value:'';
function translated(value:unknown){if(typeof value==='string')return value;const values=array(value);return text(values.find(v=>v.languageId==='en')?.text??values[0]?.text)}
const countyKey=(value:string)=>value.replace(/ County$/,'').toLowerCase();
function count(value:unknown):number|null{if(value===null||value===undefined||value==='')return null;const n=Number(value);if(!Number.isInteger(n)||n<0)throw new Error('Invalid Arizona vote or reporting count');return n}
function sourceTime(value:unknown){const timestamp=text(value);if(timestamp&&!Number.isFinite(Date.parse(timestamp)))throw new Error('Invalid Arizona source timestamp');return timestamp||null}
function party(value:unknown){if(!value)return '';const data=row(value);const p=text(data.abbreviation)||text(data.standardName);return ({DEM:'D',REP:'R',IND:'I',LIB:'L',GRN:'G',NOL:'NOL',NON:'Other'} as Record<string,string>)[p.toUpperCase()]??p}
export function normalizeArizona(raw:unknown,geo:FeatureCollection<Geometry>,fetchedAt:string):CountyLiveData{
 const response=row(raw);const election=row(response.election);if(election.electionDate!=='2026-11-03'||election.isPrimary!==false)throw new Error('Arizona source is not the November 3, 2026 general election');
 const contest=row(response.ballotItemWithBreakdown);if(translated(contest.name)!=='Governor and Lieutenant Governor')throw new Error('Arizona contest is not the 2026 governor ticket');
 const time=sourceTime(election.asOf)||sourceTime(election.lastUpdated);const geometry=new Map(geo.features.map(feature=>[countyKey(text(feature.properties?.name)),String(feature.id).padStart(5,'0')]));
 const rows:CountyLiveResult[]=[];const seen=new Set<string>();let unmatched=0;
 for(const value of array(contest.breakdownResults)){
  const locality=row(value.locality);const county=translated(locality.name).replace(/ County$/,'');const feature=text(locality.mapFeatureId).replace(/ County$/,'')||county;const fips=geometry.get(countyKey(county));
  if(!fips||!/^04\d{3}$/.test(fips)||countyKey(feature)!==countyKey(county)){unmatched++;continue}if(seen.has(fips))throw new Error('Duplicate Arizona county identity');seen.add(fips);
  const total=count(value.voteTotal);const options=array(value.ballotOptions);if(total===null||!options.length||options.some(option=>option.voteCount==null)){unmatched++;continue}
  const candidates=options.map(option=>{const name=translated(option.name).replace(/\s*\((?:DEM|REP|IND|LIB|GRN|NOL|PND|NON)\)/g,'').trim();const votes=count(option.voteCount);if(!name||votes===null)throw new Error('Missing Arizona candidate identity or votes');if(votes>total)throw new Error('Arizona candidate votes exceed total');return {name,party:party(option.party),votes,share:total>0?votes/total:null}}).sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name));
  const reporting=value.precinctReportingStatus?row(value.precinctReportingStatus):null;
  rows.push({fips,county,state:'AZ',office:'Governor',year:2026,candidates,total,reported:count(reporting?.reportingUnits),reporting_total:count(reporting?.totalUnits),reporting_unit:reporting?'precincts':null,source_time:sourceTime(reporting?.asOf)||time,fetched_at:fetchedAt,source_url:ARIZONA_SOURCE,source_name:'Arizona Secretary of State',status:total>0?'reporting':'awaiting'});
 }
 return {state:'AZ',year:2026,election_date:'2026-11-03',fetched_at:fetchedAt,source_time:time,source_url:ARIZONA_SOURCE,source_name:'Arizona Secretary of State',rows,status:unmatched?'partial':rows.length?'ok':'unavailable',message:rows.length?`${rows.length} counties with official 2026 governor ticket counts. Source refresh limited to once every two minutes. Reporting is not certification.`:'No verified Arizona county governor counts published.'};
}
