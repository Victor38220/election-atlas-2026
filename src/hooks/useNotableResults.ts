import {useEffect,useRef,useState} from 'react';
import {getJSON} from '../lib/live';
import {normalizeNotableResults} from '../lib/notableResults';
type ResultMap=ReturnType<typeof normalizeNotableResults>;
type Archive={house?:unknown;california?:unknown};
const KEY='election-atlas-notable-results-v1';
function hasRaces(value:unknown):boolean{return !!value&&typeof value==='object'&&Array.isArray((value as {races?:unknown}).races)}
export function useNotableResults(enabled:boolean){
 const [results,setResults]=useState<ResultMap>({});const current=useRef<ResultMap>({});
 useEffect(()=>{
  if(!enabled)return;let stopped=false,busy=false,timer:ReturnType<typeof setTimeout>;let controller:AbortController|null=null;
  const publish=()=>{if(stopped)return;setResults({...current.current});try{localStorage.setItem(KEY,JSON.stringify(current.current))}catch{/* optional cache */}};
  const offer=(value:unknown)=>{if(stopped||!value||typeof value!=='object')return;const data=value as Archive;const incoming=normalizeNotableResults(data.house,data.california);for(const [id,result] of Object.entries(incoming)){const prior=current.current[id];if(!prior||!Number.isFinite(Date.parse(prior.asOf??''))||Date.parse(result.asOf??'')>Date.parse(prior.asOf??''))current.current[id]=result}publish()};
  try{const saved=JSON.parse(localStorage.getItem(KEY)??'null');if(saved&&typeof saved==='object'&&!Array.isArray(saved)){current.current=saved as ResultMap;publish()}}catch{/* optional cache */}
  const refresh=async()=>{if(busy)return;busy=true;controller=new AbortController();try{
   const value=await getJSON('/api/notable-results',controller.signal) as Archive;
   if(stopped)return;
   if(hasRaces(value.house))for(const key of Object.keys(current.current))if(key.startsWith('KXHOUSERACE-'))delete current.current[key];
   if(hasRaces(value.california))delete current.current['KXMAYORLA-26'];
   Object.assign(current.current,normalizeNotableResults(value.house,value.california));publish();
  }catch{/* Keep the last observed source records and their original times. */}finally{busy=false}};
  void Promise.allSettled([getJSON('/api/archive/notable-results'),getJSON(import.meta.env.BASE_URL+'data/notable-results.json')]).then(values=>values.forEach(value=>{if(value.status==='fulfilled')offer(value.value)}));
  void refresh();
  const schedule=()=>{timer=setTimeout(()=>{if(document.visibilityState!=='hidden')void refresh();schedule()},30000-Date.now()%30000)};schedule();
  const visible=()=>{if(document.visibilityState==='visible')void refresh()},manual=()=>void refresh();document.addEventListener('visibilitychange',visible);window.addEventListener('election-atlas:refresh',manual);
  return()=>{stopped=true;clearTimeout(timer);controller?.abort();document.removeEventListener('visibilitychange',visible);window.removeEventListener('election-atlas:refresh',manual)};
 },[enabled]);
 return results;
}
