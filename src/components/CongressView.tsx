import { useState } from 'react';
import type { ChamberData, CongressData, SeatResult } from '../lib/chambers';
import './congress.css';

type Props = { data: CongressData | null; loading: boolean; error: string | null; onRefresh: () => void };
type Dot = { kind: 'continuing' | 'called' | 'remaining'; party?: string | null; label: string; seat?: SeatResult };

function partyKey(party?: string | null) {
  const p = (party || '').toUpperCase();
  if (p === 'D' || p === 'DEM' || p.includes('DEMOCRAT')) return 'dem';
  if (p === 'R' || p === 'GOP' || p === 'REP' || p.includes('REPUBLICAN')) return 'rep';
  if (p === 'I' || p === 'IND' || p.includes('INDEPENDENT')) return 'ind';
  return 'other';
}
function partyLabel(party?: string | null) {
  const key = partyKey(party);
  return key === 'dem' ? 'Democratic' : key === 'rep' ? 'Republican' : key === 'ind' ? 'Independent' : party || 'Party unavailable';
}
function date(value?: string | null) {
  if (!value) return 'not available';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
function seatDescription(seat: SeatResult) {
  return `${seat.label}: ${seat.called ? `${seat.winner_name || 'Winner unavailable'}, ${partyLabel(seat.winner_party)}. AP called${seat.flip ? '; publisher-designated gain' : ''}` : 'Not yet called'}`;
}
function points(total: number) {
  const rings = total > 200 ? 9 : 5;
  const radii = Array.from({ length: rings }, (_, i) => 100 + i * (260 / (rings - 1)));
  const sum = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map(r => Math.floor(total * r / sum));
  for (let i = 0; counts.reduce((a, b) => a + b, 0) < total; i++) counts[i % rings]++;
  return radii.flatMap((radius, ring) => Array.from({ length: counts[ring] }, (_, i) => {
    const angle = Math.PI - (i + 0.5) * Math.PI / counts[ring];
    return { x: 390 + radius * Math.cos(angle), y: 375 - radius * Math.sin(angle), angle };
  })).sort((a, b) => b.angle - a.angle);
}
function ChamberCard({ chamber }: { chamber: ChamberData }) {
  const [selected, setSelected] = useState<SeatResult | null>(null);
  const called = chamber.seats.filter(s => s.called);
  const continuing = chamber.continuing.reduce((sum, c) => sum + c.count, 0);
  const remaining = Math.max(0, chamber.total - continuing - called.length);
  const dots: Dot[] = [
    ...chamber.continuing.flatMap(c => Array.from({ length: c.count }, () => ({ kind: 'continuing' as const, party: c.party, label: `${c.label}: continuing seat` }))),
    ...called.map(seat => ({ kind: 'called' as const, party: seat.winner_party, label: seatDescription(seat), seat })),
    ...chamber.seats.filter(s => !s.called).slice(0, remaining).map(seat => ({ kind: 'remaining' as const, label: seatDescription(seat), seat })),
  ];
  while (dots.length < chamber.total) dots.push({ kind: 'remaining', label: 'Seat not yet called' });
  const order: Record<string, number> = { dem: 0, ind: 1, other: 2, rep: 4 };
  dots.sort((a, b) => (a.kind === 'remaining' ? 3 : order[partyKey(a.party)]) - (b.kind === 'remaining' ? 3 : order[partyKey(b.party)]));
  const partyCounts = (['dem', 'rep', 'ind', 'other'] as const).map(key => ({ key, count: chamber.continuing.filter(c => partyKey(c.party) === key).reduce((sum, c) => sum + c.count, 0) + called.filter(s => partyKey(s.winner_party) === key).length }));
  const coords = points(chamber.total);
  const flips = called.filter(s => s.flip).sort((a, b) => a.state.localeCompare(b.state) || (a.district || '').localeCompare(b.district || '', undefined, { numeric: true }));
  return <article className="congress-card">
    <div className="congress-card-heading"><div><span className="congress-eyebrow">U.S. Congress</span><h2>{chamber.office}</h2></div><span className="congress-majority">{chamber.majority} for {chamber.office === 'Senate' ? 'an outright majority' : 'a majority'}</span></div>
    <div className="congress-counts"><div><strong>{continuing}</strong><span>Continuing</span></div><div><strong>{called.length}</strong><span>AP called</span></div><div><strong>{remaining}</strong><span>Remaining</span></div><div><strong>{chamber.total}</strong><span>Total seats</span></div></div>
    <div className="congress-party-counts" aria-label="Seats by party, including continuing and AP-called seats">{partyCounts.filter(p => p.count > 0).map(p => <span key={p.key}><i className={p.key}/>{p.key === 'dem' ? (chamber.office === 'Senate' ? 'Democratic / aligned' : 'Democratic') : p.key === 'rep' ? 'Republican' : p.key === 'ind' ? 'Independent' : 'Other / unknown'} <strong>{p.count}</strong></span>)}<span><i className="remaining"/>Remaining <strong>{remaining}</strong></span></div>
    <svg className="congress-hemicycle" viewBox="0 0 780 395" role="group" aria-label={`${chamber.office} seat chart: ${continuing} continuing, ${called.length} AP called, ${remaining} remaining. ${chamber.majority} seats needed for a majority.`}>
      {dots.slice(0, chamber.total).map((dot, i) => {
        const point = coords[i];
        const interactive = !!dot.seat;
        return <circle key={dot.seat?.id || `${dot.kind}-${i}`} cx={point.x} cy={point.y} r={chamber.total > 200 ? 6.1 : 13} className={`congress-dot ${dot.kind} party-${partyKey(dot.party)}${dot.seat?.flip && dot.seat.called ? ' is-flip' : ''}`} role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined} aria-label={interactive ? dot.label : undefined} onClick={interactive ? () => setSelected(dot.seat!) : undefined} onKeyDown={interactive ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(dot.seat!); } } : undefined}><title>{dot.label}</title></circle>;
      })}
    </svg>
    <div className="congress-legend" aria-label="Chart legend"><span><i className="dem"/>Democratic</span><span><i className="rep"/>Republican</span><span><i className="ind"/>Independent</span><span><i className="remaining"/>Uncalled</span><span><i className="continuing"/>Continuing (muted)</span><span><i className="flip"/>Gain</span></div>
    <p className="congress-chart-note">{chamber.office === 'Senate' ? 'Continuing Democratic/aligned seats include independents who caucus with Democrats.' : 'House seats fill only after an explicit AP winner call.'} Select an election seat for details.</p>
    <label className="congress-seat-picker"><span>Inspect a race</span><select aria-label={`Inspect ${chamber.office} seat`} value={selected?.id || ''} onChange={e => setSelected(chamber.seats.find(seat => seat.id === e.target.value) || null)}><option value="">Choose a seat</option>{[...chamber.seats].sort((a,b) => a.state.localeCompare(b.state) || (a.district || '').localeCompare(b.district || '', undefined, {numeric:true})).map(seat => <option key={seat.id} value={seat.id}>{seat.label}{seat.called ? ` · ${seat.winner_name || 'Called'}` : ' · Uncalled'}</option>)}</select></label>
    {selected && <div className="congress-selection" aria-live="polite"><button type="button" onClick={() => setSelected(null)} aria-label="Close selected seat">×</button><strong>{selected.label}</strong><span>{selected.called ? `${selected.winner_name || 'Winner unavailable'} · ${partyLabel(selected.winner_party)} · AP called${selected.flip ? ' · Gain' : ''}` : 'Not yet called'}</span>{selected.estimated_vote_in != null && <span>{(selected.estimated_vote_in * 100).toFixed(1)}% estimated vote in · NYT</span>}{selected.source_url && <a href={selected.source_url} target="_blank" rel="noreferrer">View source ↗</a>}</div>}
    <div className="congress-flips"><h3>Called gains <span>{flips.length}</span></h3><p>Publisher-designated gains after an AP call.</p>{flips.length ? <ul>{flips.map(seat => <li key={seat.id}><span>{seat.label} · {seat.winner_name || 'Winner unavailable'}</span><span>{seat.previous_party ? `${partyLabel(seat.previous_party)} → ` : 'Gain · '}{partyLabel(seat.winner_party)}</span>{seat.source_url && <a href={seat.source_url} target="_blank" rel="noreferrer" aria-label={`Source for ${seat.label}`}>↗</a>}</li>)}</ul> : <p>No called gains reported.</p>}</div>
    <p className="congress-source">{chamber.baseline_label} · Source as of {date(chamber.as_of)} · Fetched {date(chamber.fetched_at)}{chamber.source_url && <> · <a href={chamber.source_url} target="_blank" rel="noreferrer">Source ↗</a></>}</p>
  </article>;
}
export default function CongressView({ data, loading, error, onRefresh }: Props) {
  return <section className="congress-view" aria-label="Congress results"><div className="congress-intro"><div><h1>Control of Congress</h1><p>Continuing seats and races called by the Associated Press. Uncalled seats remain gray.</p></div><button type="button" onClick={onRefresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh results'}</button></div>
    {(error || data?.errors.length) ? <div className="congress-alert" role="status">{error && <p>{error}</p>}{data?.errors.map(message => <p key={message}>{message}</p>)}{data && <p>Showing the latest available data; some results may be older.</p>}</div> : null}
    {!data && <p className="congress-empty">{loading ? 'Loading congressional results…' : 'Congressional results are unavailable.'}</p>}
    {data && <div className="congress-grid">{data.senate ? <ChamberCard chamber={data.senate}/> : <div className="congress-card congress-empty">Senate results unavailable.</div>}{data.house ? <ChamberCard chamber={data.house}/> : <div className="congress-card congress-empty">House results unavailable.</div>}</div>}
  </section>;
}
