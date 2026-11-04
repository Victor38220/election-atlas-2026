import json
from scripts.models import MarketContract,MarketQuote
from scripts.normalize import probability,number,quote_price,stamp
from scripts.reconcile import match_race,match_outcome
BASE='https://gamma-api.polymarket.com'

def array(value):
    if isinstance(value,str):
        try:return json.loads(value)
        except json.JSONDecodeError:return []
    return value if isinstance(value,(list,dict)) else []

def outcome_identifier(raw):
    outcomes=array(raw.get('outcomes'))
    tokens=array(raw.get('clobTokenIds'))
    if isinstance(outcomes,list) and 'Yes' in outcomes and isinstance(tokens,list) and len(tokens)==len(outcomes):return str(tokens[outcomes.index('Yes')]),'clob'
    if isinstance(outcomes,dict):
        yes=outcomes.get('yes',{})
        if yes.get('tokenId'):return str(yes['tokenId']),'clob'
        if yes.get('positionId'):return str(yes['positionId']),'position'
    return None,'unsupported'

def normalize(event,raw,races,fetched,midpoints=None):
    control=event.get('title','').strip()=='Which party will win the Senate in 2026?' and 'wins control of the United States Senate' in (raw.get('description') or event.get('description',''))
    race=None if control else match_race(event.get('title',''),raw.get('description') or event.get('description',''),races,'polymarket')
    if control:
        question=raw.get('question','')
        outcome='D' if 'Democratic Party' in question else 'R' if 'Republican Party' in question else None
        if not outcome:return None
        kind='control';candidate=None
    else:
        if not race:return None
        matched=match_outcome(raw.get('groupItemTitle','').strip(),raw.get('question',''),race)
        if not matched:return None
        outcome,kind,candidate=matched
    token,fmt=outcome_identifier(raw)
    status='closed' if raw.get('closed') else 'active' if raw.get('active') else 'inactive'
    cid='polymarket:'+str(raw['id'])
    contract=MarketContract(id=cid,provider='polymarket',event_id=str(event['id']),market_id=str(raw['id']),outcome_id=token,race_id=race['id'] if race else None,candidate_id=candidate,outcome=outcome,outcome_type=kind,question=raw['question'],rules=raw.get('description') or event.get('description',''),url='https://polymarket.com/event/'+event['slug'],status=status,protocol=raw.get('version','legacy'),settlement='election_day_seat_and_caucus_rules' if control else 'media_consensus_or_certification',comparison_group=None)
    bid,ask,last=probability(raw.get('bestBid')),probability(raw.get('bestAsk')),probability(raw.get('lastTradePrice'))
    liq=number(raw.get('liquidityNum',raw.get('liquidity')))
    value,method,warning=quote_price(bid,ask,last,status,liq)
    if fmt=='position':value=None;method='unsupported_protocol';warning='Position-ID pricing requires a compatible public endpoint; no legacy token assumption.'
    if value is not None and midpoints and token in midpoints:
        mid=probability(midpoints[token])
        if mid is not None and bid<=mid<=ask:value=mid;method='clob_midpoint'
    quote=MarketQuote(contract_id=cid,provider='polymarket',race_id=race['id'] if race else None,candidate_id=candidate,outcome=outcome,price=value,bid=bid,ask=ask,midpoint=(bid+ask)/2 if bid is not None and ask is not None and bid<=ask else None,last_trade=last,volume=number(raw.get('volumeNum',raw.get('volume'))),liquidity=liq,source_timestamp=stamp(raw.get('updatedAt')),fetched_at=fetched,pricing_method=method,warning=warning)
    return contract.model_dump(),quote.model_dump()

def search(client,query):
    seen=set()
    for page in range(1,30):
        data=client.get(BASE+'/public-search',params={'q':query,'limit_per_type':100,'page':page})
        if not isinstance(data,dict) or not isinstance(data.get('events',[]),list):raise ValueError('Invalid Polymarket search response')
        events=data.get('events',[]); new=[e for e in events if str(e['id']) not in seen]
        for e in new:seen.add(str(e['id']));yield e
        if not data.get('pagination',{}).get('hasMore'):return
        if not new:raise ValueError('Polymarket search pagination repeated')
    raise ValueError('Search pagination safety limit')

def fetch(client,races,mappings,fetched):
    events={}
    # Verified separate chamber-control event, never assigned to a state race.
    control=client.get(BASE+'/events/32224');events[str(control['id'])]=control
    for term in ['Senate Election Winner','Governor Election Winner']:
        for e in search(client,term):
            if match_race(e.get('title',''),e.get('description',''),races,'polymarket'):events[str(e['id'])]=e
    for event_id in {m['event_id'] for m in mappings if m['provider']=='polymarket'}-set(events):
        e=client.get(BASE+'/events/'+event_id);events[event_id]=e
    tokens=[]
    for e in events.values():
        for m in e.get('markets',[]):
            token,kind=outcome_identifier(m)
            if token and kind=='clob':tokens.append({'token_id':token})
    midpoints={}
    try:
        for offset in range(0,len(tokens),100):midpoints.update(client.post('https://clob.polymarket.com/midpoints',tokens[offset:offset+100]))
    except Exception:
        pass # Valid Gamma bid/ask midpoint remains identified as midpoint, never as CLOB.
    contracts=[];quotes=[];raws={}
    for event in events.values():
        for raw in event.get('markets',[]):
            result=normalize(event,raw,races,fetched,midpoints)
            if result:
                c,q=result;contracts.append(c);quotes.append(q);raws[c['id']]={'event':{k:v for k,v in event.items() if k!='markets'},'market':raw}
    return contracts,quotes,raws
