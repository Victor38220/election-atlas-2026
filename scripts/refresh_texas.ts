import {readFile,rename,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {normalizeTexas} from '../src/lib/countyTexas.ts';

const root=new URL('../',import.meta.url);
const output=new URL('public/data/live-counties/TX.json',root);

async function getRace(race:string):Promise<unknown>{
 let failure:unknown;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch('https://texianpartisan.com/api/results/election/tx-2026-general/counties?race='+race,{headers:{Accept:'application/json','User-Agent':'ElectionAtlas/1.0 public election research'},signal:AbortSignal.timeout(22000)});
   if(!response.ok){
    const error=new Error(`Texas ${race} mirror returned HTTP ${response.status}`);
    if(response.status!==429&&response.status<500)throw Object.assign(error,{permanent:true});
    const retry=response.headers.get('Retry-After');
    if(retry&&attempt<2){const seconds=/^\d+$/.test(retry)?Number(retry):Math.max(0,(Date.parse(retry)-Date.now())/1000);if(Number.isFinite(seconds))await new Promise(resolve=>setTimeout(resolve,Math.min(seconds,60)*1000))}
    throw error;
   }
   return await response.json();
  }catch(error){failure=error;if(error&&typeof error==='object'&&'permanent'in error)break;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,1000*2**attempt))}
 }
 throw failure;
}

try{
 const [Senate,Governor,boundaries]=await Promise.all([getRace('us-senate'),getRace('governor'),readFile(new URL('public/geo/counties/TX.json',root),'utf8')]);
 const data=normalizeTexas({election_date:'2026-11-03',Senate,Governor},JSON.parse(boundaries),new Date().toISOString());
 if(data.status!=='ok'||data.rows.length!==508||new Set(data.rows.map(row=>row.fips)).size!==254)throw new Error('Texas mirror did not validate all 254 counties and both contests');
 const temporary=fileURLToPath(output)+'.tmp';
 await writeFile(temporary,JSON.stringify(data)+'\n');await rename(temporary,output);
 console.log(JSON.stringify({provider:'texas_counties',status:'ok',counties:254,rows:data.rows.length,source_time:data.source_time,fetched_at:data.fetched_at}));
}catch(error){
 console.error(JSON.stringify({provider:'texas_counties',status:'error',retained_last_good:true,error:error instanceof Error?error.message:String(error)}));
}
