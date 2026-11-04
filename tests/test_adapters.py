"""Small recorded live-response fixtures. All tests run without network access."""
import copy
import json
from pathlib import Path

import httpx
import pytest
from pydantic import ValidationError

from scripts.http_client import Client
from scripts.models import Snapshot
from scripts.normalize import deduplicate, probability, quote_price, stamp
from scripts.reconcile import compatible, match_outcome, match_race
from scripts.sources import kalshi, polling_forecast, polymarket, votehub

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/adapters.json').read_text())
RACES = FIXTURE['races']
FETCHED = FIXTURE['recorded_at']


def race(state):
    return next(r for r in RACES if r['state'] == state)


def raw_kalshi(state):
    return next(raw for raw in FIXTURE['kalshi'].values() if f" of {race(state)['state_name']} " in raw['rules_primary'] and 'senate' in raw['title'].lower())


def raw_polymarket(state):
    return next(raw for raw in FIXTURE['polymarket'].values() if raw['event']['title'].strip() == race(state)['state_name'] + ' Senate Election Winner')


def test_polling_summary_retains_three_distinct_measurements():
    raw = next(r for r in FIXTURE['polling_forecast']['forecasts'] if r['state'] == 'AK')
    result = polling_forecast.normalize_summary(raw, race('AK'))
    assert result['poll_margin'] == raw['poll_average']
    assert result['forecast_margin'] == raw['best_bet_margin']
    assert result['probability'] == raw['chance_left']
    assert result['poll_margin'] != result['forecast_margin']


def test_polling_missing_probability_is_null_and_invalid_probability_rejected():
    raw = copy.deepcopy(FIXTURE['polling_forecast']['forecasts'][0])
    raw.pop('chance_left')
    assert polling_forecast.normalize_summary(raw, race(raw['state']))['probability'] is None
    raw['chance_left'] = 99
    with pytest.raises(ValidationError):
        polling_forecast.normalize_summary(raw, race(raw['state']))


def test_polling_poll_preserves_licence_dates_and_original_link():
    raw = FIXTURE['polling_forecast']['polls'][0]
    r = next(r for r in RACES if r['provider_ids']['polling_forecast'] == raw['race'])
    result = polling_forecast.normalize_poll(raw, r)
    assert result['licence'] == raw['licence']
    assert result['url'] == raw['source_url']
    assert result['end'].endswith('Z')
    assert result['sample'] == raw['sample']
    assert result['results']
    assert all(0 <= observation['share'] <= 1 for observation in result['results'])


@pytest.mark.parametrize('payload', [{}, {'rows': None}, {'rows': [], 'count': 1}])
def test_polling_bad_envelopes_rejected(payload):
    with pytest.raises(ValueError):
        polling_forecast.rows(payload)


def test_empty_polling_envelope_valid():
    assert polling_forecast.rows({'rows': [], 'count': 0}) == []


def test_votehub_actual_senate_row_identifies_special_ohio_race():
    raw = next(p for p in FIXTURE['votehub'] if p['subject'] == '2026 Ohio')
    result = votehub.normalize_poll(raw, RACES)
    assert result['race_id'] == race('OH')['id']
    assert result['margin'] == 6
    assert result['licence'] == 'CC BY 4.0'


def test_votehub_generic_ballot_and_missing_percent_never_become_state_poll():
    raw = copy.deepcopy(next(p for p in FIXTURE['votehub'] if p['subject'] == '2026 Ohio'))
    raw['poll_type'] = 'generic-ballot'
    assert votehub.normalize_poll(raw, RACES) is None
    raw['poll_type'] = 'us-senator'
    raw['answers'][0]['pct'] = None
    assert votehub.normalize_poll(raw, RACES) is None


@pytest.mark.parametrize('state', ['GA', 'ME', 'OH', 'FL', 'AK', 'TX'])
def test_recorded_kalshi_contracts_match_correct_state_and_election(state):
    raw = raw_kalshi(state)
    result = kalshi.normalize(raw, RACES, FETCHED)
    assert result is not None
    contract, quote = result
    assert contract['race_id'] == race(state)['id']
    assert contract['market_id'] == raw['ticker']
    assert quote['fetched_at'] == FETCHED
    assert quote['source_timestamp'] is None  # Metadata updates are not quote timestamps.
    assert contract['comparison_group'] is None
    if raw['status'] not in ['active', 'open', 'initialized']:
        assert quote['price'] is None


@pytest.mark.parametrize('state', ['GA', 'ME', 'OH', 'FL', 'NE', 'AK', 'TX'])
def test_recorded_polymarket_contracts_match_canonical_race(state):
    raw = raw_polymarket(state)
    result = polymarket.normalize(raw['event'], raw['market'], RACES, FETCHED)
    assert result is not None
    contract, quote = result
    assert contract['race_id'] == race(state)['id']
    assert contract['event_id'] == str(raw['event']['id'])
    assert contract['rules'] == raw['market']['description']
    assert contract['comparison_group'] is None
    assert quote['price'] is None or 0 <= quote['price'] <= 1


def test_polymarket_closure_and_position_only_protocol_are_unavailable():
    raw = copy.deepcopy(raw_polymarket('ME'))
    raw['market']['closed'] = True
    _, quote = polymarket.normalize(raw['event'], raw['market'], RACES, FETCHED)
    assert quote['price'] is None
    raw['market']['closed'] = False
    raw['market']['outcomes'] = {'yes': {'positionId': 'recorded-format-test', 'tokenId': None}}
    raw['market'].pop('clobTokenIds', None)
    contract, quote = polymarket.normalize(raw['event'], raw['market'], RACES, FETCHED)
    assert contract['outcome_id'] == 'recorded-format-test'
    assert quote['price'] is None
    assert quote['pricing_method'] == 'unsupported_protocol'


def test_candidate_alias_and_independent_are_not_forced_into_democratic_contract():
    alaska = copy.deepcopy(race('AK'))
    alaska['candidates'][1]['aliases'] = ['Dan Sullivan']
    assert match_outcome('Dan Sullivan', 'Candidate winner', alaska)[2] == alaska['candidates'][1]['id']
    nebraska = race('NE')
    assert nebraska['candidates'][0]['party'] == 'I'
    outcome, kind, candidate = match_outcome('Dan Osborn', 'Will Democrats win the Nebraska Senate race in 2026?', nebraska)
    assert (outcome, kind, candidate) == ('D', 'party', None)
    assert match_outcome('Dan Osborn', 'Nebraska winner', nebraska)[2] == nebraska['candidates'][0]['id']


@pytest.mark.parametrize('title', [
    'Georgia Senate primary winner 2026',
    'Georgia Senate nominee 2026',
    'Georgia Senate margin of victory 2026',
    'Georgia State Senate winner 2026',
    'Which party controls the Senate in 2026?',
    'Georgia Senate election winner 2024',
    'Georgia Senate election winner 2028',
])
def test_incompatible_markets_rejected(title):
    assert match_race(title, 'This market resolves according to the winner of the general election, based on official certification.', RACES, 'polymarket') is None


def test_special_race_needs_special_terms_on_kalshi():
    raw = raw_kalshi('OH')
    assert match_race(raw['title'], raw['rules_primary'], RACES, 'kalshi')['election_type'] == 'special'
    assert match_race(raw['title'], 'If a representative is sworn in as a Senator of Ohio for the term beginning in 2027, then Yes.', RACES, 'kalshi') is None


def test_different_settlement_terms_do_not_get_a_spread():
    k, _ = kalshi.normalize(raw_kalshi('ME'), RACES, FETCHED)
    raw = raw_polymarket('ME')
    p, _ = polymarket.normalize(raw['event'], raw['market'], RACES, FETCHED)
    assert k['settlement'] != p['settlement']
    assert not compatible(k, p)


@pytest.mark.parametrize('bid,ask,status,liquidity', [
    (None, .6, 'active', 10), (.4, None, 'active', 10),
    (0, 1, 'active', 10), (.4, .6, 'closed', 10),
    (.4, .6, 'active', 0), (.8, .2, 'active', 10),
])
def test_bad_books_never_promote_last_trade(bid, ask, status, liquidity):
    price, method, warning = quote_price(bid, ask, .5, status, liquidity)
    assert price is None and method == 'unavailable' and warning


def test_valid_midpoint_and_decimal_probability():
    assert quote_price(.4, .6, .9, 'active', 10)[0] == .5
    assert probability('0.43') == .43
    assert probability('43') is None
    assert probability(None) is None
    assert probability(float('nan')) is None
    assert stamp('2026-11-02T00:00:00') == '2026-11-02T00:00:00Z'


def test_duplicate_underlying_poll_prefers_primary_provider():
    raw = FIXTURE['polling_forecast']['polls'][0]
    r = next(r for r in RACES if r['provider_ids']['polling_forecast'] == raw['race'])
    primary = polling_forecast.normalize_poll(raw, r)
    duplicate = {**primary, 'id': 'vh:duplicate', 'provider': 'votehub'}
    assert deduplicate([duplicate, primary]) == [primary]


class FakePages:
    def __init__(self, pages):
        self.pages = iter(pages)
        self.calls = []
    def get(self, url, params=None):
        self.calls.append((url, dict(params or {})))
        return next(self.pages)


def test_kalshi_pagination_passes_cursor_and_rejects_loop():
    raw = raw_kalshi('ME')
    client = FakePages([{'markets': [raw], 'cursor': 'next'}, {'markets': [], 'cursor': ''}])
    assert list(kalshi.paginate(client, '/markets', 'markets')) == [raw]
    assert client.calls[1][1]['cursor'] == 'next'
    repeated = FakePages([{'markets': [], 'cursor': 'loop'}, {'markets': [], 'cursor': 'loop'}])
    with pytest.raises(ValueError, match='Repeated'):
        list(kalshi.paginate(repeated, '/markets', 'markets'))


def test_polymarket_search_paginates_and_rejects_repeated_page():
    event = raw_polymarket('ME')['event']
    client = FakePages([{'events': [event], 'pagination': {'hasMore': True}}, {'events': [], 'pagination': {'hasMore': False}}])
    assert list(polymarket.search(client, 'Senate Election Winner')) == [event]
    assert client.calls[1][1]['page'] == 2
    repeat = FakePages([{'events': [event], 'pagination': {'hasMore': True}}, {'events': [event], 'pagination': {'hasMore': True}}])
    with pytest.raises(ValueError, match='repeated'):
        list(polymarket.search(repeat, 'Senate Election Winner'))


def test_http_429_honors_retry_after_and_recovers(monkeypatch):
    attempts = []
    pauses = []
    def handler(request):
        attempts.append(request)
        return httpx.Response(429, headers={'Retry-After': '3'}) if len(attempts) == 1 else httpx.Response(200, json={'rows': []})
    client = Client()
    client.client = httpx.Client(transport=httpx.MockTransport(handler))
    monkeypatch.setattr('scripts.http_client.time.sleep', pauses.append)
    assert client.get('https://provider.invalid/data') == {'rows': []}
    assert len(attempts) == 2 and pauses == [3]


def test_http_permanent_error_is_not_retried(monkeypatch):
    attempts = []
    def handler(request):
        attempts.append(request)
        return httpx.Response(403)
    client = Client()
    client.client = httpx.Client(transport=httpx.MockTransport(handler))
    monkeypatch.setattr('scripts.http_client.time.sleep', lambda _: pytest.fail('Permanent error must not retry'))
    with pytest.raises(httpx.HTTPStatusError):
        client.get('https://provider.invalid/data')
    assert len(attempts) == 1


def test_refresh_failure_retains_last_successful_real_data(tmp_path, monkeypatch):
    from scripts import update_data
    snapshot = json.loads((Path(__file__).parent / 'fixtures/frontend.json').read_text())
    data = tmp_path / 'public/data'
    data.mkdir(parents=True)
    (tmp_path / 'config').mkdir()
    (tmp_path / 'config/races.json').write_text(json.dumps(snapshot['races']))
    (data / 'latest.json').write_text(json.dumps(snapshot))
    monkeypatch.setattr(update_data, 'ROOT', tmp_path)
    monkeypatch.setattr(update_data, 'DATA', data)
    class FailingClient:
        def get(self, *args, **kwargs):
            raise RuntimeError('Recorded simulated provider outage')
    monkeypatch.setattr(update_data, 'Client', FailingClient)
    update_data.run(force=True)
    result = Snapshot.model_validate_json((data / 'latest.json').read_text()).model_dump()
    assert result['quotes'] == snapshot['quotes']
    assert result['polls'] == snapshot['polls']
    assert all(s['status'] == 'error' for s in result['providers'].values())
    assert 'counties' not in result['providers']
    assert all(result['providers'][p]['last_success'] == old['last_success'] for p, old in snapshot['providers'].items() if p != 'counties')
