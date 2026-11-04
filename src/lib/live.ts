import type {Contract, History, Poll, Quote, Race, Snapshot, Status, Summary} from '../types';
type Row=Record<string,unknown>;
const asRow=(v:unknown):Row=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid API object');return v as Row};
const str=(v:unknown)=>typeof v==='string'?v:'';
export const numeric=(v:unknown):number|null=>{if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
export const probability=(v:unknown):number|null=>{const n=numeric(v);return n!==null&&n>=0&&n<=1?n:null};
const normalized=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const timestamp=(v:unknown)=>{const s=str(v);return s&&Number.isFinite(Date.parse(s))?new Date(s.endsWith('Z')||/[+-]\d\d:\d\d$/.test(s)?s:s+'Z').toISOString():null};
export function nextBoundary(time=Date.now()){return (Math.floor(time/30000)+1)*30000}
export async function getJSON(path:string,signal?:AbortSignal):Promise<unknown>{
 for(let attempt=0;attempt<2;attempt++){
  const response=await fetch(path,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(22000)]):AbortSignal.timeout(22000),headers:{Accept:'application/json'}});
  if(response.ok)return response.json();
  const retry=response.headers.get('Retry-After');const retrySeconds=numeric(retry)??(retry?Math.max(0,(Date.parse(retry)-Date.now())/1000):1);
  if(attempt===0&&(response.status===429||response.status>=500)&&retrySeconds<=5){await new Promise<void>((resolve,reject)=>{const id=setTimeout(resolve,Math.max(1000,retrySeconds*1000));signal?.addEventListener('abort',()=>{clearTimeout(id);reject(signal.reason)},{once:true})});continue}
  throw new Error(`Source returned HTTP ${response.status}${response.status===429?' (rate limited; previous data retained)':''}`);
 }
 throw new Error('Request failed');
}
export async function getBatch(paths:string[],signal?:AbortSignal):Promise<unknown[]>{
 if(!paths.length||paths.length>12)throw new Error('Invalid batch size');
 const payload=await getJSON('/api/batch?'+new URLSearchParams({paths:JSON.stringify(paths)}),signal);
 if(!Array.isArray(payload)||payload.length!==paths.length)throw new Error('Incomplete batch response');
 for(const item of payload){if(item&&typeof item==='object'&&!Array.isArray(item)&&'error' in item)throw new Error(`Source batch failed: ${String(item.error)}${'status' in item?' (HTTP '+item.status+')':''}`)}
 return payload;
}
function rows(payload:unknown):Row[]{const p=asRow(payload);if(!Array.isArray(p.rows))throw new Error('Invalid rows envelope');if(p.count!==undefined&&p.count!==p.rows.length)throw new Error('Incomplete source response');return p.rows.map(asRow)}
export function validMidpoint(bid:number|null,ask:number|null,status:string,liquidity:number|null){return ['active','open','initialized'].includes(status)&&bid!==null&&ask!==null&&0<bid&&bid<=ask&&ask<1&&ask-bid<=.30&&liquidity!==0?Number(((bid+ask)/2).toFixed(6)):null}
export function normalizeMarket(raw:Row,contract:Contract,races:Race[],fetched:string):{contract:Contract;quote:Quote}{
 const isK=contract.provider==='kalshi';const race=races.find(r=>r.id===contract.race_id);
 const question=str(raw[isK?'title':'question']);const rules=isK?[str(raw.rules_primary),str(raw.rules_secondary)].filter(Boolean).join('\n'):str(raw.description);
 if((!race&&contract.outcome_type!=='control')||!question||normalized(question)!==normalized(contract.question)||rules.trim()!==contract.rules.trim())throw new Error('Contract identity or settlement terms changed; mapping needs review');
 const candidate=race?.candidates.find(c=>c.id===contract.candidate_id);
 if(contract.outcome_type==='candidate'&&(!candidate||![candidate.name,...candidate.aliases].some(name=>normalized(str(raw[isK?'yes_sub_title':'groupItemTitle']).replace(/\s*\([^)]+\)\s*$/,'')).includes(normalized(name)))))throw new Error('Candidate identity changed; mapping needs review');
 if(contract.outcome_type==='party'&&candidate&&candidate.party!==contract.outcome)throw new Error('Candidate party changed; mapping needs review');
 const status=isK?str(raw.status):raw.closed?'closed':raw.active?'active':'inactive';
 const price=(key:string)=>{if(raw[key+'_dollars']!=null)return probability(raw[key+'_dollars']);const n=numeric(raw[key]);return n===null?null:probability(n/100)};
 const bid=isK?price('yes_bid'):probability(raw.bestBid),ask=isK?price('yes_ask'):probability(raw.bestAsk),last=isK?price('last_price'):probability(raw.lastTradePrice);
 const liquidity=numeric(raw[isK?'yes_bid_size_fp':'liquidityNum']??raw.liquidity);
 let value=validMidpoint(bid,ask,status,liquidity);let method=value===null?'unavailable':'midpoint';let warning=value===null?'Closed, empty, one-sided or wide book. Raw last trade is informational only.':null;
 if(!isK){let outcomes:unknown=raw.outcomes;try{if(typeof outcomes==='string')outcomes=JSON.parse(outcomes)}catch{outcomes=null}
  if(!Array.isArray(outcomes)&&outcomes&&typeof outcomes==='object'){
   const yes=asRow((outcomes as Row).yes);if(yes.positionId&&!yes.tokenId){value=null;method='unsupported_protocol';warning='Position-ID protocol pricing is not supported by this adapter.'}
  }
 }
 return {contract:{...contract,status},quote:{contract_id:contract.id,provider:contract.provider,race_id:contract.race_id,candidate_id:contract.candidate_id,outcome:contract.outcome,price:value,bid,ask,midpoint:bid!==null&&ask!==null&&bid<=ask?(bid+ask)/2:null,last_trade:last,volume:numeric(raw[isK?'volume_fp':'volumeNum']??raw.volume),liquidity,source_timestamp:isK?null:timestamp(raw.updatedAt),fetched_at:fetched,pricing_method:method,warning}};
}
function poll(raw:Row,race:Race):Poll{
 const figures=str(raw.figures);const results=[...figures.matchAll(/([^;]+?)\s*\(([^)]+)\)\s*([\d.]+)/g)].map(m=>({name:m[1].trim(),party:m[2],share:Number(m[3])/100}));
 return {id:'pf:'+String(raw.poll_id),underlying_id:String(raw.poll_id),race_id:race.id,provider:'polling_forecast',pollster:str(raw.pollster)||'Unknown',sponsor:str(raw.sponsor)||null,start:timestamp(raw.fieldwork_start),end:timestamp(raw.fieldwork_end),sample:numeric(raw.sample),population:str(raw.population)||null,results,figures:figures||null,margin:numeric(raw.margin),adjusted_margin:numeric(raw.adjusted_margin),url:str(raw.source_url)||null,methodology:{source_grade:raw.source_grade,partisan:raw.partisan,question:raw.question,pollster_code:raw.pollster_code},licence:str(raw.licence)||'Unknown',attribution:'Polling Forecast; original pollster. Wikipedia contributors for CC BY-SA 4.0 rows.'};
}
export function deduplicate(polls:Poll[]):Poll[]{const seen=new Set<string>();return [...polls].sort((a,b)=>Number(a.provider!=='polling_forecast')-Number(b.provider!=='polling_forecast')).filter(p=>{const key=[p.race_id,normalized(p.pollster),p.start?.slice(0,10),p.end?.slice(0,10),p.sample,p.population?.toUpperCase()].join('|');const source=[p.race_id,p.url,p.end?.slice(0,10),p.sample].join('|');if(seen.has(key)||(p.url&&seen.has(source)))return false;seen.add(key);if(p.url)seen.add(source);return true})}
export async function refreshSnapshot(previous:Snapshot,signal?:AbortSignal):Promise<Snapshot>{
 const fetched=new Date().toISOString();let result:Snapshot={...previous,providers:{...previous.providers},context:{...previous.context},races:[...previous.races],summaries:[...previous.summaries],polls:[...previous.polls],contracts:[...previous.contracts],quotes:[...previous.quotes]};
 const status=(provider:string,ok:boolean,message='',partial=false)=>{const old=previous.providers[provider];result.providers[provider]={status:ok?(partial?'partial':'ok'):'error',last_attempt:fetched,last_success:ok?fetched:old?.last_success??null,message,refresh_seconds:30} satisfies Status};
 await Promise.allSettled([
  (async()=>{try{
   const payloads=await getBatch(['senate','governors'].map(path=>'/api/polling/'+path),signal);
   const received=payloads.flatMap(rows);const known=new Map(previous.races.map(r=>[r.provider_ids.polling_forecast,r]));
   const expected=previous.races.filter(r=>r.provider_ids.polling_forecast);
   if(received.length!==expected.length||received.some(r=>!known.has(str(r.key))))throw new Error('Race roster changed; manifest requires review');
   const updated:Race[]=[];const summaries:Summary[]=[];
   for(const raw of received){const race=known.get(str(raw.key))!;if(raw.state!==race.state)throw new Error('Unexpected state identity');const chance=raw.chance_left==null?null:probability(raw.chance_left);if(raw.chance_left!=null&&chance===null)throw new Error('Invalid model probability');
    const candidates=race.candidates.map((c,i)=>({...c,name:str(raw[i===0?'left_candidate':'rep_candidate'])||c.name,party:i===0?str(raw.left_party)||c.party:'R'}));
    updated.push({...race,candidates,updated_at:timestamp(raw.as_of)??race.updated_at});
    summaries.push({race_id:race.id,provider:'polling_forecast',comparison_candidate_id:candidates[0].id,poll_margin:numeric(raw.poll_average),forecast_margin:numeric(raw.best_bet_margin),probability:chance,rating:str(raw.rating)||null,polls_used:numeric(raw.polls_used),as_of:timestamp(raw.as_of),availability:raw.poll_average==null?'no_polls':'available',licence:str(raw.licence)||'CC BY 4.0',url:'https://www.pollingforecast.com'+(str(raw.page)||'/us/data')});
   }
   result.races=previous.races.map(r=>updated.find(u=>u.id===r.id)??r);result.summaries=summaries;status('polling_forecast',true);
   if(Date.now()-Number(previous.context.polls_fetched_at??0)>600000){
    try{const pollPayloads=await getBatch(['Senate','Governor'].map(kind=>'/api/polling/polls?kind='+kind),signal);const normalizedPolls=pollPayloads.flatMap(rows).flatMap(raw=>{const race=known.get(str(raw.race));return race&&[null,undefined,'vote','general'].includes(raw.stage as string|null|undefined)?[poll(raw,race)]:[]});if(normalizedPolls.length){result.polls=deduplicate([...normalizedPolls,...result.polls.filter(p=>p.provider!=='polling_forecast')]);result.context.polls_fetched_at=Date.now()}}catch(exc){status('polling_forecast',true,'Forecast refreshed; individual polls retained: '+String(exc),true)}
   }
  }catch(exc){status('polling_forecast',false,String(exc))}})(),
  ...(['kalshi','polymarket'] as const).map(provider=>(async()=>{try{
   const contracts=previous.contracts.filter(c=>c.provider===provider);if(!contracts.length){status(provider,false,'No verified market mappings');return}
   const rawRows:Row[]=[];const chunkSize=provider==='kalshi'?90:45;const paths:string[]=[];
   for(let i=0;i<contracts.length;i+=chunkSize){const group=contracts.slice(i,i+chunkSize);const query=new URLSearchParams();if(provider==='kalshi'){query.set('tickers',group.map(c=>c.market_id).join(','));query.set('limit','1000')}else for(const c of group)query.append('id',c.market_id);paths.push('/api/'+provider+'/markets?'+query)}
   const payloads=await getBatch(paths,signal);
   for(const payload of payloads){const found=provider==='kalshi'?asRow(payload).markets:payload;if(!Array.isArray(found))throw new Error('Invalid markets response');rawRows.push(...found.map(asRow))}
   if(!rawRows.length)throw new Error('Empty market response; previous quotes retained');
   const byId=new Map(rawRows.map(r=>[String(r[provider==='kalshi'?'ticker':'id']),r]));const refreshed:Quote[]=[];const updated:Contract[]=[];let rejected=0;
   for(const c of contracts){const raw=byId.get(c.market_id);try{if(!raw)throw new Error('Contract omitted by provider');const normalized=normalizeMarket(raw,c,previous.races,fetched);refreshed.push(normalized.quote);updated.push(normalized.contract)}catch(exc){rejected++;const last=previous.quotes.find(q=>q.contract_id===c.id);if(last)refreshed.push({...last,price:null,pricing_method:'unavailable',warning:String(exc)});updated.push(c)}}
   result.contracts=[...result.contracts.filter(c=>c.provider!==provider),...updated];result.quotes=[...result.quotes.filter(q=>q.provider!==provider),...refreshed];status(provider,true,rejected?`${rejected} contracts unavailable or require mapping review`:'',rejected>0);
  }catch(exc){status(provider,false,String(exc))}})()),
  (async()=>{if(Date.now()-Number(previous.context.votehub_fetched_at??0)<600000)return;try{
   const types=await getJSON('/api/votehub/poll-types',signal);if(!Array.isArray(types))throw new Error('Invalid poll-type response');const kinds=['us-senator','governor'].filter(kind=>types.includes(kind));const batch=kinds.length?await getBatch(kinds.map(kind=>'/api/votehub/polls?poll_type='+kind),signal):[];const values=kinds.map((kind,i)=>({kind,payload:batch[i]}));
   const polls:Poll[]=[];
   for(const {kind,payload} of values){const records=Array.isArray(payload)?payload:asRow(payload).polls;if(!Array.isArray(records))throw new Error('Invalid VoteHub polls');for(const item of records){const raw=asRow(item);const race=previous.races.find(r=>r.office===(kind==='us-senator'?'Senate':'Governor')&&normalized(str(raw.subject))===normalized('2026 '+r.state_name));if(!race||!Array.isArray(raw.answers))continue;const answers=raw.answers.map(asRow);const observations=race.candidates.slice(0,2).map(c=>answers.find(a=>normalized(str(a.choice))===normalized(c.name)));if(observations.length<2||observations.some(x=>numeric(x?.pct)===null))continue;
    polls.push({id:'vh:'+str(raw.id),underlying_id:str(raw.id),race_id:race.id,provider:'votehub',pollster:str(raw.pollster)||'Unknown',sponsor:Array.isArray(raw.sponsors)?raw.sponsors.join(', '):null,start:timestamp(raw.start_date),end:timestamp(raw.end_date),sample:numeric(raw.sample_size),population:str(raw.population)||null,results:answers.map(a=>({name:str(a.choice),share:(numeric(a.pct)??0)/100})),figures:null,margin:Number(observations[0]!.pct)-Number(observations[1]!.pct),adjusted_margin:null,url:str(raw.url)||null,methodology:{partisan:raw.partisan,internal:raw.internal},licence:'CC BY 4.0',attribution:'VoteHub; original pollster.'});
   }}
   result.polls=deduplicate([...result.polls.filter(p=>p.provider!=='votehub'),...polls]);result.context.votehub_fetched_at=Date.now();status('votehub',true);
  }catch(exc){status('votehub',false,String(exc))}})(),
 ]);
 // Recheck candidate links against the newly refreshed daily candidate metadata.
 const candidates=new Map(result.races.flatMap(r=>r.candidates.map(c=>[c.id,c] as const)));
 result.contracts=result.contracts.map(c=>{const old=previous.races.flatMap(r=>r.candidates).find(x=>x.id===c.candidate_id);const current=c.candidate_id?candidates.get(c.candidate_id):null;if(c.outcome_type==='candidate'&&old&&current&&normalized(old.name)!==normalized(current.name)){result.quotes=result.quotes.map(q=>q.contract_id===c.id?{...q,price:null,warning:'Candidate identity changed; mapping requires review',pricing_method:'unavailable'}:q);return {...c,candidate_id:null}}return c});
 result={...result,generated_at:fetched};return result;
}
export function appendHistory(previous:History,quotes:Quote[],time=Date.now()):History{
 const cutoff=time-21*86400000;const next:History={};
 for(const [id,points] of Object.entries(previous)){const compact=new Map<number,typeof points[number]>();for(const point of points){const t=Date.parse(point.t);if(t<cutoff)continue;const resolution=t<time-86400000?3600000:300000;compact.set(Math.floor(t/resolution),point)}next[id]=[...compact.values()].sort((a,b)=>a.t.localeCompare(b.t))}
 for(const quote of quotes){if(quote.price===null)continue;const points=next[quote.contract_id]??[];if(points.some(p=>p.t===quote.fetched_at))continue;const bucket=Math.floor(Date.parse(quote.fetched_at)/300000);const point={t:quote.fetched_at,p:quote.price,method:quote.pricing_method};if(points.length&&Math.floor(Date.parse(points[points.length-1].t)/300000)===bucket)points[points.length-1]=point;else points.push(point);next[quote.contract_id]=points}
 return next;
}
