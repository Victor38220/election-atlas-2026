import {useCallback,useEffect,useRef,useState} from 'react';
import type {History,Snapshot} from '../types';
import {appendHistory,getJSON,nextBoundary,refreshSnapshot} from '../lib/live';
const CACHE_KEY='election-atlas-v1';
const HISTORY_KEY='election-atlas-history-v1';
function cached<T>(key:string):T|null{try{return JSON.parse(localStorage.getItem(key)??'null') as T|null}catch{return null}}
function persist(key:string,value:unknown){try{localStorage.setItem(key,JSON.stringify(value))}catch{/* Storage disabled/full: memory and bundled snapshot still work. */}}
export function useElectionData(){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);const [history,setHistory]=useState<History>({});const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [error,setError]=useState<string|null>(null);const [lastChecked,setLastChecked]=useState<string|null>(null);const [nextRefresh,setNextRefresh]=useState(nextBoundary());
 const archiveChecked=useRef(0);const current=useRef<Snapshot|null>(null);const recorded=useRef<History>({});const busy=useRef(false);const controller=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{if(busy.current||!current.current)return;busy.current=true;setRefreshing(true);controller.current=new AbortController();try{if(Date.now()-archiveChecked.current>900000){archiveChecked.current=Date.now();try{const archived=await getJSON('/api/archive/latest',controller.current.signal) as Snapshot;if(archived.races?.length&&Array.isArray(archived.contracts)){if(Date.parse(archived.generated_at)>Date.parse(current.current.generated_at))current.current=archived;else{const known=new Set(current.current.contracts.map(c=>c.id));const added=archived.contracts.filter(c=>!known.has(c.id));current.current={...current.current,contracts:[...current.current.contracts,...added],quotes:[...current.current.quotes,...archived.quotes.filter(q=>added.some(c=>c.id===q.contract_id))]}}}const archivedHistory=await getJSON('/api/archive/history',controller.current.signal) as History;const merged={...recorded.current};for(const [id,points] of Object.entries(archivedHistory)){if(!Array.isArray(points))continue;const map=new Map([...(merged[id]??[]),...points].map(p=>[p.t,p]));merged[id]=[...map.values()].sort((a,b)=>a.t.localeCompare(b.t))}recorded.current=merged}catch{/* Archive failure does not block independent live sources. */}}const value=await refreshSnapshot(current.current,controller.current.signal);current.current=value;setSnapshot(value);persist(CACHE_KEY,value);const observed=appendHistory(recorded.current,value.quotes);recorded.current=observed;setHistory(observed);persist(HISTORY_KEY,observed);setLastChecked(new Date().toISOString());setError(null)}catch(exc){if(!controller.current.signal.aborted)setError(String(exc))}finally{busy.current=false;setRefreshing(false);setNextRefresh(nextBoundary())}},[]);
 useEffect(()=>{let active=true;let timer:ReturnType<typeof setTimeout>;
  (async()=>{try{const bundled=await getJSON(import.meta.env.BASE_URL+'data/latest.json') as Snapshot;if(!bundled?.races?.length||!bundled.providers)throw new Error('Invalid bundled snapshot');const stored=cached<Snapshot>(CACHE_KEY);const value=stored?.races?.length&&Date.parse(stored.generated_at)>Date.parse(bundled.generated_at)?stored:bundled;
   const base=await getJSON(import.meta.env.BASE_URL+'data/history.json').catch(()=>({})) as History;const local=cached<History>(HISTORY_KEY)??{};const merged:History={...base};for(const [id,points] of Object.entries(local)){const map=new Map([...(merged[id]??[]),...points].map(p=>[p.t,p]));merged[id]=[...map.values()].sort((a,b)=>a.t.localeCompare(b.t))}
   if(!active)return;current.current=value;recorded.current=merged;setSnapshot(value);setHistory(merged);setLoading(false);
   if(active)await refresh();
  }catch(exc){if(active){setError(String(exc));setLoading(false)}}})();
  const schedule=()=>{const boundary=nextBoundary();setNextRefresh(boundary);timer=setTimeout(()=>{if(document.visibilityState!=='hidden')void refresh();schedule()},Math.max(1,boundary-Date.now()))};schedule();
  const resume=()=>{if(document.visibilityState==='visible'){void refresh();clearTimeout(timer);schedule()}};document.addEventListener('visibilitychange',resume);
  return()=>{active=false;clearTimeout(timer);document.removeEventListener('visibilitychange',resume);controller.current?.abort()};
 },[refresh]);
 return {snapshot,history,loading,refreshing,error,lastChecked,nextRefresh,refresh};
}
