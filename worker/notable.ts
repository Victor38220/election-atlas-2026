// A deliberately bounded universe: House general-election winner markets plus
// named US mayoral winner markets. Kalshi volume_fp counts contracts, not dollars.
const API = 'https://external-api.kalshi.com/trade-api/v2';
const MAYORS: Record<string, string> = { KXMAYORLA: 'Los Angeles, California' };
type Market = { rules_primary?: string; subtitle?: string; yes_sub_title?: string; status?: string; last_price_dollars?: string; volume_fp?: string; updated_time?: string };
type Event = { event_ticker?: string; title?: string; markets?: Market[] };
type EventsResponse = { events?: Event[]; cursor?: string };
type DisplayMarket = { provider:string; url:string; volumeContracts?:number; volumeUsd?:number; updatedAt?:string|null; status:string; outcomes:{name:string;price:number|null;status:string}[] };
type DisplayRace = { id:string; title:string; location:string; electionDate:string; markets:DisplayMarket[]; news:never[] };
async function getJson(url: string): Promise<EventsResponse> {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Kalshi HTTP ${response.status}`);
  return response.json() as Promise<EventsResponse>;
}
async function houseEvents(): Promise<Event[]> {
  const events: Event[] = []; let cursor = '';
  // The House universe fits within three pages today; reject truncated results.
  for (let page = 0; page < 4; page++) {
    const url = new URL(`${API}/events`); url.searchParams.set('series_ticker', 'KXHOUSERACE');
    url.searchParams.set('limit', '200'); url.searchParams.set('with_nested_markets', 'true');
    if (cursor) url.searchParams.set('cursor', cursor);
    const data = await getJson(url.toString());
    if (!Array.isArray(data.events)) throw new Error('Invalid Kalshi events');
    events.push(...data.events); cursor = data.cursor || '';
    if (!cursor) return events;
  }
  throw new Error('House event listing exceeded page limit');
}
async function mayorEvents(series: string): Promise<Event[]> {
  const url = new URL(`${API}/events`); url.searchParams.set('series_ticker', series);
  url.searchParams.set('limit', '100'); url.searchParams.set('with_nested_markets', 'true');
  const data = await getJson(url.toString());
  if (!Array.isArray(data.events) || data.cursor) throw new Error('Invalid mayor event listing');
  return data.events;
}
function number(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : null;
}
export async function notableRaces(): Promise<Response> {
  const series = Object.keys(MAYORS);
  const polyRequest = fetch('https://gamma-api.polymarket.com/events/57111', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) }).then(async response => { if (!response.ok) throw new Error('Polymarket unavailable'); return response.json() as Promise<Record<string, unknown>>; }).catch(() => null);
  const results = await Promise.allSettled([houseEvents(), ...series.map(mayorEvents)]);
  const poly = await polyRequest;
  const partial = results.some(result => result.status === 'rejected');
  if (results.every(result => result.status === 'rejected')) return Response.json({ error: 'Election market data unavailable' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  const races: DisplayRace[] = results.flatMap((result, index) => {
    if (result.status !== 'fulfilled') return [];
    return result.value.flatMap(event => {
      const ticker = event.event_ticker || '';
      const house = index === 0 && /^KXHOUSERACE-[A-Z]{2}(?:\d{2}|AL)-26$/.test(ticker);
      const mayor = index > 0 && ticker === `${series[index - 1]}-26`;
      if ((!house && !mayor) || !Array.isArray(event.markets) || !event.markets.length) return [];
      const valid = event.markets.filter(m => number(m.volume_fp) !== null);
      if (!valid.length) return [];
      const volumeContracts = valid.reduce((sum, m) => sum + (number(m.volume_fp) || 0), 0);
      const outcomes = event.markets.flatMap(m => {
        const rules = m.rules_primary || '';
        const party = house && rules.match(/^If the House member sworn in for ([A-Z]{2}-(?:\d{2}|AL)) for the term beginning in 2027 is a member of the (Democratic|Republican) Party, then the market resolves to Yes\.$/i);
        const candidate = m.yes_sub_title || m.subtitle || '';
        const candidateRule = candidate && rules.toLowerCase().startsWith(`if ${candidate.toLowerCase()} wins the 2026 `);
        const districtCode = ticker.split('-')[1];
        const expectedDistrict = `${districtCode.slice(0, 2)}-${districtCode.slice(2)}`;
        const name = party && party[1].toUpperCase() === expectedDistrict ? `${party[2][0].toUpperCase()}${party[2].slice(1).toLowerCase()} Party` : candidateRule ? candidate : '';
        if (!name) return [];
        const price = number(m.last_price_dollars);
        return [{ name, price: price !== null && price <= 1 ? price : null, status: m.status || 'unknown' }];
      });
      const district = ticker.split('-')[1];
      return [{ id: ticker, title: house ? `${district.slice(0, 2)}-${district.slice(2)} House general election` : `${MAYORS[series[index - 1]].split(',')[0]} mayoral general election`, location: house ? district.slice(0, 2) : MAYORS[series[index - 1]], electionDate: '2026-11-03', markets: [{ provider: 'Kalshi', url: `https://kalshi.com/markets/${(house ? 'kxhouserace/house-race-winner' : series[index - 1].toLowerCase() + '/la')}/${ticker.toLowerCase()}`, volumeContracts, updatedAt: event.markets.map(m => m.updated_time).filter((v): v is string => Boolean(v)).sort().at(-1) || null, status: event.markets.some(m => m.status === 'active') ? 'active' : event.markets.every(m => ['closed', 'determined', 'finalized', 'settled'].includes(m.status || '')) ? 'closed' : 'unknown', outcomes }], news: [] }];
    });
  }).sort((a, b) => b.markets[0].volumeContracts - a.markets[0].volumeContracts).slice(0, 5);
  if (poly && poly.id === '57111' && poly.title === 'Los Angeles Mayoral Election' && poly.slug === 'los-angeles-mayoral-election-117' && Array.isArray(poly.markets)) {
    const la = races.find(r => r.id === 'KXMAYORLA-26');
    const outcomes = (poly.markets as Record<string, unknown>[]).flatMap(m => {
      if (typeof m.question !== 'string' || !/^Will .+ win the 2026 Los Angeles mayoral election\?$/i.test(m.question) || typeof m.groupItemTitle !== 'string') return [];
      let labels: unknown; try { labels = JSON.parse(String(m.outcomes)); } catch { return []; }
      if (!Array.isArray(labels) || labels[0] !== 'Yes' || labels[1] !== 'No') return [];
      const price = number(m.lastTradePrice);
      return [{ name: m.groupItemTitle, price: price !== null && price <= 1 ? price : null, status: m.closed === true ? 'closed' : m.active === true ? 'active' : 'inactive' }];
    });
    const volumeUsd = number(poly.volume);
    if (la && outcomes.length && volumeUsd !== null) la.markets.push({ provider: 'Polymarket', url: 'https://polymarket.com/event/los-angeles-mayoral-election-117', volumeUsd, status: poly.closed === true ? 'closed' : poly.active === true ? 'active' : 'inactive', outcomes });
  }
  return Response.json({ updatedAt: new Date().toISOString(), methodology: `Ranked by total Kalshi contracts traded in winner markets across 2026 House general elections and the Los Angeles mayoral general election. Polymarket is shown for Los Angeles when available but does not affect ranking. House party contracts settle on the party of the member sworn in. Contract counts are not dollar volume; last-traded prices are not election results.${partial ? ' Some market listings were unavailable, so this ranking is incomplete.' : ''}`, races }, { headers: { 'Cache-Control': partial ? 'no-store' : 'public, max-age=30', 'X-Content-Type-Options': 'nosniff' } });
}
