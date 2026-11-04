"""Run with python -m scripts.update_data [--force]. No browser-side provider access."""
import argparse, json, logging, os
from pathlib import Path
from datetime import datetime, timezone, timedelta
from scripts.http_client import Client
from scripts.normalize import now,stamp,deduplicate
from scripts.models import Snapshot,Race
from scripts.sources import polling_forecast,votehub,kalshi,polymarket
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'public/data'
def read(path,default):
    return json.loads(path.read_text()) if path.exists() else default

def write(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    encoded=json.dumps(data,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n'
    if not path.exists() or path.read_text()!=encoded:
        tmp=path.with_suffix('.tmp');tmp.write_text(encoded);tmp.replace(path)

def due(status,interval,current):
    if not status.get('last_success'):return True
    return (current-datetime.fromisoformat(status['last_success'].replace('Z','+00:00'))).total_seconds()>=interval

def history_update(history,quotes,current):
    """Keep actual observations: 15-minute buckets for 24h, hourly through day 21."""
    cutoff=current-timedelta(days=21)
    fine_cutoff=current-timedelta(days=1)
    merged={key:list(points) for key,points in history.items()}
    for quote in quotes:
        if quote['price'] is None:continue
        merged.setdefault(quote['contract_id'],[]).append({'t':quote['fetched_at'],'p':quote['price'],'method':quote['pricing_method']})
    compact={}
    for key,points in merged.items():
        buckets={}
        for point in sorted(points,key=lambda p:p['t']):
            try: observed=datetime.fromisoformat(point['t'].replace('Z','+00:00'))
            except (ValueError,KeyError):continue
            if observed<cutoff:continue
            seconds=900 if observed>=fine_cutoff else 3600
            bucket=(seconds,int(observed.timestamp())//seconds)
            buckets[bucket]={'t':point['t'],'p':point['p'],'method':point.get('method','midpoint')}
        if buckets:compact[key]=sorted(buckets.values(),key=lambda p:p['t'])
    return compact

def run(force=False):
    client=Client();current=datetime.now(timezone.utc);fetched=now()
    old=read(DATA/'latest.json',{});races=read(ROOT/'config/races.json',[]) or old.get('races',[])
    if not races:raise RuntimeError('Canonical manifest is required')
    mappings_file=ROOT/'config/market-mappings.json';map_config=read(mappings_file,{'mappings':[],'overrides':[]})
    statuses=old.get('providers',{}).copy();new=dict(old);new.update(races=races)
    for provider,interval in [('polling_forecast',86400),('votehub',86400),('counties',86400),('kalshi',900),('polymarket',900)]:
        status=statuses.get(provider,{})
        if not force and not due(status,interval,current):continue
        partial_message=''
        try:
            if provider=='polling_forecast':
                updated,summaries,polls,pollsters=polling_forecast.fetch(client,races)
                # Persist all daily metadata alongside the snapshot.
                races=updated;new.update(races=races,summaries=summaries,polls=polls+[p for p in old.get('polls',[]) if p['provider']!='polling_forecast'])
                write(DATA/'pollsters.json',pollsters);write(ROOT/'config/races.json',races)
            elif provider=='votehub':
                polls,context=votehub.fetch(client,races)
                new['polls']=[p for p in new.get('polls',[]) if p['provider']!='votehub']+polls
                new.setdefault('context',{})['votehub']=context
            elif provider=='counties':
                payload=client.get(polling_forecast.BASE+'/counties');rows=polling_forecast.rows(payload)
                if not rows:raise ValueError('Empty county response; previous data retained')
                for state in {r['state'] for r in rows}:
                    write(DATA/'counties'/f'{state}.json',{'as_of':payload.get('asOf'),'attribution':payload.get('attribution'),'rows':[r for r in rows if r['state']==state]})
            else:
                adapter=kalshi if provider=='kalshi' else polymarket
                discovery=map_config.setdefault('last_discovery',{})
                known=[m for m in map_config['mappings'] if m['provider']==provider]
                last_discovery=discovery.get(provider) or (status.get('last_success') if known else None)
                discover=force or not known or due({'last_success':last_discovery},86400,current)
                if provider=='kalshi':
                    contracts,quotes,raws=adapter.fetch(client,races,map_config['mappings'],fetched,discover=discover)
                else:
                    contracts,quotes,raws=adapter.fetch(client,races,map_config['mappings'],fetched)
                if discover:discovery[provider]=fetched
                if not contracts:raise ValueError('No verified contracts returned; keeping previous coverage')
                found={contract['id'] for contract in contracts}
                missing=[contract for contract in old.get('contracts',[]) if contract['provider']==provider and contract['id'] not in found]
                if missing:
                    partial_message=f'{len(missing)} previously known contracts unavailable; identifiers and raw values retained'
                    for contract in missing:
                        contracts.append({**contract,'status':'unavailable'})
                        prior_quote=next((quote for quote in old.get('quotes',[]) if quote['contract_id']==contract['id']),None)
                        if prior_quote:quotes.append({**prior_quote,'price':None,'pricing_method':'unavailable','warning':'Known contract omitted or incompatible on refresh; previous raw fields retained.'})
                # Apply explicit human-review overrides, including comparison-group approvals.
                for c in contracts:
                    for override in map_config.get('overrides',[]):
                        if c['id']==override['contract_id']:
                            if override.get('reject'):quotes=[q for q in quotes if q['contract_id']!=c['id']];c['status']='rejected'
                            if override.get('comparison_group'):c['comparison_group']=override['comparison_group']
                contracts=[c for c in contracts if c['status']!='rejected']
                new['contracts']=[c for c in new.get('contracts',[]) if c['provider']!=provider]+contracts
                new['quotes']=[q for q in new.get('quotes',[]) if q['provider']!=provider]+quotes
                prior={m['contract_id']:m for m in map_config['mappings']}
                for c in contracts:prior[c['id']]={'contract_id':c['id'],'provider':provider,'market_id':c['market_id'],'event_id':c['event_id'],'race_id':c['race_id'],'outcome':c['outcome'],'outcome_type':c['outcome_type'],'settlement':c['settlement'],'question':c['question'],'rules':c['rules'],'url':c['url'],'review':'deterministic verified; cross-provider comparison requires explicit override'}
                map_config['mappings']=list(prior.values());write(mappings_file,map_config)
                write(ROOT/'artifacts'/f'{provider}-verified.json',raws)
            statuses[provider]={'status':'partial' if partial_message else 'ok','last_attempt':fetched,'last_success':fetched,'message':partial_message,'refresh_seconds':interval}
            logging.info(json.dumps({'provider':provider,'status':'ok'}))
        except Exception as exc:
            statuses[provider]={'status':'error','last_attempt':fetched,'last_success':status.get('last_success'),'message':str(exc)[:400],'refresh_seconds':interval}
            logging.error(json.dumps({'provider':provider,'status':'error','error':str(exc)}))
    new['polls']=deduplicate(new.get('polls',[]))
    new.update(generated_at=fetched,providers=statuses,schema_version=1)
    validated=Snapshot.model_validate(new).model_dump()
    write(DATA/'latest.json',validated)
    history=history_update(read(DATA/'history.json',{}),validated['quotes'],current)
    write(DATA/'history.json',history)
    write(DATA/'metadata.json',{'generated_at':fetched,'providers':statuses,'polling_note':'Margins: first listed candidate minus Republican, in percentage points. Model probabilities and model margins are distinct from polling averages.','market_note':'Executable two-sided bid/ask midpoints only; last trades retained as raw fields. Different settlement terms excluded from comparison unless explicitly reviewed.','county_note':'Historical returns only. No 2026 live county results source has been verified.','retention_days':21,'history_resolution':'15 minutes for 24 hours, then hourly; observed points only','source_urls':['https://www.pollingforecast.com/us/data','https://votehub.com/polls/api/','https://docs.kalshi.com/getting_started/quick_start_market_data','https://docs.polymarket.com/market-data/overview']})
    print(json.dumps({'races':len(validated['races']),'polls':len(validated['polls']),'contracts':len(validated['contracts']),'usable_quotes':sum(q['price'] is not None for q in validated['quotes']),'providers':statuses},indent=2))
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--force',action='store_true');args=parser.parse_args();logging.basicConfig(level=logging.INFO);run(args.force)
