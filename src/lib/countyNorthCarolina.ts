import type {FeatureCollection,Geometry} from 'geojson';
import type {CountyLiveData,CountyLiveResult} from '../types/countyResults';
const SOURCE='https://er.ncsbe.gov/?election_dt=11/03/2026&county_id=0&office=FED&contest=0';
const SOURCE_NAME='North Carolina State Board of Elections';
type Row=Record<string,unknown>;
function row(value:unknown):Row{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid NCSBE data object');return value as Row}
function rows(value:unknown):Row[]{if(!Array.isArray(value))throw new Error('Invalid NCSBE data array');return value.map(row)}
const text=(v:unknown)=>typeof v==='string'?v:'';
const key=(v:unknown)=>text(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function count(v:unknown):number|null{if(v===null||v===undefined||v==='')return null;const n=Number(v);if(!Number.isInteger(n)||n<0)throw new Error('Invalid NCSBE vote/reporting count');return n}
function party(v:unknown){return ({DEM:'D',REP:'R',UNA:'I',IND:'I',LIB:'L',GRE:'G',CST:'C'} as Record<string,string>)[text(v)]??text(v)}
export function normalizeNorthCarolina(raw:unknown,geo:FeatureCollection<Geometry>,fetchedAt:string):CountyLiveData{
 const payload=row(raw);const metadata=rows(payload.county);const candidates=rows(payload.candidates);const results=rows(payload.results);
 if(!metadata.length||metadata.some(m=>!/^11\/03\/2026 UNOFFICIAL GENERAL ELECTION RESULTS/.test(text(m.tle))))throw new Error('NCSBE source is not the November 3, 2026 general election');
 const senate=candidates.filter(c=>/^US SENATE \(VOTE FOR 1\)$/.test(text(c.cnm))&&text(c.ogl)==='FED');
 const contestIds=new Set(senate.map(c=>text(c.lid)));if(contestIds.size!==1)throw new Error('No unique NCSBE U.S. Senate contest');
 const contestId=[...contestIds][0];const partyByName=new Map(senate.map(c=>[key(c.bnm),party(c.pty)]));
 const geometry=new Map(geo.features.map(f=>[key(f.properties?.name),String(f.id).padStart(5,'0')]));
 const counties=new Map(metadata.filter(m=>text(m.cid)!=='0').map(m=>[text(m.cid),m]));
 const byCounty=new Map<string,Row[]>();for(const r of results){if(text(r.lid)!==contestId)continue;const id=text(r.aid);if(!counties.has(id))continue;byCounty.set(id,[...(byCounty.get(id)??[]),r])}
 const normalized:CountyLiveResult[]=[];let unmatched=0;
 for(const [id,records] of byCounty){const meta=counties.get(id)!;const county=text(meta.cnm);const fips=geometry.get(key(county));if(!fips||!fips.startsWith('37')){unmatched++;continue}
  if(records.some(r=>key(r.anm)!==key(county)))throw new Error('NCSBE county identity mismatch');
  const observed=records.map(r=>{const name=text(r.bnm);if(!name||!partyByName.has(key(name)))throw new Error('Unknown NCSBE candidate identity');return {name,party:partyByName.get(key(name))!,votes:count(r.vct),reportedShare:text(r.pct)}});
  if(observed.some(c=>c.votes===null))throw new Error('NCSBE candidate votes missing; do not replace with zero');
  if(new Set(observed.map(c=>key(c.name))).size!==observed.length)throw new Error('Duplicate NCSBE candidate records');
  const total=observed.reduce((n,c)=>n+c.votes!,0);
  const candidateRows=observed.map(c=>{const pct=c.reportedShare.endsWith('%')?Number(c.reportedShare.slice(0,-1)):NaN;if(c.reportedShare&&(!Number.isFinite(pct)||pct<0||pct>100))throw new Error('Invalid NCSBE candidate share');return {name:c.name,party:c.party,votes:c.votes!,share:total>0?(Number.isFinite(pct)?pct/100:c.votes!/total):null}}).sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name));
  normalized.push({fips,county:geo.features.find(f=>String(f.id)===fips)?.properties?.name??county,state:'NC',office:'Senate',year:2026,candidates:candidateRows,total,reported:count(records[0].prt??meta.prt),reporting_total:count(records[0].ptl??meta.ptl),reporting_unit:'precincts',source_time:text(meta.imp)||text(meta.sub)||null,fetched_at:fetchedAt,source_url:`https://er.ncsbe.gov/?election_dt=11/03/2026&county_id=${id}&office=FED&contest=0`,source_name:SOURCE_NAME,status:total>0?'reporting':'awaiting'});
 }
 return {state:'NC',year:2026,election_date:'2026-11-03',fetched_at:fetchedAt,source_time:text(metadata.find(m=>text(m.cid)==='0')?.imp)||null,source_name:SOURCE_NAME,source_url:SOURCE,rows:normalized,status:unmatched?'partial':normalized.length?'ok':'unavailable',message:normalized.length?`${normalized.length} counties with official 2026 Senate returns. Unofficial election-night counts; reporting units are precincts.`:'No 2026 county Senate returns have been published.'};
}
