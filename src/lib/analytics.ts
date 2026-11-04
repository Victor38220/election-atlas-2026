import type {Race,Snapshot,Provider,Contract,Quote,Mode} from '../types';
export const pct=(n:number|null|undefined,digits=1)=>n==null?'—':`${(n*100).toFixed(digits)}%`;
export const points=(n:number|null|undefined)=>n==null?'—':`${n>0?'+':''}${n.toFixed(1)} pp`;
export const date=(s:string|null|undefined)=>s?new Date(s).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'Not available';
export const shortDate=(s:string|null|undefined)=>s?new Date(s).toLocaleDateString([], {month:'short',day:'numeric',timeZone:'UTC'}):'—';
export const money=(n:number|null)=>n==null?'Unavailable':new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(n);
export const party=(p:string)=>({D:'Democratic',R:'Republican',I:'Independent'}[p]??p);
export function summary(s:Snapshot,r:Race){return s.summaries.find(x=>x.race_id===r.id)}
export function market(s:Snapshot,r:Race,p:Provider,candidateId=r.candidates[0]?.id):{contract:Contract;quote:Quote|undefined}|undefined{
 const contracts=s.contracts.filter(x=>x.race_id===r.id&&x.provider===p&&x.candidate_id===candidateId);
 const list=contracts.map(contract=>({contract,quote:s.quotes.find(q=>q.contract_id===contract.id)}));
 return list.sort((a,b)=>Number(b.quote?.price!=null)-Number(a.quote?.price!=null)||Number(b.contract.outcome_type==='party')-Number(a.contract.outcome_type==='party'))[0];
}
export function difference(s:Snapshot,r:Race){
 const k=market(s,r,'kalshi'),p=market(s,r,'polymarket');
 if(k?.quote?.price==null||p?.quote?.price==null)return null;
 const a=k.contract,b=p.contract;
 if(!a.comparison_group||a.comparison_group!==b.comparison_group||a.outcome!==b.outcome||a.outcome_type!==b.outcome_type)return null;
 return (k.quote.price-p.quote.price)*100;
}
export function metric(s:Snapshot,r:Race,m:Mode):number|null{
 if(m==='polling')return summary(s,r)?.poll_margin??null;
 if(m==='forecast')return summary(s,r)?.probability??null;
 if(m==='difference')return difference(s,r);
 return market(s,r,m)?.quote?.price??null;
}
export const modes:{id:Mode;label:string;short:string}[]=[{id:'polling',label:'Polling margin',short:'Polling'},{id:'forecast',label:'Forecast probability',short:'Forecast'},{id:'kalshi',label:'Kalshi market price',short:'Kalshi'},{id:'polymarket',label:'Polymarket market price',short:'Polymarket'},{id:'difference',label:'Kalshi − Polymarket',short:'Difference'}];
export function color(value:number|null,mode:Mode,independent=false){
 if(value===null)return 'url(#missing)';
 if(mode==='difference')return value>0?'#e3b979':value<0?'#43b7ad':'#718399';
 const n=mode==='polling'?value:value*100-50;
 if(Math.abs(n)<(mode==='polling'?1:3))return '#a0a9ba';
 const alpha=Math.min(1,.48+Math.abs(n)/(mode==='polling'?32:60));
 return n>0?(independent?`rgba(174,135,221,${alpha})`:`rgba(97,153,220,${alpha})`):`rgba(222,104,120,${alpha})`;
}
export function metricLabel(value:number|null,mode:Mode,r?:Race){
 if(value===null)return 'No usable data';
 if(mode==='difference')return points(value);
 if(mode==='polling')return `${value>=0?r?.candidates[0]?.party??'D':'R'} +${Math.abs(value).toFixed(1)}`;
 return pct(value);
}
export function isStale(s:StatusLike|undefined,now=Date.now()) {return !s?.last_success||now-Date.parse(s.last_success)>Math.max(s.refresh_seconds*2000,90000)}
type StatusLike={last_success:string|null;refresh_seconds:number};
