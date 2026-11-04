import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {normalizeNationalCounties,normalizeNationalResults,nationalUrl} from '../src/lib/countyNational.ts';
import {normalizeApCalls} from '../src/lib/apCalls.ts';
import type {Race} from '../src/types/index.ts';

const root=new URL('../',import.meta.url);
const races=JSON.parse(await readFile(new URL('config/races.json',root),'utf8')) as Race[];
const dataRoot=new URL('public/data/',root);
async function read(name:string){try{return JSON.parse(await readFile(new URL(name,dataRoot),'utf8'))}catch{return null}}
async function save(name:string,data:unknown){const target=fileURLToPath(new URL(name,dataRoot));await mkdir(new URL('.',new URL(name,dataRoot)),{recursive:true});await writeFile(target+'.tmp',JSON.stringify(data)+'\n');await rename(target+'.tmp',target)}
async function request(url:string):Promise<unknown>{
 let failure:unknown;
 for(let attempt=0;attempt<3;attempt++){
  try{const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'ElectionAtlas/1.0 public election research'},signal:AbortSignal.timeout(22000)});if(!response.ok){const error=new Error('HTTP '+response.status);if(response.status!==429&&response.status<500)throw Object.assign(error,{permanent:true});const retry=response.headers.get('Retry-After');if(retry&&attempt<2){const seconds=/^\d+$/.test(retry)?Number(retry):Math.max(0,(Date.parse(retry)-Date.now())/1000);if(Number.isFinite(seconds))await new Promise(resolve=>setTimeout(resolve,Math.min(60,seconds)*1000))}throw error}return await response.json()}
  catch(error){failure=error;if(error&&typeof error==='object'&&'permanent'in error)break;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,1000*2**attempt))}
 }
 throw failure;
}
const previous=await read('results.json');
let reported=previous?.races??[];let calls=previous?.calls??[];const errors:string[]=[];
for(const office of ['Senate','Governor'] as const){
 try{const payload=await request(`https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-${office==='Senate'?'senate':'governor'}.json`);const fetchedAt=new Date().toISOString();const rows=normalizeNationalResults(payload,office,races);if(rows.length!==races.filter(r=>r.office===office).length)throw new Error('Incomplete national race roster');const observedCalls=normalizeApCalls(payload,office,races,fetchedAt).calls;reported=[...reported.filter((r:{office:string})=>r.office!==office),...rows];calls=[...calls.filter((c:{office:string})=>c.office!==office),...observedCalls];console.log(JSON.stringify({provider:'national_results',office,races:rows.length,ap_calls:observedCalls.length,status:'ok'}))}
 catch(error){errors.push(office+': '+String(error));console.error(JSON.stringify({provider:'national_results',office,status:'error',retained_last_good:true,error:String(error)}))}
}
await save('results.json',{fetched_at:new Date().toISOString(),as_of:reported.map((r:{as_of:string|null})=>r.as_of).filter(Boolean).sort().at(-1)??null,races:reported,calls,status:errors.length?'partial':'ok',errors});
const coverage:Record<string,unknown>={};
const pending=[...new Set(races.map(r=>r.state))];
async function collect(){for(let state=pending.shift();state;state=pending.shift()){
 const race=races.find(r=>r.state===state)!;const fetchedAt=new Date().toISOString();
 try{const [payload,geometry]=await Promise.all([request(nationalUrl(race.state_name)),readFile(new URL(`public/geo/${state==='AK'?'districts':'counties'}/${state}.json`,root),'utf8')]);const data=normalizeNationalCounties(payload,state,JSON.parse(geometry),fetchedAt,races);await save(`live-counties/${state}.json`,data);coverage[state]={status:data.status,geography_type:data.geography_type,offices:[...new Set(data.rows.map(r=>r.office))],counties:data.geography_type==='state_house_district'?0:new Set(data.rows.map(r=>r.fips)).size,districts:data.geography_type==='state_house_district'?new Set(data.rows.map(r=>r.fips)).size:0,reporting_counties:new Set(data.rows.filter(r=>r.status==='reporting').map(r=>r.fips)).size,rows:data.rows.length,source_time:data.source_time,fetched_at:data.fetched_at,source_url:data.source_url,message:data.message};console.log(JSON.stringify({provider:'national_counties',state,status:data.status,rows:data.rows.length,geographies:new Set(data.rows.map(r=>r.fips)).size}))}
 catch(error){const saved=await read(`live-counties/${state}.json`);coverage[state]={status:'error',retained_last_good:Boolean(saved),fetched_at:saved?.fetched_at??null,last_attempt:fetchedAt,error:String(error)};console.error(JSON.stringify({provider:'national_counties',state,status:'error',retained_last_good:Boolean(saved),error:String(error)}))}
}}
await Promise.all([collect(),collect(),collect()]);
await save('county-coverage.json',{generated_at:new Date().toISOString(),provider:'Reported election returns via The New York Times',states:coverage});
