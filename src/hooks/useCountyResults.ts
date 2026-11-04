import {useCallback,useEffect,useRef,useState} from 'react';
import type {FeatureCollection,Geometry} from 'geojson';
import type {CountyLiveData} from '../types/countyResults';
import {normalizeCalifornia} from '../lib/countyCalifornia';
import {normalizeNorthCarolina} from '../lib/countyNorthCarolina';
import {normalizeGeorgia} from '../lib/countyGeorgia';
import {getBatch} from '../lib/live';
const supported=new Set(['CA','NC','GA']);
function valid(data:unknown,state:string):data is CountyLiveData{return Boolean(data&&typeof data==='object'&&'year' in data&&data.year===2026&&'state'in data&&data.state===state&&'election_date'in data&&data.election_date==='2026-11-03'&&'rows'in data&&Array.isArray(data.rows)&&data.rows.every(r=>r.year===2026&&r.state===state))}
export function useCountyResults(state:string,geo:FeatureCollection<Geometry>|null){
 const [data,setData]=useState<CountyLiveData|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null);
 const busy=useRef(false);const controller=useRef<AbortController|null>(null);const epoch=useRef(0);
 const refresh=useCallback(async()=>{if(!geo||!supported.has(state)||busy.current)return;busy.current=true;setLoading(true);const run=epoch.current;controller.current=new AbortController();try{let next:CountyLiveData;const signal=AbortSignal.any([controller.current.signal,AbortSignal.timeout(22000)]);const fetched=new Date().toISOString();if(state==='GA'){const raw=await getBatch(['Senate','Governor'].map(office=>'/api/counties/GA/'+office),signal);next=normalizeGeorgia({Senate:raw[0],Governor:raw[1]},geo,fetched)}else if(state==='NC'){const raw=await getBatch(['metadata','candidates','results'].map(part=>'/api/counties/NC/'+part),signal);next=normalizeNorthCarolina({county:raw[0],candidates:raw[1],results:raw[2]},geo,fetched)}else{const response=await fetch('/api/counties/'+state,{signal});if(!response.ok)throw new Error(`County source returned HTTP ${response.status}`);next=normalizeCalifornia(await response.json(),geo,fetched)}if(run!==epoch.current)return;setData(next);setError(null);try{localStorage.setItem('county-live-2026-'+state,JSON.stringify(next))}catch{/* Memory remains usable. */}}catch(exc){if(!controller.current?.signal.aborted&&run===epoch.current)setError(String(exc))}finally{if(run===epoch.current){busy.current=false;setLoading(false)}}},[geo,state]);
 useEffect(()=>{let active=true;epoch.current++;const run=epoch.current;setData(null);setError(null);setLoading(false);busy.current=false;
  if(!supported.has(state)||!geo)return;
  (async()=>{let saved:CountyLiveData|null=null;try{const candidate=JSON.parse(localStorage.getItem('county-live-2026-'+state)??'null');if(valid(candidate,state))saved=candidate}catch{/* Optional cache. */}try{const response=await fetch(import.meta.env.BASE_URL+'data/live-counties/'+state+'.json');if(response.ok){const seed=await response.json();if(valid(seed,state)&&(!saved||Date.parse(seed.fetched_at)>Date.parse(saved.fetched_at)))saved=seed}}catch{/* Live request remains independent. */}if(active&&run===epoch.current){if(saved)setData(saved);void refresh()}})();
  let timer:ReturnType<typeof setTimeout>;const schedule=()=>{timer=setTimeout(()=>{if(document.visibilityState!=='hidden')void refresh();schedule()},60000-Date.now()%60000)};schedule();
  const resume=()=>{if(document.visibilityState==='visible')void refresh()};document.addEventListener('visibilitychange',resume);const manual=()=>void refresh();window.addEventListener('election-atlas:refresh',manual);
  return()=>{active=false;clearTimeout(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('election-atlas:refresh',manual);controller.current?.abort()};
 },[state,geo,refresh]);
 return {data,loading,error,supported:supported.has(state),refresh};
}
