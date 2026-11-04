import type {FeatureCollection,Geometry} from 'geojson';
import type {Office} from '../types';
import type {CountyLiveData,CountyLiveResult} from '../types/countyResults';
export const COLORADO_SOURCE='https://results.enr.clarityelections.com/CO/127407/web.345435/';
export const COLORADO_VERSION='https://results.enr.clarityelections.com/CO/127407/current_ver.txt';
const COUNTY_PREFIX='08';
function count(value:string|null):number|null{if(value===null||value==='')return null;const n=Number(value);if(!Number.isInteger(n)||n<0)throw new Error('Invalid Colorado vote or reporting count');return n}
const party=(value:string)=>({DEM:'D',REP:'R',LBR:'L',LIB:'L',GRN:'G',IND:'I',UNA:'I'} as Record<string,string>)[value]??value;
export function normalizeColorado(raw:unknown,geo:FeatureCollection<Geometry>,fetchedAt:string):CountyLiveData{
 if(typeof raw!=='string')throw new Error('Expected official Colorado XML report');
 const xml=new DOMParser().parseFromString(raw,'application/xml');if(xml.querySelector('parsererror'))throw new Error('Invalid Colorado XML report');
 const root=xml.documentElement;if(root.tagName!=='ElectionResult'||root.querySelector(':scope > ElectionDate')?.textContent!=='11/3/2026'||root.querySelector(':scope > Region')?.textContent!=='CO')throw new Error('Colorado source is not the November 3, 2026 election');
 const sourceTime=root.querySelector(':scope > Timestamp')?.textContent?.trim()||null;
 const geometry=new Map(geo.features.map(feature=>[String(feature.properties?.name??''),String(feature.id).padStart(5,'0')]));const rows:CountyLiveResult[]=[];let missing=0;
 for(const [office,title] of [['Senate','United States Senator'],['Governor','Governor / Lieutenant Governor']] as const){
  const contests=Array.from(root.querySelectorAll(':scope > Contest')).filter(contest=>contest.getAttribute('text')===title);if(contests.length!==1)throw new Error('Colorado expected contest not uniquely identified');const contest=contests[0];
  const candidates=Array.from(contest.querySelectorAll(':scope > Choice')).map(choice=>{const types=Array.from(choice.querySelectorAll(':scope > VoteType')).filter(v=>v.getAttribute('name')==='Total Votes');if(types.length!==1)throw new Error('Colorado total-vote category missing');return {name:choice.getAttribute('text')??'',party:party(choice.getAttribute('party')??''),votes:new Map(Array.from(types[0].querySelectorAll(':scope > County')).map(county=>[county.getAttribute('name')??'',count(county.getAttribute('votes'))]))}});
  if(!candidates.length||candidates.some(c=>!c.name))throw new Error('Colorado candidate identity missing');const seen=new Set<string>();
  for(const county of Array.from(contest.querySelectorAll(':scope > ParticipatingCounties > County'))){const name=county.getAttribute('name')??'';const fips=geometry.get(name);if(!fips||!fips.startsWith(COUNTY_PREFIX)){missing++;continue}if(seen.has(fips))throw new Error('Duplicate Colorado county identity');seen.add(fips);
   if(candidates.some(c=>!c.votes.has(name)||c.votes.get(name)===null)){missing++;continue}const total=candidates.reduce((sum,c)=>sum+c.votes.get(name)!,0);
   const observed=candidates.map(c=>({name:c.name,party:c.party,votes:c.votes.get(name)!,share:total>0?c.votes.get(name)!/total:null})).sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name));
   rows.push({fips,county:name,state:'CO',office:office as Office,year:2026,candidates:observed,total,reported:count(county.getAttribute('precinctsReported')),reporting_total:count(county.getAttribute('precinctsParticipating')),reporting_unit:'precincts',source_time:sourceTime,fetched_at:fetchedAt,source_url:COLORADO_SOURCE,source_name:'Colorado Secretary of State',status:total>0?'reporting':'awaiting'});
  }
 }
 return {state:'CO',year:2026,election_date:'2026-11-03',fetched_at:fetchedAt,source_time:sourceTime,source_name:'Colorado Secretary of State',source_url:COLORADO_SOURCE,rows,status:missing?'partial':rows.length?'ok':'unavailable',message:`${new Set(rows.map(row=>row.fips)).size} counties with official 2026 Senate and governor ticket returns. Counts are unofficial; precinct reporting does not measure the share of ballots counted.`};
}
/** Decode the vendor's single-file ZIP with the browser's native decompressor. */
export async function unzipColoradoReport(buffer:ArrayBuffer):Promise<string>{
 const bytes=new Uint8Array(buffer);const view=new DataView(buffer);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(view.getUint32(i,true)===0x06054b50){end=i;break}}
 if(end<0)throw new Error('Invalid Colorado ZIP directory');const count=view.getUint16(end+10,true);let offset=view.getUint32(end+16,true);
 for(let entry=0;entry<count;entry++){
  if(offset+46>bytes.length||view.getUint32(offset,true)!==0x02014b50)throw new Error('Invalid Colorado ZIP entry');
  const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),length=view.getUint32(offset+20,true),nameLength=view.getUint16(offset+28,true),extraLength=view.getUint16(offset+30,true),commentLength=view.getUint16(offset+32,true),local=view.getUint32(offset+42,true);
  const name=new TextDecoder().decode(bytes.subarray(offset+46,offset+46+nameLength));
  if(name==='detail.xml'){
   if(flags&1||local+30>bytes.length||view.getUint32(local,true)!==0x04034b50)throw new Error('Unsupported Colorado ZIP entry');
   const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);const data=bytes.subarray(start,start+length);if(start+length>bytes.length)throw new Error('Truncated Colorado ZIP');
   if(method===0)return new TextDecoder().decode(data);if(method!==8)throw new Error('Unsupported Colorado compression');
   if(typeof DecompressionStream==='undefined')throw new Error('This browser cannot decompress the official report');
   const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(data);controller.close()}});
   return new Response(stream.pipeThrough(new DecompressionStream('deflate-raw'))).text();
  }
  offset+=46+nameLength+extraLength+commentLength;
 }
 throw new Error('Official Colorado detail.xml missing from ZIP');
}

export const unzipColorado=unzipColoradoReport;
