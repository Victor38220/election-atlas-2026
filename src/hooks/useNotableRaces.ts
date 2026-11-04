import {useCallback,useEffect,useRef,useState} from 'react';
import {getJSON} from '../lib/live';
import type {NotableRace} from '../components/NotableRaces';

type NotableData={updatedAt:string;methodology:string;races:NotableRace[]};
const KEY='election-atlas-notable-races-v1';
function valid(value:unknown):value is NotableData{
 if(!value||typeof value!=='object')return false;
 const data=value as Partial<NotableData>;
 return typeof data.updatedAt==='string'&&Number.isFinite(Date.parse(data.updatedAt))&&typeof data.methodology==='string'&&Array.isArray(data.races)&&data.races.every(r=>r&&typeof r.id==='string'&&typeof r.title==='string'&&Array.isArray(r.markets)&&Array.isArray(r.news));
}
export function useNotableRaces(enabled:boolean){
 const [data,setData]=useState<NotableData|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null);
 const busy=useRef(false),abort=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{
  if(busy.current)return;busy.current=true;setLoading(true);const controller=new AbortController();abort.current=controller;
  try{const next=await getJSON('/api/notable-races',controller.signal);if(!valid(next)||!next.races.length)throw new Error('No verified races returned');setData(next);setError(null);try{localStorage.setItem(KEY,JSON.stringify(next))}catch{/* Storage is optional. */}}
  catch(exc){if(!controller.signal.aborted)setError(String(exc))}finally{busy.current=false;setLoading(false)}
 },[]);
 useEffect(()=>{
  if(!enabled)return;let timer:ReturnType<typeof setTimeout>;
  try{const saved:unknown=JSON.parse(localStorage.getItem(KEY)??'null');if(valid(saved))setData(saved)}catch{/* Cache is optional. */}
  void refresh();
  const schedule=()=>{timer=setTimeout(()=>{if(document.visibilityState!=='hidden')void refresh();schedule()},30000-Date.now()%30000)};schedule();
  const visible=()=>{if(document.visibilityState==='visible')void refresh()},manual=()=>void refresh();document.addEventListener('visibilitychange',visible);window.addEventListener('election-atlas:refresh',manual);
  return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('election-atlas:refresh',manual);abort.current?.abort()};
 },[enabled,refresh]);
 return {data,loading,error};
}
