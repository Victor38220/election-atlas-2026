// Compact the large publisher feeds once at the edge rather than transferring
// every county and candidate breakdown to each visitor every 30 seconds.
type Row=Record<string,unknown>;
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const fields=['nyt_id','election_date','office','office_id','race_type_id','type','seat_number','race_call_status','updated_at'] as const;
function compact(r:Row):Row{
 const result:Row={};for(const key of fields)result[key]=r[key];
 const unit=object(r.top_reporting_unit);result.top_reporting_unit={state_postal:unit.state_postal,provider_updated_at:unit.provider_updated_at};
 const outcome=object(r.outcome);result.outcome={won:outcome.won,called_by:outcome.called_by};
 const metadata=object(r.candidate_metadata),winner=Array.isArray(outcome.won)?outcome.won.filter((x):x is string=>typeof x==='string'):[];
 result.candidate_metadata=Object.fromEntries(winner.filter(x=>x in metadata).map(x=>[x,metadata[x]]));return result;
}
async function read(kind:'house'|'california'):Promise<{races:Row[]}>{
 const response=await fetch(`https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-${kind}.json`,{headers:{Accept:'application/json','User-Agent':'ElectionAtlas/1.0 public election research'},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(`Results ${kind} HTTP ${response.status}`);
 const payload=object(await response.json());if(!Array.isArray(payload.races))throw new Error(`Invalid ${kind} results`);
 const races=payload.races.map(object).filter(r=>kind==='house'?r.office_id==='H'&&r.election_date==='2026-11-03':r.nyt_id==='CA-Z-M-los_angeles-2026-11-03').map(compact);
 if((kind==='house'&&races.length<435)||(kind==='california'&&races.length!==1))throw new Error(`Incomplete ${kind} results`);
 return {races};
}
export async function notableResults():Promise<Response>{
 const [house,california]=await Promise.allSettled([read('house'),read('california')]);
 if(house.status==='rejected'&&california.status==='rejected')return Response.json({error:'Election results unavailable'},{status:502,headers:{'Cache-Control':'no-store'}});
 return Response.json({fetchedAt:new Date().toISOString(),house:house.status==='fulfilled'?house.value:null,california:california.status==='fulfilled'?california.value:null,errors:[...(house.status==='rejected'?['House unavailable']:[]),...(california.status==='rejected'?['California unavailable']:[])]},{headers:{'Cache-Control':house.status==='fulfilled'&&california.status==='fulfilled'?'public, max-age=30':'no-store','X-Content-Type-Options':'nosniff'}});
}
