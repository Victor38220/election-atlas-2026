import {useCallback,useEffect,useRef,useState} from 'react';
import type {FeatureCollection,Geometry} from 'geojson';
import type {CountyLiveData} from '../types/countyResults';
import {normalizeCalifornia} from '../lib/countyCalifornia';
import {normalizeNorthCarolina} from '../lib/countyNorthCarolina';
import {normalizeGeorgia} from '../lib/countyGeorgia';
import {normalizeVirginia} from '../lib/countyVirginia';
import {normalizeOhio} from '../lib/countyOhio';
import {normalizeArizona} from '../lib/countyArizona';
import {normalizeColorado,unzipColorado} from '../lib/countyColorado';
import {normalizeTexas} from '../lib/countyTexas';
import {getBatch} from '../lib/live';
import {normalizeNationalCounties} from '../lib/countyNational';
import manifest from '../../config/races.json';
import type {Race} from '../types';
const legacySupported=new Set(['CA','NC','GA','VA','OH','AZ','MN','CO','TX']);
const supported=new Set(manifest.map(r=>r.state));
function valid(data:unknown,state:string):data is CountyLiveData{return Boolean(data&&typeof data==='object'&&'year' in data&&data.year===2026&&'state'in data&&data.state===state&&'election_date'in data&&data.election_date==='2026-11-03'&&'rows'in data&&Array.isArray(data.rows)&&data.rows.every(r=>r.year===2026&&r.state===state))}
export function useCountyResults(state:string,geo:FeatureCollection<Geometry>|null){
 const [data,setData]=useState<CountyLiveData|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null);
 const busy=useRef(false);const controller=useRef<AbortController|null>(null);const epoch=useRef(0);
 const legacyAt=useRef<Record<string,number>>({});
 const refresh=useCallback(async()=>{if(!geo||!supported.has(state)||busy.current)return;busy.current=true;setLoading(true);const run=epoch.current;controller.current=new AbortController();try{let next:CountyLiveData;const signal=AbortSignal.any([controller.current.signal,AbortSignal.timeout(22000)]);const fetched=new Date().toISOString();const request=async(path:string)=>{const response=await fetch(path,{signal});if(!response.ok)throw new Error(`County source returned HTTP ${response.status}`);return response};
   try{next=normalizeNationalCounties(await (await request('/api/counties/national/'+state)).json(),state,geo,fetched,manifest as Race[]);if(!next.rows.length&&legacySupported.has(state))throw new Error('Shared source has no compatible county data')}
   catch(primaryError){
   if(!legacySupported.has(state))throw primaryError;
   const minimum=state==='AZ'?120000:state==='OH'?180000:state==='TX'?30000:60000;if(Date.now()-(legacyAt.current[state]??0)<minimum)throw primaryError;legacyAt.current[state]=Date.now();
   if(state==='TX'){const raw=await getBatch(['Senate','Governor'].map(office=>'/api/counties/TX/'+office),signal);next=normalizeTexas({election_date:'2026-11-03',Senate:raw[0],Governor:raw[1]},geo,fetched)}
   else if(state==='GA'){const raw=await getBatch(['Senate','Governor'].map(office=>'/api/counties/GA/'+office),signal);next=normalizeGeorgia({Senate:raw[0],Governor:raw[1]},geo,fetched)}
   else if(state==='NC'){const raw=await getBatch(['metadata','candidates','results'].map(part=>'/api/counties/NC/'+part),signal);next=normalizeNorthCarolina({county:raw[0],candidates:raw[1],results:raw[2]},geo,fetched)}
   else if(state==='VA')next=normalizeVirginia(await (await request('/api/counties/VA')).json(),geo,fetched);
   else if(state==='AZ')next=normalizeArizona(await (await request('/api/counties/AZ')).json(),geo,fetched);
   else if(state==='OH')next=normalizeOhio(await (await request('/api/counties/OH')).text(),geo,fetched);
   else if(state==='CO'){const report=await request('/api/counties/CO');next=normalizeColorado(await unzipColorado(await report.arrayBuffer()),geo,fetched)}
   else if(state==='MN'){const mirrored=await (await request('/api/counties/MN')).json();if(!valid(mirrored,state))throw new Error('Invalid Minnesota collector snapshot');next=mirrored}
   else next=normalizeCalifornia(await (await request('/api/counties/'+state)).json(),geo,fetched);
   }
   if(run!==epoch.current)return;setData(next);setError(null);try{localStorage.setItem('county-live-2026-'+state,JSON.stringify(next))}catch{/* Memory remains usable. */}}catch(exc){if(!controller.current?.signal.aborted&&run===epoch.current)setError(String(exc))}finally{if(run===epoch.current){busy.current=false;setLoading(false)}}},[geo,state]);
 useEffect(()=>{let active=true;epoch.current++;const run=epoch.current;setData(null);setError(null);setLoading(false);busy.current=false;
  if(!supported.has(state)||!geo)return;
  (async()=>{let saved:CountyLiveData|null=null;try{const candidate=JSON.parse(localStorage.getItem('county-live-2026-'+state)??'null');if(valid(candidate,state))saved=candidate}catch{/* Optional cache. */}try{const response=await fetch(import.meta.env.BASE_URL+'data/live-counties/'+state+'.json');if(response.ok){const seed=await response.json();if(valid(seed,state)&&(!saved||Date.parse(seed.fetched_at)>Date.parse(saved.fetched_at)))saved=seed}}catch{/* Live request remains independent. */}if(active&&run===epoch.current){if(saved)setData(saved);void refresh()}})();
  const interval=30000;let timer:ReturnType<typeof setTimeout>;const schedule=()=>{timer=setTimeout(()=>{if(document.visibilityState!=='hidden')void refresh();schedule()},interval-Date.now()%interval)};schedule();
  const resume=()=>{if(document.visibilityState==='visible')void refresh()};document.addEventListener('visibilitychange',resume);const manual=()=>void refresh();window.addEventListener('election-atlas:refresh',manual);
  return()=>{active=false;clearTimeout(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('election-atlas:refresh',manual);controller.current?.abort()};
 },[state,geo,refresh]);
 return {data,loading,error,supported:supported.has(state),refresh};
}
