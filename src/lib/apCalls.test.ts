import {describe, expect, it} from 'vitest';
import type {Race} from '../types';
import {normalizeApCalls} from './apCalls';

const fetchedAt = '2026-11-04T04:40:00.000Z';
const localRace = (state: string, winner: string): Race => ({
  id: `2026-senate-${state.toLowerCase()}`, state, state_name: state === 'TX' ? 'Texas' : state === 'AL' ? 'Alabama' : 'Michigan', fips: '', office: 'Senate', year: 2026, election_type: 'regular', incumbent: null, incumbent_party: null, defending_party: 'R',
  candidates: [{id: `winner-${state}`, name: winner, party: state === 'TX' ? 'D' : 'R', aliases: [], caucus: null}], status: 'scheduled', provider_ids: {}, sources: [], updated_at: '',
});
const sourceRace = (state: string, winnerKey: string, first: string, last: string, overrides: Record<string, unknown> = {}) => ({
  nyt_id: `${state}-G-S-2026-11-03`, election_date: '2026-11-03', office_id: 'S', type: 'General', race_type_id: 'G', race_call_status: 'called', updated_at: '2026-11-04T04:30:15.424Z',
  url: `https://www.nytimes.com/interactive/2026/11/03/us/elections/results-${state.toLowerCase()}-us-senate.html`,
  candidate_metadata: {[winnerKey]: {first_name: first, middle_name: null, last_name: last, suffix: null, party: {nyt_id: winnerKey === 'talarico-j' || winnerKey === 'brown-s' ? 'DEM' : 'GOP', abbreviation: winnerKey === 'talarico-j' || winnerKey === 'brown-s' ? 'Dem.' : 'Rep.'}}},
  outcome: {won: [winnerKey], called_by: ['ap'], winner_accepted_at: ['2026-11-04T04:18:13.479055+00:00']}, ...overrides,
});
const payload = () => ({races: [
  sourceRace('TX', 'talarico-j', 'James', 'Talarico'),
  sourceRace('AL', 'moore-b', 'Barry', 'Moore'),
  sourceRace('MI', 'candidate-m', 'Candidate', 'Michigan', {race_call_status: 'too_early', outcome: {won: [], called_by: [], winner_accepted_at: []}}),
]});
const races = [localRace('TX', 'James Talarico'), localRace('AL', 'Barry Moore'), localRace('MI', 'Candidate Michigan')];

describe('AP-attributed race calls', () => {
  it('accepts explicit AP winner calls and preserves exact source attribution', () => {
    const result = normalizeApCalls(payload(), 'Senate', races, fetchedAt);
    expect(result.calls.map(call => call.race_id)).toEqual(['2026-senate-tx', '2026-senate-al']);
    expect(result.calls[0]).toMatchObject({authority: 'Associated Press', winner_id: 'winner-TX', winner_name: 'James Talarico', party: 'D', accepted_at: '2026-11-04T04:18:13.479Z'});
    expect(result.calls[0]?.source_url).toContain('nytimes.com/interactive/2026/11/03');
    expect(result.feed_url).toContain('results-senate.json');
  });

  it('rejects wrong-year, wrong-office, non-general, CNN-only, ambiguous and retracted calls', () => {
    const base = payload().races[0];
    const variants = [
      {...base, election_date: '2024-11-05'},
      {...base, office_id: 'G'},
      {...base, type: 'Primary'},
      {...base, outcome: {...base.outcome, called_by: ['cnn']}},
      {...base, outcome: {...base.outcome, won: ['talarico-j', 'other']}},
      {...base, race_call_status: 'too_early'},
    ];
    for (const rejected of variants) expect(normalizeApCalls({races: [rejected]}, 'Senate', races, fetchedAt).calls).toEqual([]);
  });

  it('retains an explicitly AP-called winner when accepted-at is missing, with null time', () => {
    const item = payload().races[0];
    expect(normalizeApCalls({races: [{...item, outcome: {...item.outcome, winner_accepted_at: []}}]}, 'Senate', races, fetchedAt).calls[0]?.accepted_at).toBeNull();
  });

  it('rejects calls with ambiguous or absent configured race/candidate identity', () => {
    const item = payload().races[0];
    expect(normalizeApCalls({races: [item]}, 'Senate', [races[0]!, races[0]!], fetchedAt).calls).toEqual([]);
    const unmatched = localRace('TX', 'Ken Paxton');
    const tx = {...item, candidate_metadata: {['talarico-j']: {first_name: 'James', last_name: 'Talarico', party: {nyt_id: 'DEM'}}}};
    const call = normalizeApCalls({races: [tx]}, 'Senate', [unmatched], fetchedAt).calls[0];
    expect(call).toMatchObject({winner_id: null, source_candidate_id: 'talarico-j', winner_name: 'James Talarico', party: 'D'});
  });

  it('accepts source-marked Special General W records for the canonical Florida and Ohio special races', () => {
    const florida = {...localRace('FL', 'Ashley Moody'), id: '2026-senate-fl-special', election_type: 'special' as const};
    const ohio = {...localRace('OH', 'Sherrod Brown'), id: '2026-senate-oh-special', election_type: 'special' as const};
    const special = (state: string, winnerKey: string, first: string, last: string) => sourceRace(state, winnerKey, first, last, {nyt_id: `${state}-S_W-S-2026-11-03`, type: 'Special General', race_type_id: 'W'});
    const items = [special('FL', 'moody-a', 'Ashley', 'Moody'), special('OH', 'brown-s', 'Sherrod', 'Brown')];
    const calls = normalizeApCalls({races: items}, 'Senate', [florida, ohio], fetchedAt).calls;
    expect(calls.map(call => call.race_id)).toEqual(['2026-senate-fl-special', '2026-senate-oh-special']);
    expect(normalizeApCalls({races: [items[0]]}, 'Senate', [localRace('FL', 'Ashley Moody')], fetchedAt).calls).toEqual([]);
  });
});
