import re, logging
from scripts.models import MarketContract,MarketQuote
from scripts.normalize import probability,number,quote_price
from scripts.reconcile import match_race,match_outcome
BASE='https://external-api.kalshi.com/trade-api/v2'

def paginate(client,path,key,params=None):
    params=dict(params or {});params['limit']=1000;seen=set()
    for _ in range(100):
        data=client.get(BASE+path,params=params)
        if not isinstance(data.get(key),list):raise ValueError('Invalid Kalshi '+key)
        yield from data[key]
        cursor=data.get('cursor')
        if not cursor:return
        if cursor in seen:raise ValueError('Repeated pagination cursor')
        seen.add(cursor);params['cursor']=cursor
    raise ValueError('Kalshi pagination exceeded safety limit')

def normalize(raw,races,fetched):
    title=raw.get('title','');rules='\n'.join(filter(None,[raw.get('rules_primary'),raw.get('rules_secondary')]))
    control=bool(re.search(r'\b2026\b',title) and re.search(r'control of the (?:U\.S\. )?Senate',rules,re.I) and re.fullmatch(r'Will (?:Republicans|Democrats) win the U\.S\. Senate in 2026\?',title))
    race=None if control else match_race(title,rules,races,'kalshi')
    if control:
        outcome='D' if 'Democrat' in title else 'R';kind='control';candidate=None
    else:
        if not race:return None
        matched=match_outcome(raw.get('yes_sub_title',''),title,race)
        if not matched:return None
        outcome,kind,candidate=matched
    cid='kalshi:'+raw['ticker']; status=raw.get('status','unknown')
    contract=MarketContract(id=cid,provider='kalshi',event_id=raw['event_ticker'],market_id=raw['ticker'],race_id=race['id'] if race else None,candidate_id=candidate,outcome=outcome,outcome_type=kind,question=title,rules=rules,url='https://kalshi.com/markets/'+raw['event_ticker'].rsplit('-',1)[0].lower()+'/'+raw['event_ticker'].lower(),status=status,settlement='chamber_control' if control else 'sworn_in',comparison_group=None)
    def price(field):
        if raw.get(field+'_dollars') is not None:return probability(raw[field+'_dollars'])
        n=number(raw.get(field));return probability(n/100) if n is not None else None
    bid,ask,last=price('yes_bid'),price('yes_ask'),price('last_price')
    liquidity=number(raw.get('yes_bid_size_fp'))
    value,method,warning=quote_price(bid,ask,last,status,liquidity)
    quote=MarketQuote(contract_id=cid,provider='kalshi',race_id=race['id'] if race else None,candidate_id=candidate,outcome=outcome,price=value,bid=bid,ask=ask,midpoint=(bid+ask)/2 if bid is not None and ask is not None and bid<=ask else None,last_trade=last,volume=number(raw.get('volume_fp',raw.get('volume'))),liquidity=liquidity,source_timestamp=None,fetched_at=fetched,pricing_method=method,warning=warning)
    # updated_time is contract metadata, not a quote timestamp. Retrieval time is the only known quote time.
    return contract.model_dump(),quote.model_dump()

def fetch(client,races,mappings,fetched,discover=True):
    contracts={};quotes={};raws={}
    def accept(raw):
        result=normalize(raw,races,fetched)
        if result:
            c,q=result;contracts[c['id']]=c;quotes[c['id']]=q;raws[c['id']]=raw
    known=[m for m in mappings if m['provider']=='kalshi']
    # Known contracts are requested without status filters, preserving closed coverage.
    for offset in range(0,len(known),90):
        batch=known[offset:offset+90]
        for raw in paginate(client,'/markets','markets',{'tickers':','.join(m['market_id'] for m in batch)}):accept(raw)
    if discover:
        series=client.get(BASE+'/series',params={'category':'Elections'}).get('series')
        if not isinstance(series,list):raise ValueError('Missing Kalshi series')
        selected=[]
        for item in series:
            title=item.get('title','')
            if not re.fullmatch(r'(?:[A-Za-z ]+ Senate race|[A-Za-z ]+ Governor|Special Senate election in (?:Ohio|Florida)|Who will win the (?:Senate race in [A-Za-z ]+|Alaska Senate race)\?)',title):continue
            office='Senate' if 'Senate' in title else 'Governor'
            if any(r['office']==office and re.search(r'\b'+re.escape(r['state_name'])+r'\b',title) for r in races):selected.append(item)
        for item in selected:
            for raw in paginate(client,'/markets','markets',{'series_ticker':item['ticker']}):accept(raw)
    if discover:
        for raw in paginate(client,'/markets','markets',{'series_ticker':'CONTROLS'}):accept(raw)
    for mapping in known:
        if mapping['contract_id'] not in contracts:
            # A genuinely absent ID must not silently disappear or acquire invented odds.
            try:
                raw=client.get(BASE+'/markets/'+mapping['market_id']).get('market',{})
                accept(raw)
            except Exception as exc:
                logging.warning('Known Kalshi contract unavailable: %s: %s',mapping['market_id'],exc)
    return list(contracts.values()),list(quotes.values()),raws
