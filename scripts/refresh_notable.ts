import {readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {notableRaces} from '../worker/notable.ts';

const dataRoot=new URL('../public/data/',import.meta.url);
type Market={provider:string;outcomes:unknown[];retained?:boolean};
type Race={id:string;title:string;markets:Market[];news:unknown[];polls?:unknown[];pollsRetained?:boolean};
type Snapshot={updatedAt:string;methodology:string;races:Race[];polling_status?:{house?:string;la?:string};polymarket_status?:string};
function valid(value:unknown):value is Snapshot{
 if(!value||typeof value!=='object')return false;
 const v=value as Snapshot;
 return typeof v.updatedAt==='string'&&Number.isFinite(Date.parse(v.updatedAt))&&typeof v.methodology==='string'&&Array.isArray(v.races)&&v.races.length>0&&v.races.every(r=>r&&typeof r.id==='string'&&typeof r.title==='string'&&Array.isArray(r.news)&&Array.isArray(r.markets)&&r.markets.length>0&&r.markets.every(m=>typeof m.provider==='string'&&Array.isArray(m.outcomes)));
}
// A successful empty poll response clears old polls. Only an explicit source
// error preserves matching prior observations, marked for display as saved data.
export function selectNotableSnapshot(next:unknown,previous:unknown,cacheControl:string|null):Snapshot{
 if(cacheControl?.includes('no-store'))throw new Error('Incomplete notable race ranking');
 if(!valid(next))throw new Error('Invalid or empty notable race snapshot');
 if(!valid(previous))return next;
 return {...next,races:next.races.map(r=>{
  const source=r.id==='KXMAYORLA-26'?'la':r.id.startsWith('KXHOUSERACE-')?'house':null;
  const old=previous.races.find(p=>p.id===r.id);let result=r;
  if(source&&next.polling_status?.[source]==='error'&&old?.polls?.length)result={...result,polls:old.polls,pollsRetained:true};
  const savedMarket=old?.markets.find(m=>m.provider==='Polymarket');
  if(source==='la'&&next.polymarket_status==='error'&&savedMarket&&!result.markets.some(m=>m.provider==='Polymarket'))result={...result,markets:[...result.markets,{...savedMarket,retained:true}]};
  return result;
 })};
}
async function save(name:string,value:unknown){const file=fileURLToPath(new URL(name,dataRoot));await writeFile(file+'.tmp',JSON.stringify(value)+'\n');await rename(file+'.tmp',file)}
async function read(name:string){try{return JSON.parse(await readFile(new URL(name,dataRoot),'utf8'))}catch{return null}}
export async function refreshNotable(){
 const previous=await read('notable-races.json');const attemptedAt=new Date().toISOString();
 try{
  const response=await notableRaces();if(!response.ok)throw new Error(`Notable races returned HTTP ${response.status}`);
  const next=selectNotableSnapshot(await response.json(),previous,response.headers.get('Cache-Control'));
  await save('notable-races.json',next);
  const partial=next.polling_status?.house==='error'||next.polling_status?.la==='error'||next.polymarket_status==='error';
  const status=partial?'partial':'ok';
  await save('notable-archive-status.json',{status,last_attempt:attemptedAt,last_success:next.updatedAt,races:next.races.length,polling_status:next.polling_status??null,polymarket_status:next.polymarket_status??null});
  console.log(JSON.stringify({provider:'notable_races',status,races:next.races.length,updated_at:next.updatedAt}));
 }catch(error){
  const message=error instanceof Error?error.message:String(error);const retained=valid(previous);
  await save('notable-archive-status.json',{status:'error',last_attempt:attemptedAt,last_success:retained?previous.updatedAt:null,retained_last_good:retained,error:message});
  console.error(JSON.stringify({provider:'notable_races',status:'error',retained_last_good:retained,error:message}));
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await refreshNotable();
