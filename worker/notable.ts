// A deliberately bounded universe: House general-election winner markets plus
// named US mayoral winner markets. Kalshi volume_fp counts contracts, not dollars.
const API = 'https://external-api.kalshi.com/trade-api/v2';
const MAYORS: Record<string, string> = { KXMAYORLA: 'Los Angeles, California' };
type Market = { rules_primary?: string; subtitle?: string; yes_sub_title?: string; status?: string; last_price_dollars?: string; volume_fp?: string; updated_time?: string };
type Event = { event_ticker?: string; title?: string; markets?: Market[] };
type EventsResponse = { events?: Event[]; cursor?: string };
type DisplayMarket = { provider:string; url:string; volumeContracts?:number; volumeUsd?:number; updatedAt?:string|null; status:string; outcomes:{name:string;price:number|null;status:string}[] };
type DisplayPoll = { pollster:string; sponsor:string|null; fieldStart:string; fieldEnd:string; sampleSize:number; population:string; source:string; url:string; collection?:{name:string;url:string}; licence?:string; outcomes:{name:string;percent:number}[] };
type PollQuestion = {kind:string;shares?:{bass?:number;raman?:number}};
type LaPoll = {pollster:string;sponsor?:string;population:string;field_start:string;field_end:string;n:number;questions?:PollQuestion[];source?:{label:string;url:string}};
type HousePoll = {kind:string;stage:string;question:string;race:string;pollster:string;sample:number;population:string;source_url:string;figures:string;fieldwork_start:string;fieldwork_end:string;sponsor?:string;licence?:string};
type DisplayRace = { id:string; title:string; location:string; electionDate:string; markets:DisplayMarket[]; news:never[]; polls?:DisplayPoll[] };
// The Basin publishes checked runoff polling in a JSON object embedded in its page.
// Extract only first-choice questions for the exact 2026 runoff; reject incomplete
// records instead of silently mixing primary, subgroup, or message-test results.
async function laPolls(): Promise<DisplayPoll[]> {
  const response = await fetch('https://basin.la/interactives/polls-la-mayor-2026.html', { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Polling source unavailable');
  const html = await response.text();
  const match = html.match(/\bvar D = (\{[^\n]+\});/);
  if (!match) throw new Error('Polling source format changed');
  const data = JSON.parse(match[1]) as {race?:{id?:string;election?:string};polls?:LaPoll[]};
  if (data.race?.id !== 'la-mayor-2026' || data.race?.election !== '2026-11-03' || !Array.isArray(data.polls)) throw new Error('Unexpected polling race');
  return data.polls.flatMap((p: LaPoll): DisplayPoll[] => {
    const q = Array.isArray(p.questions) ? p.questions.find((item: PollQuestion) => item.kind === 'first') : null;
    const bass = q?.shares?.bass, raman = q?.shares?.raman;
    const date = /^2026-\d{2}-\d{2}$/;
    if (typeof p.pollster !== 'string' || !p.pollster || typeof p.population !== 'string' || !p.population || !date.test(p.field_start) || !date.test(p.field_end) || p.field_start > p.field_end || p.field_end > '2026-11-03' || !Number.isInteger(p.n) || p.n <= 0 || typeof bass !== 'number' || bass < 0 || bass > 100 || typeof raman !== 'number' || raman < 0 || raman > 100 || bass + raman > 100 || typeof p.source?.label !== 'string' || typeof p.source?.url !== 'string' || !/^https:\/\//.test(p.source.url)) return [];
    return [{ pollster:p.pollster, sponsor:typeof p.sponsor === 'string' ? p.sponsor : null, fieldStart:p.field_start, fieldEnd:p.field_end, sampleSize:p.n, population:p.population, source:p.source.label, url:p.source.url, collection:{name:'The Basin',url:'https://basin.la/interactives/polls-la-mayor-2026.html'}, outcomes:[{name:'Karen Bass',percent:bass},{name:'Nithya Raman',percent:raman}] }];
  }).sort((a: DisplayPoll, b: DisplayPoll) => b.fieldEnd.localeCompare(a.fieldEnd)).slice(0, 3);
}
async function housePolls(): Promise<Map<string, DisplayPoll[]>> {
  const response = await fetch('https://www.pollingforecast.com/api/us/polls?kind=House', { headers:{Accept:'application/json'}, signal:AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('House polling unavailable');
  const data = await response.json() as {dataset?:string;count?:number;rows?:HousePoll[]};
  if (data.dataset !== 'polls' || !Array.isArray(data.rows) || data.count !== data.rows.length) throw new Error('Invalid House polling dataset');
  const byDistrict = new Map<string, DisplayPoll[]>();
  for (const p of data.rows) {
    if (p.kind !== 'House' || p.stage !== 'vote' || p.question !== 'Main' || typeof p.race !== 'string' || !/^[A-Z]{2}-\d{2}$/.test(p.race) || typeof p.pollster !== 'string' || !p.pollster || !Number.isInteger(p.sample) || p.sample <= 0 || !['LV','RV','V','A'].includes(p.population) || typeof p.source_url !== 'string' || !/^https:\/\//.test(p.source_url) || typeof p.figures !== 'string') continue;
    const start = typeof p.fieldwork_start === 'string' ? p.fieldwork_start.slice(0,10) : '';
    const end = typeof p.fieldwork_end === 'string' ? p.fieldwork_end.slice(0,10) : '';
    if (!/^2026-\d{2}-\d{2}$/.test(start) || !/^2026-\d{2}-\d{2}$/.test(end) || start > end || end > '2026-11-03') continue;
    const parsed = p.figures.split(';').map((part:string) => part.trim().match(/^(.+?) \(([^)]+)\) (\d+(?:\.\d+)?)$/));
    if (parsed.some((part:RegExpMatchArray|null) => !part)) continue;
    const candidates = parsed.filter((part:RegExpMatchArray|null) => part && !['UND','OTH'].includes(part[2])).map((part:RegExpMatchArray|null) => ({name:part![1],percent:Number(part![3])}));
    if (candidates.length < 2 || candidates.some((candidate:{name:string;percent:number}) => candidate.percent > 100 || /generic/i.test(candidate.name))) continue;
    const district = p.race.endsWith('-00') ? `${p.race.slice(0,2)}-AL` : p.race;
    const poll: DisplayPoll = {pollster:p.pollster, sponsor:typeof p.sponsor === 'string' ? p.sponsor : null, fieldStart:start, fieldEnd:end, sampleSize:p.sample, population:({LV:'likely voters',RV:'registered voters',V:'voters',A:'adults'} as Record<string,string>)[p.population], source:'Poll source', url:p.source_url, collection:{name:'Polling Forecast',url:'https://www.pollingforecast.com/us/house/' + p.race.toLowerCase()}, licence:typeof p.licence === 'string' ? p.licence : undefined, outcomes:candidates};
    const polls = byDistrict.get(district) || []; polls.push(poll); byDistrict.set(district,polls);
  }
  for (const [district, polls] of byDistrict) byDistrict.set(district, polls.sort((a,b) => b.fieldEnd.localeCompare(a.fieldEnd)).slice(0,3));
  return byDistrict;
}
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
  const pollsRequest = Promise.allSettled([laPolls(), housePolls()]);
  const results = await Promise.allSettled([houseEvents(), ...series.map(mayorEvents)]);
  const poly = await polyRequest;
  const [laPollResult, housePollResult] = await pollsRequest;
  const polling_status = {house:housePollResult.status === 'fulfilled' ? 'ok' : 'error', la:laPollResult.status === 'fulfilled' ? 'ok' : 'error'};
  const polymarket_status = poly && poly.id === '57111' && poly.title === 'Los Angeles Mayoral Election' && poly.slug === 'los-angeles-mayoral-election-117' && Array.isArray(poly.markets) ? 'ok' : 'error';
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
  const la = races.find(r => r.id === 'KXMAYORLA-26');
  if (la && laPollResult.status === 'fulfilled' && laPollResult.value.length) la.polls = laPollResult.value;
  if (housePollResult.status === 'fulfilled') for (const race of races) {
    const match = race.id.match(/^KXHOUSERACE-([A-Z]{2})(\d{2}|AL)-26$/);
    const polls = match && housePollResult.value.get(`${match[1]}-${match[2]}`);
    if (polls?.length) race.polls = polls;
  }
  return Response.json({ updatedAt: new Date().toISOString(), ranking_status: partial ? 'partial' : 'ok', polling_status, polymarket_status, methodology: `Ranked by total Kalshi contracts traded in winner markets across 2026 House general elections and the Los Angeles mayoral general election. Polymarket is shown for Los Angeles when available but does not affect ranking. House party contracts settle on the party of the member sworn in. Contract counts are not dollar volume; last-traded prices are not election results.${partial ? ' Some market listings were unavailable, so this ranking is incomplete.' : ''}`, races }, { headers: { 'Cache-Control': partial ? 'no-store' : 'public, max-age=30', 'X-Content-Type-Options': 'nosniff' } });
}
