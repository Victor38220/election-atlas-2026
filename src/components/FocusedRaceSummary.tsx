import {ArrowUpRight,ChevronRight} from 'lucide-react';
import type {Race,Snapshot} from '../types';
import {date,market,metricLabel,party,partyColor,pct,projectedWinner,shortDate,summary} from '../lib/analytics';
export default function FocusedRaceSummary({snapshot,race,onDetails}:{snapshot:Snapshot;race:Race;onDetails:()=>void}){
 const winner=projectedWinner(snapshot,race),polling=summary(snapshot,race);
 const candidate=winner?.candidate;
 const margin=polling?.poll_margin==null?null:polling.poll_margin*(candidate?.id===race.candidates[0]?.id?1:-1);
 return <article className="focused-race-card" data-testid={`race-summary-${race.office}`} style={{'--party':partyColor(candidate?.party)} as React.CSSProperties}>
  <div className="race-card-top"><span>{race.office==='Senate'?'US Senate':'Governor'}{race.election_type==='special'?' · Special':''}</span><button aria-label={`More ${race.office} race details`} onClick={onDetails}><ChevronRight size={17}/></button></div>
  {candidate?<><div className="favorite-heading"><span className="favorite-party">{candidate.party}</span><h2>{candidate.name}</h2></div><p className="favorite-caption">{party(candidate.party)} · Model favorite ({pct(winner.probability,0)})</p></>:<><h2>No model favorite</h2><p className="favorite-caption">No decisive forecast available.</p></>}
  <div className="poll-reading"><span>Statewide polling margin</span><strong style={{color:margin!=null&&margin<0?'#e4bc81':'var(--party)'}}>{candidate&&margin!=null?`${margin>0?'+':''}${margin.toFixed(1)}`:'—'}<small>{margin!=null&&candidate?' pp':''}</small></strong><span>{candidate?`${candidate.name.split(' ').slice(-1)[0]} minus opponent`:'Unavailable'} · {shortDate(polling?.as_of)}</span></div>
  <div className="focused-market-pair" aria-label={`${race.office} model favorite market prices`}>
  {(['kalshi','polymarket'] as const).map(provider=>{const entry=candidate?market(snapshot,race,provider,candidate.id):undefined;const quote=entry?.quote;const stale=quote&&(snapshot.providers[provider]?.status==='error'||Date.now()-Date.parse(quote.fetched_at)>90000);return <div className="focused-market" data-provider={provider} key={provider}><a href={entry?.contract.url} target="_blank" rel="noreferrer" aria-label={`${provider==='kalshi'?'Kalshi':'Polymarket'} ${race.office} favorite contract`} title={entry?`${entry.contract.question}\nFetched ${date(quote?.fetched_at)}\n${quote?.warning??''}`:'No verified contract'}><span>{provider==='kalshi'?'Kalshi':'Polymarket'}<ArrowUpRight size={12}/></span><strong>{pct(quote?.price,1)}</strong></a><small>{quote?.price==null?'Unavailable':stale?'Saved YES price':'YES midpoint'}</small></div>})}
  </div><p className="favorite-market-caption">Both prices refer to {candidate?.name.split(' ').slice(-1)[0]??'the model favorite'}. Different settlement rules; no blended estimate.</p>
  <button className="race-more" onClick={onDetails}>Polls, trends & sources<ChevronRight size={14}/></button>
  <span className="sr-only">{metricLabel(polling?.poll_margin??null,'polling',race)}</span>
 </article>
}
