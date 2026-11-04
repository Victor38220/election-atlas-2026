import {ArrowUpRight,ChevronRight} from 'lucide-react';
import type {Race,Snapshot} from '../types';
import type {RaceResult} from '../lib/results';
import {reportedLeader} from '../lib/results';
import {date,market,metricLabel,party,partyColor,pct,shortDate,summary} from '../lib/analytics';
export default function FocusedRaceSummary({snapshot,race,result,onDetails}:{snapshot:Snapshot;race:Race;result?:RaceResult;onDetails:()=>void}){
 const leader=reportedLeader(result),polling=summary(snapshot,race);
 const normalized=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const matched=leader?race.candidates.find(c=>[c.name,...c.aliases].some(name=>normalized(name)===normalized(leader.name))&&c.party===leader.party):undefined;
 const candidate=leader?{...matched,id:matched?.id??'',name:leader.name,party:leader.party}:null;
 const margin=!matched||polling?.poll_margin==null?null:polling.poll_margin*(candidate?.id===race.candidates[0]?.id?1:-1);
 return <article className="focused-race-card" data-testid={`race-summary-${race.office}`} style={{'--party':partyColor(candidate?.party)} as React.CSSProperties}>
  <div className="race-card-top"><span>{race.office==='Senate'?'US Senate':'Governor'}{race.election_type==='special'?' · Special':''}</span><button aria-label={`More ${race.office} race details`} onClick={onDetails}><ChevronRight size={17}/></button></div>
  {candidate?<><div className="favorite-heading"><span className="favorite-party">{candidate.party}</span><h2>{candidate.name}</h2></div><div className="leader-share"><strong>{pct(leader?.share,1)}</strong><span>of reported votes</span></div><p className="favorite-caption">{party(candidate.party)} · Leading · Unofficial</p><a className="leader-source-time" href={result?.source_url} target="_blank" rel="noreferrer">Reported count · {date(result?.as_of)} ↗</a></>:<><h2>No reported leader</h2><p className="favorite-caption">A verified count is not available, or the reported vote is tied.</p></>}
  <div className="poll-reading"><span>Pre-election polling margin</span><strong style={{color:margin!=null&&margin<0?'#e4bc81':'var(--party)'}}>{candidate&&margin!=null?`${margin>0?'+':''}${margin.toFixed(1)}`:'—'}<small>{margin!=null&&candidate?' pp':''}</small></strong><span>{candidate?`${candidate.name.split(' ').slice(-1)[0]} minus opponent`:'Unavailable'} · {shortDate(polling?.as_of)}</span></div>
  <div className="focused-market-pair" aria-label={`${race.office} reported leader market prices`}>
  {(['kalshi','polymarket'] as const).map(provider=>{const entry=candidate?market(snapshot,race,provider,candidate.id):undefined;const quote=entry?.quote;const stale=quote&&(snapshot.providers[provider]?.status==='error'||Date.now()-Date.parse(quote.fetched_at)>90000);return <div className="focused-market" data-provider={provider} key={provider}><a href={entry?.contract.url} target="_blank" rel="noreferrer" aria-label={`${provider==='kalshi'?'Kalshi':'Polymarket'} ${race.office} leader contract`} title={entry?`${entry.contract.question}\nFetched ${date(quote?.fetched_at)}\n${quote?.warning??''}`:'No verified contract'}><span>{provider==='kalshi'?'Kalshi':'Polymarket'}<ArrowUpRight size={12}/></span><strong>{pct(quote?.price,1)}</strong></a><small>{quote?.price==null?'Unavailable':stale?'Saved YES price':'YES midpoint'}</small></div>})}
  </div><p className="favorite-market-caption">Both prices refer to {candidate?.name.split(' ').slice(-1)[0]??'the reported leader'}. Different settlement rules; no blended estimate.</p>
  <button className="race-more" onClick={onDetails}>Polls, trends & sources<ChevronRight size={14}/></button>
  <span className="sr-only">{metricLabel(polling?.poll_margin??null,'polling',race)}</span>
 </article>
}
