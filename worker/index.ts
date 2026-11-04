import raceManifest from '../config/races.json';
interface Env{ASSETS:Fetcher}
const HOSTS:Record<string,string>={polling:'https://www.pollingforecast.com/api/us',kalshi:'https://external-api.kalshi.com/trade-api/v2',polymarket:'https://gamma-api.polymarket.com',votehub:'https://api.votehub.com',clob:'https://clob.polymarket.com'};
const PATHS:Record<string,RegExp>={polling:/^\/(senate|governors|polls|pollsters|race\/[A-Z0-9-]+)$/,kalshi:/^\/(markets(?:\/[A-Z0-9-]+)?|events\/[A-Z0-9-]+|series(?:\/[A-Z0-9-]+)?)$/,polymarket:/^\/(markets(?:\/\d+)?|events(?:\/\d+)?|public-search|tags)$/,votehub:/^\/(polls|poll-types|pollsters|subjects)$/,clob:/^\/(midpoint|price)$/};
function targetFor(incoming:URL):{target:URL;provider:string}|null{
 const [,,provider,...rest]=incoming.pathname.split('/');const path='/'+rest.join('/');
 if(incoming.search.length>12000)return null;
 if(provider==='national'&&/^\/(Senate|Governor)$/.test(path))return {target:new URL('https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-'+(path==='/Senate'?'senate':'governor')+'.json'),provider:'countyTX'};
 if(provider==='counties'&&/^\/national\/[A-Z]{2}$/.test(path)){const state=path.split('/')[2];const race=raceManifest.find(r=>r.state===state);if(!race)return null;return {target:new URL('https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-'+race.state_name.toLowerCase().replace(/\s+/g,'-')+'.json'),provider:'countyTX'}}
 if(provider==='counties'&&/^\/TX\/(Senate|Governor)$/.test(path)){const race=path.endsWith('/Senate')?'us-senate':'governor';return {target:new URL('https://texianpartisan.com/api/results/election/tx-2026-general/counties?race='+race),provider:'countyTX'}}
 if(provider==='counties'&&path==='/VA')return {target:new URL('https://enr.elections.virginia.gov/results/public/api/elections/virginia/2026-November-General/data/ballot-item/01000000-f030-c43d-d69c-08df1fee529a?lang=en'),provider};
 if(provider==='counties'&&path==='/AZ')return {target:new URL('https://app.enhancedvoting.com/results/public/api/elections/Arizona/110326GeneralElection/data/ballot-item/248c0000-c0a3-7204-3acd-08df11bc03cf?lang=en'),provider:'countyAZ'};
 if(provider==='counties'&&path==='/OH')return {target:new URL('https://liveresults.ohiosos.gov/Api/v1/download?filename=VSSC1622XmlFileBlob'),provider:'countyOH'};
 if(provider==='counties'&&path==='/MN')return {target:new URL('https://raw.githubusercontent.com/Victor38220/election-atlas-2026/main/public/data/live-counties/MN.json'),provider:'counties'};
 if(provider==='counties'&&/^\/MN\/(results|counties)$/.test(path))return {target:new URL('https://electionresultsfiles.sos.mn.gov/20261103/'+(path.endsWith('/results')?'allracesbycounty.txt':'Cntytbl.txt')),provider:'countyText'};
 if(provider==='counties'&&path==='/CO/version')return {target:new URL('https://results.enr.clarityelections.com/CO/127407/current_ver.txt'),provider:'countyText'};
 if(provider==='counties'&&path==='/CO/report'){const version=incoming.searchParams.get('version')??'';if(!/^\d{5,12}$/.test(version))return null;return {target:new URL('https://results.enr.clarityelections.com/CO/127407/'+version+'/reports/detailxml.zip'),provider:'countyZip'}}
 if(provider==='counties'&&/^\/GA\/(Senate|Governor)$/.test(path)){const ids:Record<string,string>={Senate:'01000000-3a82-a359-4042-08df23e5ff36',Governor:'01000000-3a82-a359-0434-08df23e5ff46'};return {target:new URL('https://results.sos.ga.gov/results/public/api/elections/Georgia/11032026GeneralAndSpecialElection/data/ballot-item/'+ids[path.split('/')[2]]+'?lang=en'),provider}}
 if(provider==='counties'&&path==='/CA')return {target:new URL('https://media.sos.ca.gov/media/governor.json'),provider};
 if(provider==='counties'&&/^\/NC\/(metadata|candidates|results)$/.test(path)){const files:Record<string,string>={metadata:'county.txt',candidates:'results_0.txt',results:'precinct_0.txt'};const target=new URL('https://er.ncsbe.gov/enr/20261103/data/'+files[path.split('/')[2]]);target.searchParams.set('v',new Date().toISOString().slice(0,16).replace(/[^0-9]/g,''));return {target,provider}}
 if(provider==='results'&&/^\/(Senate|Governor)$/.test(path)){const target=new URL('https://openamerica.io/elections/results.json');target.searchParams.set('year','2026');target.searchParams.set('office',path.slice(1));return {target,provider}}
 if(provider==='archive'&&/^\/(latest|history|metadata)$/.test(path))return {target:new URL('https://raw.githubusercontent.com/Victor38220/election-atlas-2026/main/public/data'+path+'.json'),provider};
 if(!Object.hasOwn(HOSTS,provider)||!PATHS[provider].test(path))return null;
 const target=new URL(HOSTS[provider]+path);target.search=incoming.search;return {target,provider};
}
async function proxy(target:URL,provider:string,ctx:ExecutionContext):Promise<Response>{
 const cacheKey=new Request(target.toString());const cache=caches.default;const hit=await cache.match(cacheKey);if(hit)return hit;
 try{
  const upstream=await fetch(target,{headers:{Accept:['countyText','countyZip','countyOH'].includes(provider)?'*/*':'application/json','User-Agent':'ElectionAtlas/1.0 public election research'},signal:AbortSignal.timeout(22000),redirect:'manual'});
  const headers=new Headers({'Content-Type':provider==='countyZip'?'application/zip':provider==='countyOH'?'application/xml':provider==='countyText'?'text/plain; charset=utf-8':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':upstream.ok?(provider==='countyAZ'?'public, max-age=120':provider==='countyOH'?'public, max-age=180':provider==='countyTX'?'public, max-age=30':(provider==='results'||provider==='counties'||provider==='countyText'||provider==='countyZip')?'public, max-age=60':'public, max-age=20'):'no-store'});const modified=upstream.headers.get('Last-Modified');if(modified)headers.set('Last-Modified',modified);const etag=upstream.headers.get('ETag');if(etag)headers.set('ETag',etag);const retry=upstream.headers.get('Retry-After');if(retry)headers.set('Retry-After',retry);
  if(!upstream.ok)return Response.json({error:`Provider returned HTTP ${upstream.status}`,provider},{status:upstream.status,headers});
  const response=new Response(upstream.body,{status:200,headers});ctx.waitUntil(cache.put(cacheKey,response.clone()));return response;
 }catch(exc){return Response.json({error:'Public data source unavailable',provider,detail:exc instanceof Error?exc.message:'Request failed'},{status:502,headers:{'Cache-Control':'no-store'}})}
}
export default {
 async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  const incoming=new URL(request.url);if(!incoming.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  if(request.method!=='GET')return Response.json({error:'Only public GET data is supported'},{status:405});
  if(incoming.pathname==='/api/counties/CO'){
   const versionResponse=await proxy(new URL('https://results.enr.clarityelections.com/CO/127407/current_ver.txt'),'countyText',ctx);if(!versionResponse.ok)return versionResponse;
   const version=(await versionResponse.text()).trim();if(!/^\d{5,12}$/.test(version))return Response.json({error:'Invalid Colorado report version'},{status:502});
   return proxy(new URL('https://results.enr.clarityelections.com/CO/127407/'+version+'/reports/detailxml.zip'),'countyZip',ctx);
  }
  if(incoming.pathname==='/api/batch'){
   if(incoming.search.length>12000)return Response.json({error:'Query too long'},{status:400});
   let paths:unknown;try{paths=JSON.parse(incoming.searchParams.get('paths')??'null')}catch{return Response.json({error:'Invalid batch paths'},{status:400})}
   if(!Array.isArray(paths)||paths.length<1||paths.length>12||paths.some(p=>typeof p!=='string'||!p.startsWith('/api/')||p.startsWith('//')||p.includes('#')))return Response.json({error:'Expected 1–12 relative public API paths'},{status:400});
   const targets=paths.map(path=>targetFor(new URL(path,incoming.origin)));
   if(targets.some(t=>!t||['countyText','countyZip','countyOH'].includes(t.provider)))return Response.json({error:'Unknown public data route in batch'},{status:400});
   const cacheKey=new Request(incoming.toString());const hit=await caches.default.match(cacheKey);if(hit)return hit;
   let failed=false;
   // Keep provider bodies as JSON text: no parsing/re-serialization of large payloads on the free Worker CPU budget.
   const bodies=await Promise.all(targets.map(async(item)=>{const response=await proxy(item!.target,item!.provider,ctx);if(!response.ok){failed=true;return JSON.stringify({error:'Provider request failed',status:response.status,provider:item!.provider})}return response.text()}));
   const response=new Response('['+bodies.join(',')+']',{headers:{'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':failed?'no-store':'public, max-age=20'}});
   if(!failed)ctx.waitUntil(caches.default.put(cacheKey,response.clone()));return response;
  }
  const resolved=targetFor(incoming);if(!resolved)return Response.json({error:'Unknown public data route'},{status:404});
  // Fixed hosts and paths; visitors cannot use this endpoint as an arbitrary proxy.
  return proxy(resolved.target,resolved.provider,ctx);
 }
} satisfies ExportedHandler<Env>;
