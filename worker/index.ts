interface Env{ASSETS:Fetcher}
const HOSTS:Record<string,string>={polling:'https://www.pollingforecast.com/api/us',kalshi:'https://external-api.kalshi.com/trade-api/v2',polymarket:'https://gamma-api.polymarket.com',votehub:'https://api.votehub.com',clob:'https://clob.polymarket.com'};
const PATHS:Record<string,RegExp>={polling:/^\/(senate|governors|polls|pollsters|counties|race\/[A-Z0-9-]+)$/,kalshi:/^\/(markets(?:\/[A-Z0-9-]+)?|events\/[A-Z0-9-]+|series(?:\/[A-Z0-9-]+)?)$/,polymarket:/^\/(markets(?:\/\d+)?|events(?:\/\d+)?|public-search|tags)$/,votehub:/^\/(polls|poll-types|pollsters|subjects)$/,clob:/^\/(midpoint|price)$/};
export default {
 async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  const incoming=new URL(request.url);if(!incoming.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  if(request.method!=='GET')return Response.json({error:'Only public GET data is supported'},{status:405});
  const [, ,provider,...rest]=incoming.pathname.split('/');const path='/'+rest.join('/');let target:URL;
  if(provider==='archive'&&/^\/(latest|history|metadata)$/.test(path)){target=new URL('https://raw.githubusercontent.com/Victor38220/election-atlas-2026/main/public/data'+path+'.json')}
  else {if(!Object.hasOwn(HOSTS,provider)||!PATHS[provider].test(path))return Response.json({error:'Unknown public data route'},{status:404});target=new URL(HOSTS[provider]+path);if(incoming.search.length>12000)return Response.json({error:'Query too long'},{status:400});target.search=incoming.search}
  // Fixed hosts and paths; visitors cannot use this endpoint as an arbitrary proxy.
  const cacheKey=new Request(target.toString());const cache=caches.default;const hit=await cache.match(cacheKey);if(hit)return hit;
  try{
   const upstream=await fetch(target,{headers:{Accept:'application/json','User-Agent':'ElectionAtlas/1.0 public election research'},signal:AbortSignal.timeout(22000),redirect:'manual'});
   const headers=new Headers({'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':upstream.ok?'public, max-age=20':'no-store'});const retry=upstream.headers.get('Retry-After');if(retry)headers.set('Retry-After',retry);
   if(!upstream.ok)return Response.json({error:`Provider returned HTTP ${upstream.status}`,provider},{status:upstream.status,headers});
   const response=new Response(upstream.body,{status:200,headers});ctx.waitUntil(cache.put(cacheKey,response.clone()));return response;
  }catch(exc){return Response.json({error:'Public data source unavailable',provider,detail:exc instanceof Error?exc.message:'Request failed'},{status:502,headers:{'Cache-Control':'no-store'}})}
 }
} satisfies ExportedHandler<Env>;
