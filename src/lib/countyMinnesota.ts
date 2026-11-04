import type {FeatureCollection,Geometry} from 'geojson';
import type {CountyLiveData,CountyLiveResult} from '../types/countyResults';
import type {Office} from '../types';
const SOURCE='https://electionresultsfiles.sos.mn.gov/20261103/allracesbycounty.txt';
const key=(v:string)=>v.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const count=(v:string)=>{if(!/^\d+$/.test(v))throw new Error('Invalid Minnesota vote/reporting count');return Number(v)};
const party=(v:string)=>({DFL:'D',R:'R',IND:'I',LIB:'L',GP:'G',WI:''} as Record<string,string>)[v]??v;
export function normalizeMinnesota(raw:unknown,geo:FeatureCollection<Geometry>,fetchedAt:string):CountyLiveData{
 if(!raw||typeof raw!=='object'||!('election_date'in raw)||raw.election_date!=='2026-11-03'||!('results'in raw)||typeof raw.results!=='string'||!('counties'in raw)||typeof raw.counties!=='string')throw new Error('Minnesota source is not the November 3, 2026 general election');
 const sourceTime='source_time'in raw&&typeof raw.source_time==='string'?raw.source_time:null;if(sourceTime&&!Number.isFinite(Date.parse(sourceTime)))throw new Error('Invalid Minnesota source timestamp');
 const counties=new Map(raw.counties.trim().split(/\r?\n/).filter(Boolean).map(line=>{const fields=line.split(';');if(fields.length!==3||!/^\d{2}$/.test(fields[0]))throw new Error('Invalid Minnesota county table');return [fields[0],fields[1]]}));
 const geometry=new Map(geo.features.map(f=>[key(String(f.properties?.name??'')),f]));
 const groups=new Map<string,{county:string;office:Office;rows:string[][]}>();
 for(const line of raw.results.trim().split(/\r?\n/)){if(!line)continue;const fields=line.split(';');if(fields[0]!=='MN')throw new Error('Minnesota source state mismatch');if(!['U.S. Senator','Governor & Lt Governor'].includes(fields[4]))continue;if(fields.length!==16)throw new Error('Invalid Minnesota result layout');const county=counties.get(fields[1]);if(!county)throw new Error('Unknown Minnesota county identifier');const office:Office=fields[4]==='U.S. Senator'?'Senate':'Governor';const id=fields[1]+':'+office;const current=groups.get(id)??{county,office,rows:[]};current.rows.push(fields);groups.set(id,current)}
 if(!groups.size)throw new Error('No Minnesota Senate or governor results in source');
 const normalized:CountyLiveResult[]=[];let skipped=0;
 for(const group of groups.values()){const boundary=geometry.get(key(group.county));if(!boundary||!String(boundary.id).startsWith('27')){skipped++;continue}const total=count(group.rows[0][15]),reported=count(group.rows[0][11]),reportingTotal=count(group.rows[0][12]);
  if(group.rows.some(r=>count(r[15])!==total||count(r[11])!==reported||count(r[12])!==reportingTotal))throw new Error('Inconsistent Minnesota county reporting totals');
  const candidates=group.rows.map(r=>{const votes=count(r[13]);let share:number|null=null;if(total>0&&r[14]!==''){const n=Number(r[14]);if(!Number.isFinite(n)||n<0||n>100)throw new Error('Invalid Minnesota candidate share');share=n/100}if(!r[7])throw new Error('Missing Minnesota candidate identity');return {name:r[7],party:party(r[10]),votes,share}}).sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name));
  if(new Set(candidates.map(c=>c.name)).size!==candidates.length)throw new Error('Duplicate Minnesota candidate count');
  normalized.push({fips:String(boundary.id),county:String(boundary.properties?.name??group.county),state:'MN',office:group.office,year:2026,candidates,total,reported,reporting_total:reportingTotal,reporting_unit:'precincts',source_time:sourceTime,fetched_at:fetchedAt,source_url:SOURCE,source_name:'Minnesota Secretary of State',status:total>0?'reporting':'awaiting'});
 }
 return {state:'MN',year:2026,election_date:'2026-11-03',fetched_at:fetchedAt,source_time:sourceTime,source_name:'Minnesota Secretary of State',source_url:SOURCE,rows:normalized,status:skipped?'partial':normalized.length?'ok':'unavailable',message:`${new Set(normalized.map(r=>r.fips)).size} Minnesota counties with Senate and Governor returns. Source text files refresh every 15 minutes or less; unofficial counts.`};
}
