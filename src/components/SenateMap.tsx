import {useEffect,useMemo,useState} from 'react';
import {geoAlbersUsa,geoPath} from 'd3-geo';
import type {FeatureCollection,Geometry} from 'geojson';
import {Minus,Plus,RotateCcw,ArrowUpRight} from 'lucide-react';
import states from '../../config/states.json';
import {color,metric,metricLabel,modes} from '../lib/analytics';
import type {Mode,Office,Snapshot} from '../types';
import './maps.css';

interface Props {snapshot:Snapshot;office:Office;mode:Mode;selected:string|null;onSelect:(state:string)=>void}
const SMALL:Record<string,[number,number]>={VT:[849,90],NH:[889,112],MA:[919,140],RI:[929,168],CT:[909,196],NJ:[891,226],DE:[880,255],MD:[862,283]};
export default function SenateMap({snapshot,office,mode,selected,onSelect}:Props){
 const [geo,setGeo]=useState<FeatureCollection<Geometry>|null>(null);
 const [hovered,setHovered]=useState<string|null>(null);
 const [zoom,setZoom]=useState(1);
 const [pan,setPan]=useState({x:0,y:0});
 const [drag,setDrag]=useState<{x:number;y:number;px:number;py:number}|null>(null);
 useEffect(()=>{const controller=new AbortController();fetch(`${import.meta.env.BASE_URL}geo/states.json`,{signal:controller.signal}).then(r=>r.json()).then(setGeo).catch(()=>{});return()=>controller.abort()},[]);
 const paths=useMemo(()=>{if(!geo)return [];const projection=geoAlbersUsa().fitExtent([[18,25],[840,560]],geo);const path=geoPath(projection);return geo.features.map(f=>({id:String(f.id).padStart(2,'0'),d:path(f)??'',centroid:path.centroid(f)}))},[geo]);
 const races=snapshot.races.filter(r=>r.office===office);
 const focus=states.find(s=>s.abbr===(hovered??selected));
 const race=focus?races.find(r=>r.state===focus.abbr):undefined;
 const value=race?metric(snapshot,race,mode):null;
 return <div className="atlas-map-shell">
  <div className="map-topline"><span><span className="tiny-cross">✦</span> UNITED STATES</span><span>{races.length} CONTESTS · NOV 03, 2026</span></div>
  <div className="map-canvas">
   {!geo&&<p className="map-loading" role="status">Loading state boundaries…</p>}
   <svg className="nation-map" viewBox="0 0 960 600" aria-label={`${office} election map, ${modes.find(m=>m.id===mode)?.label}. Select any state to explore.`} onPointerDown={e=>{if(zoom>1&&e.target===e.currentTarget){e.currentTarget.setPointerCapture(e.pointerId);setDrag({x:e.clientX,y:e.clientY,px:pan.x,py:pan.y})}}} onPointerMove={e=>{if(drag){const scale=960/e.currentTarget.getBoundingClientRect().width;setPan({x:drag.px+(e.clientX-drag.x)*scale,y:drag.py+(e.clientY-drag.y)*scale})}}} onPointerUp={()=>setDrag(null)}>
    <defs><pattern id="missing" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="7" height="7" fill="#243345"/><line x1="0" x2="0" y1="0" y2="7" stroke="#405168" strokeWidth="2"/></pattern><pattern id="map-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".65" fill="#73849a" opacity=".15"/></pattern></defs>
    <rect width="960" height="600" fill="url(#map-dots)" pointerEvents="none"/>
    <g transform={`translate(${480*(1-zoom)+pan.x} ${300*(1-zoom)+pan.y}) scale(${zoom})`}>
    {paths.map(p=>{const state=states.find(s=>s.fips===p.id)!;const r=races.find(x=>x.state===state.abbr);const n=r?metric(snapshot,r,mode):null;const active=state.abbr===selected;const label=`${state.name}: ${r?metricLabel(n,mode,r):'No 2026 '+office+' race'}. Open state and county details.`;return <path key={p.id} d={p.d} data-state={state.abbr} data-race={Boolean(r)} data-testid={`state-${state.abbr}`} className={`state-shape ${active?'selected':''} ${r?'has-race':'no-race'}`} fill={r?color(n,mode,r.candidates[0]?.party==='I'):'#1c2939'} tabIndex={0} role="button" aria-label={label} aria-pressed={active} onClick={()=>onSelect(state.abbr)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(state.abbr)}}} onMouseEnter={()=>setHovered(state.abbr)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(state.abbr)} onBlur={()=>setHovered(null)}><title>{label}</title></path>})}
    {paths.map(p=>{const state=states.find(s=>s.fips===p.id)!;const [x,y]=p.centroid;if(!Number.isFinite(x)||!Number.isFinite(y))return null;const small=SMALL[state.abbr];return <g key={`label-${p.id}`} aria-hidden="true" pointerEvents="none">{small&&<line x1={x} y1={y} x2={small[0]-12} y2={small[1]-4} className="state-leader"/>}<text x={small?.[0]??x} y={(small?.[1]??y)+3} className={`state-label ${state.abbr===selected?'active':''}`} textAnchor="middle">{state.abbr}</text></g>})}
    </g>
    <path d="M35 462H228M238 462H365" className="inset-rule"/><text x="41" y="579" className="inset-text">ALASKA</text><text x="256" y="579" className="inset-text">HAWAII</text>
   </svg>
   {focus&&<div className="map-info" aria-live="polite"><div><strong>{focus.name}</strong><ArrowUpRight size={15}/></div><b>{race?metricLabel(value,mode,race):'No '+office.toLowerCase()+' race'}</b><span>{race?`${race.candidates[0]?.name??'Candidate unavailable'} · ${race.candidates[0]?.party??''}`:'County history available'}</span></div>}
   <div className="map-zoom" aria-label="Map zoom controls"><button aria-label="Zoom in map" disabled={zoom>=2.5} onClick={()=>setZoom(v=>Math.min(2.5,v+.3))}><Plus size={16}/></button><button aria-label="Zoom out map" disabled={zoom<=1} onClick={()=>setZoom(v=>Math.max(1,v-.3))}><Minus size={16}/></button><button aria-label="Reset map zoom" onClick={()=>{setZoom(1);setPan({x:0,y:0})}}><RotateCcw size={15}/></button></div>
  </div>
  <div className="map-legend" data-testid="map-legend"><span>{mode==='difference'?'Polymarket higher':'Republican advantage'}</span><div className={`legend-gradient ${mode==='difference'?'difference':''}`}/><span>{mode==='difference'?'Kalshi higher':'D / independent advantage'}</span><span className="legend-key"><i className="missing-key"/> No usable data</span><span className="legend-key"><i className="no-race-key"/> No race</span></div>
  <div className="map-footnote">{mode==='polling'?'Polling Forecast’s reported polling average: first listed candidate minus Republican, in percentage points.':mode==='forecast'?'Polling Forecast model probability for the first listed candidate. A forecast is not a race call.':mode==='difference'?'Difference calculated only for explicitly reviewed equivalent outcomes. Hatched states have no comparable pair.':'YES contract midpoints for the first listed candidate or their party. Market prices are not election results.'} <span>Select a state to explore counties.</span></div>
 </div>
}
