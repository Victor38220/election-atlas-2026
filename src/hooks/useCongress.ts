import {useCallback,useEffect,useRef,useState} from 'react';
import {getJSON} from '../lib/live';
import {normalizeChamber,validateChamberCompleteness} from '../lib/chambers';
import type {CongressData} from '../lib/chambers';
import type {Race} from '../types';
import manifest from '../../config/races.json';

const KEY='election-atlas-congress-v1';
export function useCongress(enabled:boolean){
 const [data,setData]=useState<CongressData|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null);
 const current=useRef<CongressData|null>(null),busy=useRef(false),abort=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{
  if(busy.current)return;busy.current=true;setLoading(true);abort.current=new AbortController();
  try{
   const fetchedAt=new Date().toISOString(),errors:string[]=[];const next:CongressData={fetched_at:fetchedAt,senate:current.current?.senate??null,house:current.current?.house??null,errors};
   const offices=['Senate','House'] as const;
   const outcomes=await Promise.allSettled(offices.map(async office=>{const raw=await getJSON('/api/national/'+office,abort.current!.signal);const normalized=normalizeChamber(raw,office,fetchedAt,manifest as Race[]);validateChamberCompleteness(normalized);return normalized}));
   outcomes.forEach((outcome,index)=>{const office=offices[index];if(outcome.status==='fulfilled')next[office==='Senate'?'senate':'house']=outcome.value;else errors.push(office+': '+String(outcome.reason))});
   if(errors.length===2)throw new Error('Congress refresh failed. Last successful seat records retained.');
   current.current=next;setData(next);setError(null);try{localStorage.setItem(KEY,JSON.stringify(next))}catch{/* Memory and packaged data remain usable. */}
  }catch(exc){if(!abort.current?.signal.aborted)setError(String(exc))}finally{busy.current=false;setLoading(false)}
 },[]);
 useEffect(()=>{
  if(!enabled)return;let active=true,timer:ReturnType<typeof setTimeout>;
  (async()=>{let saved:CongressData|null=null;try{saved=JSON.parse(localStorage.getItem(KEY)??'null')}catch{/* Optional cache. */}const seed=await getJSON(import.meta.env.BASE_URL+'data/congress.json').catch(()=>null) as CongressData|null;const initial=saved&&(!seed||Date.parse(saved.fetched_at)>Date.parse(seed.fetched_at))?saved:seed;if(initial&&(initial.senate||initial.house)&&active){current.current=initial;setData(initial)}if(active)void refresh()})();
  const schedule=()=>{timer=setTimeout(()=>{if(document.visibilityState!=='hidden')void refresh();schedule()},30000-Date.now()%30000)};schedule();
  const visible=()=>{if(document.visibilityState==='visible')void refresh()},manual=()=>void refresh();document.addEventListener('visibilitychange',visible);window.addEventListener('election-atlas:refresh',manual);
  return()=>{active=false;clearTimeout(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('election-atlas:refresh',manual);abort.current?.abort()};
 },[enabled,refresh]);
 return {data,loading,error,refresh};
}
