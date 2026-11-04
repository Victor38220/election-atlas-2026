import { ArrowUpRight, Newspaper } from 'lucide-react';
import './notable-races.css';

export interface NotableMarket {
  provider: string;
  url: string;
  volumeContracts?: number | null;
  volumeUsd?: number | null;
  status?: string | null;
  outcomes: { name: string; price?: number | null; status?: string | null }[];
}

export interface NotableNews {
  title: string;
  source: string;
  url: string;
  publishedAt?: string | null;
}

export interface NotableRace {
  id: string;
  title: string;
  location?: string | null;
  electionDate?: string | null;
  markets: NotableMarket[];
  news: NotableNews[];
}

interface Props {
  races: NotableRace[];
  loading?: boolean;
  error?: string | null;
  updatedAt?: string | null;
  methodology?: string | null;
}

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const contracts = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
function date(value?: string | null) {
  if (!value) return null;
  // Date-only values are calendar dates, not local timestamps.
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  return Number.isNaN(parsed.getTime()) ? null : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(parsed);
}

function timestamp(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(parsed);
}

export default function NotableRaces({ races, loading = false, error, updatedAt, methodology }: Props) {
  const visible = races.slice(0, 5);
  return <section className="panel notable-races" aria-labelledby="notable-races-title">
    <div className="notable-heading">
      <div><span className="eyebrow">Beyond the statewide races</span><h2 id="notable-races-title">Other races to watch</h2><p>Other contests drawing market activity.</p></div>
      <span className="notable-heading-meta">{timestamp(updatedAt) ? `Updated ${timestamp(updatedAt)}` : 'Up to 5 races'}</span>
    </div>
    {loading && visible.length === 0 ? <p className="notable-status" role="status">Loading races and sources…</p>
      : visible.length === 0 ? <p className="notable-status" role="status">{error ? 'These races are temporarily unavailable. Please try again later.' : 'No sourced races are available yet.'}</p>
      : <>
        {error && <p className="notable-notice" role="status">Some data may be unavailable or out of date.</p>}
        <div className={`notable-list${visible.some(race => race.news.length > 0) ? ' has-news' : ''}`}>{visible.map((race, index) => <article className="notable-race" key={race.id}>
          <div className="notable-race-main"><span className="notable-number">{String(index + 1).padStart(2, '0')}</span><div><h3>{race.title}</h3><p>{[race.location, date(race.electionDate) && `Election ${date(race.electionDate)}`].filter(Boolean).join(' · ')}</p></div></div>
          <div className="notable-market-list">{race.markets.length ? race.markets.map((market, i) => <a className="notable-market" key={`${market.provider}-${i}`} href={market.url} target="_blank" rel="noreferrer">
            <span className="notable-provider">{market.provider} <ArrowUpRight size={12} aria-hidden="true" /></span>
            <span className="notable-figures">{market.volumeUsd != null && Number.isFinite(market.volumeUsd) && market.volumeUsd >= 0 ? <span><strong>{dollars.format(market.volumeUsd)}</strong> volume</span> : market.volumeContracts != null && Number.isFinite(market.volumeContracts) && market.volumeContracts >= 0 ? <span><strong>{contracts.format(market.volumeContracts)}</strong> contracts traded</span> : <span>Volume unavailable</span>}{market.status && <span>{market.status}</span>}</span>
            {market.outcomes.filter(outcome => outcome.price != null && Number.isFinite(outcome.price) && outcome.price >= 0 && outcome.price <= 1).sort((a, b) => b.price! - a.price!).slice(0, 1).map((outcome, j) => <span className="notable-outcome" key={`${outcome.name}-${j}`}>{outcome.name}: <strong>{(outcome.price! * 100).toFixed(1).replace(/\.0$/, '')}¢</strong> last trade</span>)}
          </a>) : <span className="notable-muted">No market data available</span>}</div>
          {race.news.length > 0 && <div className="notable-news">{race.news.slice(0, 2).map((item, i) => <a key={`${item.url}-${i}`} href={item.url} target="_blank" rel="noreferrer"><Newspaper size={13} aria-hidden="true" /><span><span className="notable-news-source">{item.source}{date(item.publishedAt) ? ` · ${date(item.publishedAt)}` : ''}</span><span className="notable-news-title">{item.title} <ArrowUpRight size={11} aria-hidden="true" /></span></span></a>)}</div>}
        </article>)}</div>
        <p className="notable-footnote">{methodology || 'Market prices are last-traded contract prices, not election results. Volume is reported by each provider.'}</p>
      </>}
  </section>;
}
