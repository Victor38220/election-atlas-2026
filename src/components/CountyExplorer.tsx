import {useEffect,useMemo,useState} from 'react';
import {geoConicEqualArea,geoMercator,geoPath} from 'd3-geo';
import type {FeatureCollection,Geometry} from 'geojson';
import {Search,RefreshCw,ExternalLink} from 'lucide-react';
import type {Office} from '../types';
import type {CountyLiveResult} from '../types/countyResults';
import {date,partyColor} from '../lib/analytics';
import {useCountyResults} from '../hooks/useCountyResults';
import manifest from '../../config/races.json';
import './maps.css';
export interface CountySelection {name:string;rows:CountyLiveResult[];office:Office}
interface Props {state:string;stateName:string;fips:string;focused?:boolean;onCountyChange?:(selection:CountySelection|null)=>void}
export function countyLeader(row:CountyLiveResult|undefined){if(!row||!row.total||row.status!=='reporting')return null;const sorted=[...row.candidates].sort((a,b)=>b.votes-a.votes);return sorted[0]?.votes>0&&sorted[0].votes!==sorted[1]?.votes?sorted[0]:null}
export default function CountyExplorer({state,stateName,fips,focused=false,onCountyChange}:Props){
 const [geo,setGeo]=useState<FeatureCollection<Geometry>|null>(null),[geometryError,setGeometryError]=useState(''),[search,setSearch]=useState(''),[selected,setSelected]=useState<string|null>(null);
 const offices=useMemo(()=>manifest.filter(r=>r.state===state).map(r=>r.office as Office),[state]);
 const [office,setOffice]=useState<Office>(()=>offices.includes('Senate')?'Senate':'Governor');
 const {data,loading,error,supported,refresh}=useCountyResults(state,geo);
 useEffect(()=>{const controller=new AbortController();setGeo(null);setGeometryError('');setSearch('');setSelected(null);setOffice(offices.includes('Senate')?'Senate':'Governor');fetch(import.meta.env.BASE_URL+'geo/counties/'+state+'.json',{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error('County boundaries unavailable.');return r.json()}).then(setGeo).catch(e=>{if(!controller.signal.aborted)setGeometryError(String(e))});return()=>controller.abort()},[state,offices]);
 const paths=useMemo(()=>{if(!geo)return [];const projection=state==='AK'?geoConicEqualArea().parallels([55,65]).rotate([154,0]).center([0,64]):geoMercator();projection.fitExtent([[12,12],[588,360]],geo);const path=geoPath(projection);return geo.features.map(f=>({fips:String(f.id).padStart(5,'0'),name:String(f.properties?.name??''),d:path(f)??''}))},[geo,state]);
 const rows=useMemo(()=>data?.rows.filter(r=>r.office===office)??[],[data,office]);
 const selectedRows=useMemo(()=>data?.rows.filter(r=>r.fips===selected)??[],[data,selected]);
 useEffect(()=>{onCountyChange?.(selected?{name:paths.find(p=>p.fips===selected)?.name??'Selected county',rows:selectedRows,office}:null)},[selected,paths,selectedRows,office,onCountyChange]);
 const filtered=paths.filter(p=>p.name.toLowerCase().includes(search.toLowerCase()));
 const reporting=rows.filter(r=>r.status==='reporting'&&(r.total??0)>0).length;
 const hasRows=rows.length>0;
 const message=!supported?'No verified 2026 live county feed is connected for this state.':!hasRows&&!loading?'No county reports are available for this race yet.':reporting===0?'County feed connected. Awaiting reported votes.':`${reporting} of ${paths.length} counties have reported votes.`;
 if(geometryError)return <div className="county-empty" role="status">{geometryError}</div>;
 return <section className={`county-explorer live-county ${focused?'focused-county':''}`} aria-label={`${stateName} live county results`}>
  {!focused&&<div className="county-intro"><span className="eyebrow">2026 · LIVE RETURNS</span><h3>{stateName}, county by county</h3></div>}
  <div className="county-live-toolbar"><span>2026 county results</span><div className="county-office-tabs" aria-label="County election office">{offices.length?offices.map(o=><button key={o} aria-pressed={office===o} onClick={()=>setOffice(o)}>{o==='Senate'?'Senate':'Governor'}</button>):<span>No Senate or governor election</span>}</div>{supported&&<button className="county-refresh" aria-label="Refresh live county results" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={14} className={loading?'spin':''}/></button>}</div>
  <p className={`county-live-status ${reporting?'has-reports':''}`} role="status">{loading&&!data?'Checking the official county feed…':message}</p>
  {error&&<p className="county-live-error">County refresh failed. {data?'Last successful 2026 reports retained.':'No count is available.'}</p>}
  {!geo&&<p className="county-empty">Loading county boundaries…</p>}
  <div className="county-map"><svg viewBox="0 0 600 375" aria-label={`${stateName} 2026 ${office} live county map`}>{paths.map(p=>{const row=rows.find(r=>r.fips===p.fips);const leader=countyLeader(row);const status=row?(row.status==='awaiting'?'Awaiting reported votes':`${row.total?.toLocaleString()??'Unknown'} votes reported${leader?', '+leader.name+' leads':''}`):'No live report available';const label=`${p.name}: ${status}`;return <path key={p.fips} data-county={p.fips} data-status={row?.status??'unavailable'} d={p.d} fill={leader?partyColor(leader.party):row?.status==='reporting'?'#52627a':'#28374b'} className={`county-shape ${p.fips===selected?'selected':''}`} tabIndex={0} role="button" aria-label={label} aria-pressed={p.fips===selected} onClick={()=>setSelected(p.fips)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(p.fips)}}}><title>{label}</title></path>})}</svg><div className="county-map-caption"><span><i style={{background:partyColor('D')}}/>D leads</span><span><i style={{background:partyColor('R')}}/>R leads</span><span><i style={{background:partyColor('I')}}/>Independent / other</span><span><i style={{background:'#28374b'}}/>No reported votes</span></div></div>
  <p className="county-map-hint">Click a county for its 2026 reports. Polls and prediction-market contracts remain statewide.</p>
  <details className="county-directory"><summary>Find a county</summary><label className="county-search"><Search size={15}/><input aria-label="Search counties" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search counties…"/></label><div className="county-table-wrap"><table className="county-table"><thead><tr><th>County</th><th>Votes reported</th><th>Status</th></tr></thead><tbody>{filtered.map(p=>{const row=rows.find(r=>r.fips===p.fips);return <tr key={p.fips} className={p.fips===selected?'active':''}><td><button onClick={()=>setSelected(p.fips)}>{p.name}</button></td><td>{row?.total==null?'—':row.total.toLocaleString()}</td><td>{row?.status==='reporting'?'Reporting':row?.status==='awaiting'?'Awaiting votes':'Not available'}</td></tr>})}</tbody></table></div></details>
  {data&&<p className="county-source"><a href={data.source_url} target="_blank" rel="noreferrer">{data.source_name}<ExternalLink size={11}/></a>{data.source_time?` · Source time: ${/^\d{4}-\d{2}-\d{2}T/.test(data.source_time)?date(data.source_time):data.source_time}`:''}<br/>Fetched {date(data.fetched_at)} · Unofficial reported counts. {data.message}</p>}
  {!supported&&<p className="county-source">County polling, county prediction markets, and a verified live count are unavailable here. Statewide figures stay in the race cards.</p>}
  <span className="sr-only">Geography reference FIPS {fips}. All county results on this view are from November 3, 2026.</span>
 </section>
}
