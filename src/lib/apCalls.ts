import type {Office, Race} from '../types';

type Row = Record<string, unknown>;

export interface APCall {
  race_id: string;
  office: Office;
  state: string;
  winner_id: string | null;
  source_candidate_id: string;
  winner_name: string;
  party: string | null;
  authority: 'Associated Press';
  source_url: string;
  accepted_at: string | null;
  source_timestamp: string | null;
  fetched_at: string;
}

export interface APCallsSnapshot {
  calls: APCall[];
  fetched_at: string;
  feed_url: string;
}

const row = (value: unknown): Row | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const normalized = (value: string): string => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const acceptedTime = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
};

const SOURCE = 'https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-';

/** Extracts races for which the public payload explicitly attributes a winner call to AP. */
export function normalizeApCalls(payload: unknown, office: Office, races: Race[], fetchedAt: string): APCallsSnapshot {
  const root = row(payload);
  if (!root || !Array.isArray(root.races)) throw new Error('Invalid AP call results payload');
  const sourceOffice = office === 'Senate' ? 'S' : 'G';
  const sourceUrl = SOURCE + (office === 'Senate' ? 'senate' : 'governor') + '.json';
  const calls: APCall[] = [];

  for (const item of root.races) {
    const sourceRace = row(item);
    if (!sourceRace || sourceRace.election_date !== '2026-11-03' || sourceRace.office_id !== sourceOffice || sourceRace.race_call_status !== 'called') continue;
    const isSpecial = sourceRace.type === 'Special General' && sourceRace.race_type_id === 'W';
    const isRegular = sourceRace.type === 'General' && sourceRace.race_type_id === 'G';
    if (!isSpecial && !isRegular) continue;
    const outcome = row(sourceRace.outcome);
    if (!outcome || !Array.isArray(outcome.called_by) || !outcome.called_by.includes('ap') || !Array.isArray(outcome.won) || outcome.won.length !== 1) continue;
    const acceptedTimes = Array.isArray(outcome.winner_accepted_at) ? outcome.winner_accepted_at : [];
    if (acceptedTimes.length > 1) continue;
    const acceptedAt = acceptedTime(acceptedTimes[0]);
    const winnerKey = text(outcome.won[0]);
    const sourceCandidates = row(sourceRace.candidate_metadata);
    if (!winnerKey || !sourceCandidates) continue;
    const sourceCandidate = row(sourceCandidates[winnerKey]);
    if (!sourceCandidate) continue;
    const winnerName = [text(sourceCandidate.first_name), text(sourceCandidate.middle_name), text(sourceCandidate.last_name), text(sourceCandidate.suffix)].filter(Boolean).join(' ');
    if (!winnerName) continue;

    const state = text(sourceRace.nyt_id).slice(0, 2);
    const matchingRaces = races.filter(r => r.office === office && r.year === 2026 && r.state === state && r.election_type === (isSpecial ? 'special' : 'regular'));
    if (matchingRaces.length !== 1) continue;
    const race = matchingRaces[0];
    const candidates = race.candidates.filter(c => [c.name, ...c.aliases].some(name => normalized(name) === normalized(winnerName)));
    if (candidates.length > 1) continue;
    const candidate = candidates[0];
    const sourceParty = row(sourceCandidate.party);
    const sourcePartyId = text(sourceParty?.nyt_id);
    const party = ({DEM: 'D', GOP: 'R', REP: 'R', IND: 'I', NPA: 'I', LIB: 'L', GRN: 'G'} as Record<string, string>)[sourcePartyId] ?? candidate?.party ?? null;
    calls.push({race_id: race.id, office, state, winner_id: candidate?.id ?? null, source_candidate_id: winnerKey, winner_name: winnerName, party, authority: 'Associated Press', source_url: text(sourceRace.url) || sourceUrl, accepted_at: acceptedAt, source_timestamp: acceptedTime(sourceRace.updated_at), fetched_at: acceptedTime(fetchedAt) ?? fetchedAt});
  }
  return {calls, fetched_at: acceptedTime(fetchedAt) ?? fetchedAt, feed_url: sourceUrl};
}
