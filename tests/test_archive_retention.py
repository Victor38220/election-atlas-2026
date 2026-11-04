import json
from datetime import datetime,timedelta,timezone
from pathlib import Path
from scripts.update_data import history_update
from scripts.sources import kalshi
from scripts.reconcile import match_race
ROOT=Path(__file__).resolve().parents[1]

def test_compaction_retains_actual_latest_observation_in_each_resolution():
    current=datetime(2026,11,4,3,tzinfo=timezone.utc)
    stamps=[current-timedelta(days=22),current-timedelta(days=2,minutes=50),current-timedelta(days=2,minutes=35),current-timedelta(minutes=28),current-timedelta(minutes=22),current-timedelta(minutes=2)]
    history={'contract':[{'t':t.isoformat().replace('+00:00','Z'),'p':i/10,'method':'midpoint','bucket':'old-format'} for i,t in enumerate(stamps)]}
    result=history_update(history,[],current)['contract']
    assert [p['p'] for p in result]==[.2,.4,.5]
    assert all(p['t'] in [item['t'] for item in history['contract']] for p in result)
    assert all('bucket' not in p for p in result)

def test_missing_quote_does_not_create_history_or_refresh_observation_time():
    current=datetime(2026,11,4,3,tzinfo=timezone.utc)
    assert history_update({},[{'price':None,'contract_id':'missing'}],current)=={}
    quote={'contract_id':'known','price':.5,'fetched_at':'2026-11-04T02:40:00Z','pricing_method':'midpoint'}
    assert history_update({},[quote,quote],current)['known']==[{'t':quote['fetched_at'],'p':.5,'method':'midpoint'}]

def test_known_kalshi_quotes_use_batch_without_series_discovery():
    fixtures=json.loads((ROOT/'tests/fixtures/live-quote-responses.json').read_text())
    raw=fixtures['kalshi']['raw'];contract=fixtures['kalshi']['contract']
    class Client:
        calls=[]
        def get(self,url,params=None):
            self.calls.append((url,params))
            assert url.endswith('/markets')
            assert params['tickers']==raw['ticker']
            return {'markets':[raw],'cursor':''}
    client=Client()
    mappings=[{'provider':'kalshi','market_id':raw['ticker'],'contract_id':contract['id']}]
    contracts,quotes,_=kalshi.fetch(client,fixtures['races'],mappings,'2026-11-04T03:00:00Z',discover=False)
    assert len(client.calls)==1
    assert contracts[0]['id']==contract['id']
    assert quotes[0]['price']==.865

def test_west_virginia_is_not_confused_with_virginia():
    races=json.loads((ROOT/'config/races.json').read_text())
    title='Will Republicans win the Senate race in West Virginia?'
    rules='If a representative of the Republican party is sworn in as a Senator of West Virginia for the term beginning in 2027, then Yes.'
    assert match_race(title,rules,races,'kalshi')['state']=='WV'
    assert match_race(title,rules+' Also depends on the Virginia Senate race.',races,'kalshi') is None

def test_control_contracts_are_not_state_races_and_other_years_rejected():
    from scripts.sources import polymarket
    payload=json.loads((ROOT/'tests/fixtures/control-markets.json').read_text())
    races=json.loads((ROOT/'config/races.json').read_text())
    for raw in payload['kalshi']:
        normalized=kalshi.normalize(raw,races,'2026-11-04T03:00:00Z')
        if '2026' in raw['title']:
            contract,quote=normalized
            assert contract['outcome_type']=='control'
            assert contract['race_id'] is None
            assert contract['candidate_id'] is None
            assert quote['race_id'] is None
        else:assert normalized is None
    event=payload['polymarket']
    accepted=[polymarket.normalize(event,m,races,'2026-11-04T03:00:00Z') for m in event['markets']]
    accepted=[p for p in accepted if p]
    assert len(accepted)==2
    assert {c['outcome'] for c,_ in accepted}=={'D','R'}
    assert all(c['race_id'] is None and c['outcome_type']=='control' for c,_ in accepted)
