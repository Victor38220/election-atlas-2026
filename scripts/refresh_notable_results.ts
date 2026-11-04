import {readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const dataRoot=new URL('../public/data/',import.meta.url);
async function read(name:string){try{return JSON.parse(await readFile(new URL(name,dataRoot),'utf8'))}catch{return null}}
async function save(name:string,data:unknown){const path=fileURLToPath(new URL(name,dataRoot));await writeFile(path+'.tmp',JSON.stringify(data)+'\n');await rename(path+'.tmp',path)}
async function source(name:string){
 const response=await fetch(`https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-${name}.json`,{headers:{Accept:'application/json','User-Agent':'ElectionAtlas/1.0 public election research'},signal:AbortSignal.timeout(22000)});
 if(!response.ok)throw new Error(`HTTP ${response.status}`);const data=await response.json() as {races?:unknown};if(!Array.isArray(data.races))throw new Error('Invalid race feed');return data.races as Record<string,unknown>[];
}
const previous=await read('notable-results.json');const notable=await read('notable-races.json');
const ids=(notable?.races??[]).flatMap((race:{id?:string})=>{const match=/^KXHOUSERACE-([A-Z]{2})(\d{2}|AL)-26$/.exec(race.id??'');return match?[`${match[1]}-G-H-${match[2]==='AL'?'1':Number(match[2])}-2026-11-03`]:[]});
const attemptedAt=new Date().toISOString();const errors:Record<string,string>={};let house=previous?.house??null,california=previous?.california??null;let houseFetchedAt=previous?.houseFetchedAt??null,californiaFetchedAt=previous?.californiaFetchedAt??null;
await Promise.all([
 (async()=>{try{if(!ids.length)throw new Error('No archived notable House race identifiers');const races=(await source('house')).filter(r=>ids.includes(String(r.nyt_id)));if(races.length!==new Set(ids).size)throw new Error('Incomplete notable House race rows');house={races};houseFetchedAt=new Date().toISOString()}catch(error){errors.house=String(error)}})(),
 (async()=>{try{const races=(await source('california')).filter(r=>r.nyt_id==='CA-Z-M-los_angeles-2026-11-03');if(races.length!==1)throw new Error('Los Angeles mayor race missing');california={races};californiaFetchedAt=new Date().toISOString()}catch(error){errors.california=String(error)}})(),
]);
if(house||california)await save('notable-results.json',{fetchedAt:attemptedAt,houseFetchedAt,californiaFetchedAt,house,california,errors});
console.log(JSON.stringify({provider:'notable_results',status:Object.keys(errors).length?'partial':'ok',house_races:house?.races?.length??0,california_races:california?.races?.length??0,houseFetchedAt,californiaFetchedAt,errors}));
