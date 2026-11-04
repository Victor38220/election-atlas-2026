import re, unicodedata, math
from datetime import datetime, timezone

def now(): return datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
def name_key(value):
    return re.sub(r'[^a-z0-9]','',unicodedata.normalize('NFKD',str(value)).encode('ascii','ignore').decode().lower())
def number(value):
    try:
        n=float(value)
        return n if math.isfinite(n) else None
    except (TypeError,ValueError): return None
def probability(value):
    n=number(value)
    return n if n is not None and 0<=n<=1 else None
def stamp(value):
    if not value:return None
    try:
        d=datetime.fromisoformat(str(value).replace('Z','+00:00'))
        return d.replace(tzinfo=d.tzinfo or timezone.utc).isoformat().replace('+00:00','Z')
    except ValueError:return None

def deduplicate(polls):
    result=[]; seen=set()
    for poll in sorted(polls,key=lambda p:p['provider']!='polling_forecast'):
        # Same pollster, fieldwork, sample, population and candidate observations.
        key=(poll['race_id'],name_key(poll['pollster']),str(poll.get('start',''))[:10],str(poll.get('end',''))[:10],poll.get('sample'),str(poll.get('population','')).upper())
        source=(poll['race_id'],poll.get('url'),str(poll.get('end',''))[:10],poll.get('sample'))
        if key in seen or (poll.get('url') and source in seen):continue
        seen.update([key,source]); result.append(poll)
    return result

def quote_price(bid,ask,last,status,liquidity=None):
    live=status in ('active','open','initialized')
    if live and bid is not None and ask is not None and 0<bid<=ask<1 and ask-bid<=.30 and liquidity!=0:
        return round((bid+ask)/2,6),'midpoint',None
    # A last trade has no trustworthy recency on these responses. Preserve raw, never promote it.
    return None,'unavailable','Closed market or missing, one-sided, wide, or empty book; raw last trade retained.'
