import {useCallback,useEffect,useRef,useState} from 'react';
import type {ResultsData} from '../lib/results';
import {fetchResults} from '../lib/results';
import {getJSON} from '../lib/live';
const KEY='election-atlas-results-v1';
export function useResults(enabled:boolean){
 const [data,setData]=useState<ResultsData|null>(null);const [loading,setLoading]=useState(false);const [error,setError]=useState<string|null>(null);
 const current=useRef<ResultsData|null>(null);const busy=useRef(false);const abort=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{if(busy.current)return;busy.current=true;setLoading(true);abort.current=new AbortController();try{const next=await fetchResults(current.current,abort.current.signal);current.current=next;setData(next);setError(next.errors?.length?next.errors.join('; '):null);try{localStorage.setItem(KEY,JSON.stringify(next))}catch{/* Full storage does not prevent live counts. */}}catch(exc){if(!abort.current.signal.aborted)setError(String(exc))}finally{busy.current=false;setLoading(false)}},[]);
 useEffect(()=>{if(!enabled)return;let active=true;let timer:ReturnType<typeof setTimeout>;
  (async()=>{if(!current.current){let saved:ResultsData|null=null;try{saved=JSON.parse(localStorage.getItem(KEY)??'null') as ResultsData|null}catch{/* Optional cache. */}const seed=await getJSON(import.meta.env.BASE_URL+'data/results.json').catch(()=>null) as ResultsData|null;const initial=saved?.races&&(!seed||Date.parse(saved.fetched_at)>Date.parse(seed.fetched_at))?saved:seed;if(initial?.races&&active){current.current=initial;setData(initial)}}if(active)void refresh()})();
  const schedule=()=>{timer=setTimeout(()=>{if(document.visibilityState!=='hidden')void refresh();schedule()},30000-Date.now()%30000)};schedule();
  const visible=()=>{if(document.visibilityState==='visible')void refresh()};document.addEventListener('visibilitychange',visible);const manual=()=>void refresh();window.addEventListener('election-atlas:refresh',manual);
  return()=>{active=false;clearTimeout(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('election-atlas:refresh',manual);abort.current?.abort()};
 },[enabled,refresh]);
 return {data,loading,error,refresh};
}
