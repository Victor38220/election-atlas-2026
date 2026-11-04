import {useMemo, useState} from 'react';
import {CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import type {Contract, History, Poll, Race, Snapshot} from '../types';
import {date, market, pct, points, shortDate, projectedWinner} from '../lib/analytics';

const chartTheme = {background:'#152131',border:'1px solid #344155',borderRadius:10,color:'#edf3fb',fontSize:12};

export function OddsHistoryChart({snapshot,race,history}:{snapshot:Snapshot;race:Race;history:History}) {
  const [range,setRange]=useState<'24h'|'14d'|'all'>('all');
  const favorite=projectedWinner(snapshot,race)?.candidate;
  const contracts=useMemo(()=>favorite?['kalshi','polymarket'].flatMap(p=>{
    const entry=market(snapshot,race,p as 'kalshi'|'polymarket',favorite.id);
    return entry ? [entry.contract] : [];
  }):[],[snapshot,race,favorite]);
  const data=useMemo(()=>{
    const cutoff=range==='all'?0:Date.now()-(range==='24h'?86400000:14*86400000);
    const rows=new Map<number,Record<string,number>>();
    for(const c of contracts) for(const point of history[c.id]??[]) {
      const t=Date.parse(point.t);
      if(!Number.isFinite(t)||t<cutoff||point.p<0||point.p>1)continue;
      const row=rows.get(t)??{t};row[c.provider]=point.p;rows.set(t,row);
    }
    return [...rows.values()].sort((a,b)=>a.t-b.t);
  },[contracts,history,range]);
  const observations=contracts.reduce((count,c)=>count+(history[c.id]?.length??0),0);
  return <section className="chart-section" aria-label="Observed market price history">
    <div className="section-heading"><div><h3>Market movement</h3><p>YES price · {favorite?.name ?? 'No model favorite'}</p></div><div className="chart-range" aria-label="History time range">{(['24h','14d','all'] as const).map(r=><button type="button" key={r} aria-pressed={range===r} className={range===r?'active':''} onClick={()=>setRange(r)}>{r==='all'?'All observed':r}</button>)}</div></div>
    {data.length===0?<div className="empty-chart"><span className="empty-chart-icon">↗</span><strong>No observed prices in this range</strong><p>History starts when a usable quote is collected. Closed or empty books do not create a price.</p></div>:<>
      <div className="chart-canvas" style={{height:210,width:'100%'}}><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{top:12,right:12,bottom:8,left:-12}}>
        <CartesianGrid stroke="#273448" strokeDasharray="3 5" vertical={false}/>
        <XAxis type="number" dataKey="t" domain={['dataMin','dataMax']} tickFormatter={n=>new Date(n).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} tick={{fill:'#95a7bc',fontSize:10}} axisLine={false} tickLine={false} minTickGap={32}/>
        <YAxis domain={[0,1]} ticks={[0,.25,.5,.75,1]} tickFormatter={n=>pct(n,0)} tick={{fill:'#95a7bc',fontSize:10}} axisLine={false} tickLine={false}/>
        <ReferenceLine y={.5} stroke="#607087" strokeDasharray="4 5"/>
        <Tooltip contentStyle={chartTheme} labelFormatter={n=>date(new Date(Number(n)).toISOString())} formatter={(value,name)=>[pct(typeof value==='number'?value:null),String(name)]}/>
        <Legend wrapperStyle={{fontSize:11,paddingTop:8}}/>
        {contracts.map(c=><Line key={c.id} name={c.provider==='kalshi'?'Kalshi':'Polymarket'} type="linear" dataKey={c.provider} connectNulls stroke={c.provider==='kalshi'?'#e3b979':'#42c6b5'} strokeWidth={2.4} dot={{r:3,strokeWidth:0}} activeDot={{r:5}} isAnimationActive={false}/>)}
      </LineChart></ResponsiveContainer></div>
      <p className="chart-note">{observations.toLocaleString()} actual observations. {data.length===1?'One observation so far; a trend requires more samples.':'Lines connect observed prices only.'} Browser history is saved on this device; archived observations are collected separately.</p>
    </>}
    <p className="chart-note">Providers use separate contracts and settlement rules. Prices are not official results or a chamber-control forecast.</p>
  </section>;
}

export function PollingChart({polls,race}:{polls:Poll[];race:Race}) {
  const data=useMemo(()=>polls.filter(p=>p.end&&p.margin!=null).map(p=>({t:Date.parse(p.end!),margin:p.margin,pollster:p.pollster,id:p.id})).filter(p=>Number.isFinite(p.t)).sort((a,b)=>a.t-b.t),[polls]);
  if(!data.length)return <p className="empty-state">No dated polling observations with a reported margin are available.</p>;
  return <section className="chart-section" aria-label="Individual poll margins">
    <div className="section-heading"><div><h3>What the polls reported</h3><p>{race.candidates[0]?.name} minus Republican · percentage points</p></div></div>
    <div className="chart-canvas" style={{height:180,width:'100%'}}><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{top:12,right:12,bottom:8,left:-10}}>
      <CartesianGrid stroke="#273448" strokeDasharray="3 5" vertical={false}/>
      <XAxis type="number" dataKey="t" domain={['dataMin','dataMax']} tickFormatter={n=>shortDate(new Date(n).toISOString())} tick={{fill:'#95a7bc',fontSize:10}} axisLine={false} tickLine={false}/>
      <YAxis tickFormatter={n=>`${n>0?'+':''}${n}`} tick={{fill:'#95a7bc',fontSize:10}} axisLine={false} tickLine={false}/>
      <ReferenceLine y={0} stroke="#73849c" strokeDasharray="3 4"/>
      <Tooltip contentStyle={chartTheme} content={({active,payload})=>{
        if(!active||!payload?.length)return null;
        const row=payload[0].payload;
        return <div style={{...chartTheme,padding:10}}><strong>{row.pollster}</strong><p>{shortDate(new Date(row.t).toISOString())} · {points(row.margin)}</p></div>;
      }}/>
      <Line dataKey="margin" name="Reported margin" stroke="none" dot={{fill:race.candidates[0]?.party==='I'?'#b092da':'#76a9e8',r:3.5,strokeWidth:0}} activeDot={{r:5}} isAnimationActive={false}/>
    </LineChart></ResponsiveContainer></div>
    <p className="chart-note">Each dot is one poll’s reported margin. This is not a polling average, modeled margin, or forecast trend.</p>
  </section>;
}

export function contractLabel(contract:Contract) {return contract.outcome_type==='party'?`${contract.outcome} party YES`:`${contract.outcome} YES`;}
