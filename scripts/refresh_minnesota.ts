import {readFile,rename,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {normalizeMinnesota} from '../src/lib/countyMinnesota.ts';

const root=new URL('../',import.meta.url);
const source=new URL('https://electionresultsfiles.sos.mn.gov/20261103/');
const output=new URL('public/data/live-counties/MN.json',root);
const headers={'Accept':'text/plain','User-Agent':'ElectionAtlas/1.0 public election research'};

async function getText(filename:string):Promise<{text:string;modified:string|null}>{
 let failure:unknown;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch(new URL(filename,source),{headers,signal:AbortSignal.timeout(30000)});
   if(!response.ok){
    const error=new Error(`Minnesota ${filename} returned HTTP ${response.status}`);
    if(response.status!==429&&response.status<500)throw Object.assign(error,{permanent:true});
    const retry=response.headers.get('Retry-After');
    if(retry&&attempt<2){const seconds=/^\d+$/.test(retry)?Number(retry):Math.max(0,(Date.parse(retry)-Date.now())/1000);if(Number.isFinite(seconds))await new Promise(resolve=>setTimeout(resolve,Math.min(seconds,60)*1000))}
    throw error;
   }
   const text=await response.text();
   if(!text.trim()||text.trimStart().startsWith('<'))throw Object.assign(new Error(`Minnesota ${filename} did not return a text results file`),{permanent:true});
   return {text,modified:response.headers.get('Last-Modified')};
  }catch(error){failure=error;if(error&&typeof error==='object'&&'permanent'in error)break;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,1000*2**attempt))}
 }
 throw failure;
}

try{
 const [results,counties,boundaries]=await Promise.all([getText('allracesbycounty.txt'),getText('Cntytbl.txt'),readFile(new URL('public/geo/counties/MN.json',root),'utf8')]);
 const fetchedAt=new Date().toISOString();
 const data=normalizeMinnesota({election_date:'2026-11-03',results:results.text,counties:counties.text,source_time:results.modified},JSON.parse(boundaries),fetchedAt);
 if(data.status!=='ok'||data.rows.length!==174||new Set(data.rows.map(row=>row.fips)).size!==87)throw new Error('Minnesota refresh did not validate all 87 counties and both statewide contests');
 data.message='Official feed mirrored; updates about every 15 minutes. Unofficial November 3, 2026 county Senate and Governor returns.';
 const temporary=fileURLToPath(output)+'.tmp';
 await writeFile(temporary,JSON.stringify(data)+'\n');
 await rename(temporary,output);
 console.log(JSON.stringify({provider:'minnesota',status:'ok',counties:87,rows:data.rows.length,source_time:data.source_time,fetched_at:fetchedAt}));
}catch(error){
 // Keep the entire last successful snapshot, including its original timestamps.
 // Failure of this optional source must not prevent other sources from updating.
 console.error(JSON.stringify({provider:'minnesota',status:'error',retained_last_good:true,error:error instanceof Error?error.message:String(error)}));
}
