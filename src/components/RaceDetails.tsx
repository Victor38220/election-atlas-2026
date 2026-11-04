import {useMemo,useState} from 'react';
import {ArrowUpRight,ChevronDown,ExternalLink,Search,X} from 'lucide-react';
import type {Contract,History,Poll,Quote,Race,Snapshot} from '../types';
import {date,difference,market,money,party,pct,points,shortDate,summary,projectedWinner} from '../lib/analytics';
import {OddsHistoryChart,PollingChart,contractLabel} from './Charts';

function SourceLink({href,children}:{href:string;children:React.ReactNode}) {return <a href={href} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={12} aria-hidden="true"/></a>;}
function MarketCard({contract,quote,modelProbability}:{contract:Contract;quote:Quote|undefined;modelProbability:number|null}) {
 const comparableModel=contract.outcome_type==='party'&&contract.outcome==='D'&&modelProbability!=null;
 const stale=quote!=null&&Date.now()-Date.parse(quote.fetched_at)>90_000;
 return <article className={`market-card ${contract.provider}`}>
   <div className="market-card-heading"><span className={`provider-label ${contract.provider}`}>{contract.provider==='kalshi'?'Kalshi':'Polymarket'}</span><span className="status-chip">{contract.status}</span></div>
   <div className="market-price">{pct(quote?.price)}<span>YES midpoint</span></div>
   <p className="market-outcome">{contractLabel(contract)}</p>
   <p className="market-question">{contract.question}</p>
   <dl className="quote-grid"><div><dt>YES bid / ask</dt><dd>{pct(quote?.bid)} / {pct(quote?.ask)}</dd></div><div><dt>Last trade · raw</dt><dd>{pct(quote?.last_trade)}</dd></div><div><dt>Volume</dt><dd>{money(quote?.volume??null)} {contract.provider==='kalshi'?'contracts':'USD'}</dd></div><div><dt>{contract.provider==='kalshi'?'Bid size':'Liquidity'}</dt><dd>{money(quote?.liquidity??null)} {contract.provider==='kalshi'?'contracts':'USD'}</dd></div></dl>
   {stale&&<p className="data-warning">Saved observation from {date(quote?.fetched_at)}. Check provider status for the latest refresh; this is not a fresh live quote.</p>}
   {quote?.warning&&<p className="data-warning">{quote.warning}</p>}
   {comparableModel&&quote?.price!=null&&<p className="model-market-gap">Market − model: <strong>{points((quote.price-modelProbability!)*100)}</strong><span>Descriptive difference for the Democratic outcome; the model and contract measure different things.</span></p>}
   <div className="market-meta"><p>Method: {quote?.pricing_method.replaceAll('_',' ')??'Unavailable'}</p><p>Fetched: {date(quote?.fetched_at)}</p><p>Source updated: {date(quote?.source_timestamp)}</p></div>
   <details className="contract-rules"><summary>Resolution terms <ChevronDown size={13} aria-hidden="true"/></summary><p>{contract.rules}</p><dl><dt>Market ID</dt><dd>{contract.market_id}</dd><dt>Settlement</dt><dd>{contract.settlement.replaceAll('_',' ')}</dd>{contract.outcome_id&&<><dt>Outcome identifier</dt><dd>{contract.outcome_id}</dd></>}</dl></details>
   <SourceLink href={contract.url}>View original contract</SourceLink>
 </article>;
}

function PollRow({poll}:{poll:Poll}) {
 return <article className="poll-row">
   <div className="poll-row-heading"><strong>{poll.pollster}</strong><span>{points(poll.margin)}</span></div>
   <p className="poll-row-meta">{shortDate(poll.start)}–{shortDate(poll.end)} · {poll.sample==null?'Sample not reported':`n=${poll.sample.toLocaleString()}`} · {poll.population??'Population not reported'}</p>
   {poll.results.length>0?<div className="poll-results">{poll.results.map((r,i)=><span key={`${r.name}-${i}`}>{r.name}{r.party?` (${r.party})`:''} <b>{pct(r.share)}</b></span>)}</div>:poll.figures?<p>{poll.figures}</p>:null}
   {poll.sponsor&&<p className="poll-row-meta">Sponsor: {poll.sponsor}</p>}
   <details className="poll-methodology"><summary>Source and methodology</summary><p>Provider: {poll.provider==='votehub'?'VoteHub':'Polling Forecast'}. {poll.attribution}</p><p>Licence: {poll.licence}</p>{Object.entries(poll.methodology).filter(([,v])=>v!=null).map(([key,value])=><p key={key}>{key.replaceAll('_',' ')}: {String(value)}</p>)}<p>Underlying poll: {poll.underlying_id}</p></details>
   {poll.url&&<SourceLink href={poll.url}>Original release</SourceLink>}
 </article>;
}

export function RaceDetails({snapshot,race,history,onClose}:{snapshot:Snapshot;race:Race;history:History;onClose:()=>void}) {
 const [tab,setTab]=useState<'overview'|'polls'>('overview');
 const [query,setQuery]=useState('');const [showAll,setShowAll]=useState(false);
 const polling=summary(snapshot,race);
 const polls=useMemo(()=>snapshot.polls.filter(p=>p.race_id===race.id).sort((a,b)=>(b.end??'').localeCompare(a.end??'')),[snapshot.polls,race.id]);
 const filtered=polls.filter(p=>`${p.pollster} ${p.population??''} ${p.sponsor??''}`.toLowerCase().includes(query.toLowerCase()));
 const delta=difference(snapshot,race);
 const favorite=projectedWinner(snapshot,race)?.candidate;
 const quotePairs=race.candidates.filter(c=>c.id===favorite?.id).flatMap(candidate=>(['kalshi','polymarket'] as const).flatMap(provider=>{
   const entry=market(snapshot,race,provider,candidate.id);return entry?[{...entry,candidate}]:[];
 }));
 return <section className="race-details" aria-label={`${race.state_name} ${race.office} race details`}>
   <div className="race-details-header"><div><p className="eyebrow">{race.office} · 2026 {race.election_type==='special'?'special election':'general election'}</p><h2>{race.state_name}<span className="state-code">{race.state}</span></h2></div><button className="icon-button close-details" type="button" onClick={onClose} aria-label="Close race details"><X size={20}/></button></div>
   <p className="race-incumbent">Incumbent: {race.incumbent??'Not verified'}{race.incumbent_party?` (${race.incumbent_party})`:''} · {party(race.defending_party)} seat</p>
   <div className="candidate-list">{race.candidates.map(candidate=><div className={`candidate candidate-${candidate.party.toLowerCase()}`} key={candidate.id}><span className={`party-dot party-${candidate.party.toLowerCase()}`}/><div><strong>{candidate.name}</strong><span>{party(candidate.party)}{candidate.caucus?` · ${candidate.caucus} caucus`:''}</span></div><span className="candidate-party">{candidate.party}</span></div>)}</div>
   <p className="data-note">Candidates shown as provided by Polling Forecast. Other ballot candidates may be absent. No race calls are inferred from prices or forecasts.</p>
   <div className="detail-tabs" role="tablist" aria-label="Race information"><button type="button" role="tab" id={`overview-tab-${race.id}`} aria-selected={tab==='overview'} aria-controls={`detail-panel-${race.id}`} className={tab==='overview'?'active':''} onClick={()=>setTab('overview')}>Overview</button><button type="button" role="tab" id={`polls-tab-${race.id}`} aria-selected={tab==='polls'} aria-controls={`detail-panel-${race.id}`} className={tab==='polls'?'active':''} onClick={()=>setTab('polls')}>Individual polls <span>{polls.length}</span></button></div>
   <div id={`detail-panel-${race.id}`} role="tabpanel" aria-labelledby={`${tab}-tab-${race.id}`}>
   {tab==='overview'?<>
     <section className="polling-summary"><div className="section-heading"><h3>Polling & forecast</h3>{polling&&<span className="rating-chip">{polling.rating??'Unrated'}</span>}</div><p className="metric-candidate">Reference outcome: {race.candidates[0]?.name} ({race.candidates[0]?.party})</p><div className="detail-metrics"><div><span>Reported poll average</span><strong>{points(polling?.poll_margin)}</strong><small>Margin vs. Republican</small></div><div><span>Model forecast margin</span><strong>{points(polling?.forecast_margin)}</strong><small>Polling Forecast model</small></div><div><span>Model win probability</span><strong>{pct(polling?.probability)}</strong><small>Forecast, not vote share</small></div></div><p className="data-note">{polling?.polls_used??'No'} polls used · As of {date(polling?.as_of)}. The reported polling average, modeled margin and modeled win probability are different measurements.</p>{polling&&<SourceLink href={polling.url}>Polling Forecast · {polling.licence}</SourceLink>}</section>
     <section className="market-section"><div className="section-heading"><h3>Prediction markets</h3><ExternalLink size={14} aria-hidden="true"/></div><p className="data-note">Prices from valid two-sided quotes. Prices can reflect spreads, liquidity, fees and settlement rules; they are not election results.</p><div className="market-card-grid">{quotePairs.length?quotePairs.map(({contract,quote,candidate})=><MarketCard key={contract.id} contract={contract} quote={quote} modelProbability={candidate.id===polling?.comparison_candidate_id?(polling?.probability??null):null}/>):<div className="empty-state">No verified market contract is available for these candidates.</div>}</div><div className="market-difference"><span>Kalshi − Polymarket · equivalent outcome</span><strong>{points(delta)}</strong><p>{delta==null?'No compatible pair has been approved. Settlement terms or available outcomes differ; a numerical spread would be misleading.':`${delta>0?'Kalshi':delta<0?'Polymarket':'Neither provider'} is higher for the verified equivalent outcome.`}</p></div></section>
     <OddsHistoryChart snapshot={snapshot} race={race} history={history}/>
     <section className="detail-sources"><h3>Race sources</h3>{race.sources.map((url,i)=><SourceLink key={url} href={url}>{i===0?'Polling Forecast race':url.includes('senate.gov')?'U.S. Senate class roster':'Ballotpedia election roster'}</SourceLink>)}<p className="data-note">Race metadata updated {date(race.updated_at)}. {race.election_type==='special'?'Special election; provider identifiers are kept separate from regular races.':''}</p></section>
   </>:<section className="individual-polls"><PollingChart polls={polls} race={race}/><div className="section-heading"><h3>Individual polls <span className="muted">{filtered.length}</span></h3></div><label className="search-field"><Search size={15} aria-hidden="true"/><input value={query} onChange={event=>{setQuery(event.target.value);setShowAll(false)}} placeholder="Search pollster, sponsor or population" aria-label="Search individual polls"/></label><p className="data-note">Margins are the first listed candidate minus Republican, in percentage points. Rows retain their original licensing and release links. Repeated underlying polls are deduplicated.</p>{filtered.length?filtered.slice(0,showAll?undefined:15).map(poll=><PollRow key={poll.id} poll={poll}/>):<div className="empty-state">No polls match this search.</div>}{!showAll&&filtered.length>15&&<button className="secondary-button" type="button" onClick={()=>setShowAll(true)}>Show all {filtered.length} polls</button>}</section>}
   </div>
 </section>;
}
export default RaceDetails;
