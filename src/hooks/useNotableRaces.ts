import {useCallback,useEffect,useRef,useState} from 'react';
import {getJSON} from '../lib/live';
import type {NotableRace} from '../components/NotableRaces';

type NotableData={updatedAt:string;methodology:string;races:NotableRace[];polling_status?:{house:'ok'|'error';la:'ok'|'error'};polymarket_status?:'ok'|'error';ranking_status?:'ok'|'partial'};
const KEY='election-atlas-notable-races-v1';
function valid(value:unknown):value is NotableData{
 if(!value||typeof value!=='object')return false;
 const data=value as Partial<NotableData>;
 return typeof data.updatedAt==='string'&&Number.isFinite(Date.parse(data.updatedAt))&&typeof data.methodology==='string'&&Array.isArray(data.races)&&data.races.every(r=>r&&typeof r.id==='string'&&typeof r.title==='string'&&Array.isArray(r.markets)&&Array.isArray(r.news));
}
function retainSources(next:NotableData,previous:NotableData|null):NotableData{
 return {...next,races:next.races.map(race=>{
  const prior=previous?.races.find(item=>item.id===race.id);
  const provider=race.id==='KXMAYORLA-26'?'la':'house';
  const pollingUnavailable=next.polling_status?.[provider]==='error';
  const retainPolls=pollingUnavailable&&!race.polls?.length&&!!prior?.polls?.length;
  const oldPoly=next.polymarket_status==='error'&&!race.markets.some(m=>m.provider==='Polymarket')?prior?.markets.find(m=>m.provider==='Polymarket'):undefined;
  return {...race,...(pollingUnavailable?{pollingUnavailable:true}:{}),...(retainPolls?{polls:prior?.polls,pollsRetained:true}:{}),...(oldPoly?{markets:[...race.markets,{...oldPoly,retained:true}]}:{})};
 })};
}
export function useNotableRaces(enabled:boolean){
 const [data,setData]=useState<NotableData|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null);
 const busy=useRef(false),abort=useRef<AbortController|null>(null),current=useRef<NotableData|null>(null);
 const refresh=useCallback(async()=>{
  if(busy.current)return;busy.current=true;setLoading(true);const controller=new AbortController();abort.current=controller;
  try{const next=await getJSON('/api/notable-races',controller.signal);if(!valid(next)||!next.races.length)throw new Error('No verified races returned');if(next.ranking_status==='partial'&&current.current)throw new Error('Incomplete ranking; last observation retained');const merged=retainSources(next,current.current);current.current=merged;setData(merged);setError(null);try{localStorage.setItem(KEY,JSON.stringify(merged))}catch{/* Storage is optional. */}}
  catch(exc){if(!controller.signal.aborted)setError(String(exc))}finally{busy.current=false;setLoading(false)}
 },[]);
 useEffect(()=>{
  if(!enabled)return;let timer:ReturnType<typeof setTimeout>;
  let active=true;
  const offer=(candidate:unknown)=>{if(!active||!valid(candidate))return;const existing=current.current;current.current=!existing||Date.parse(candidate.updatedAt)>Date.parse(existing.updatedAt)?retainSources(candidate,existing):retainSources(existing,candidate);setData(current.current)};
  try{offer(JSON.parse(localStorage.getItem(KEY)??'null'))}catch{/* Cache is optional. */}
  void Promise.allSettled([getJSON('/api/archive/notable-races'),getJSON(import.meta.env.BASE_URL+'data/notable-races.json')]).then(values=>values.forEach(value=>{if(value.status==='fulfilled')offer(value.value)}));
  void refresh();
  const schedule=()=>{timer=setTimeout(()=>{if(document.visibilityState!=='hidden')void refresh();schedule()},30000-Date.now()%30000)};schedule();
  const visible=()=>{if(document.visibilityState==='visible')void refresh()},manual=()=>void refresh();document.addEventListener('visibilitychange',visible);window.addEventListener('election-atlas:refresh',manual);
  return()=>{active=false;clearTimeout(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('election-atlas:refresh',manual);abort.current?.abort()};
 },[enabled,refresh]);
 return {data,loading,error};
}
