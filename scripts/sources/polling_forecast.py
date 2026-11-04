import re
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional
from scripts.models import Poll,PollingSummary
from scripts.normalize import stamp,number
BASE='https://www.pollingforecast.com/api/us'
class ForecastRow(BaseModel):
    model_config=ConfigDict(extra='ignore')
    key:str
    state:str
    kind:str
    left_candidate:Optional[str]=None
    rep_candidate:Optional[str]=None
    left_party:str='D'
    poll_average:Optional[float]=None
    best_bet_margin:Optional[float]=None
    chance_left:Optional[float]=Field(default=None,ge=0,le=1)

def rows(payload):
    if not isinstance(payload,dict) or not isinstance(payload.get('rows'),list):raise ValueError('Expected Polling Forecast rows envelope')
    if payload.get('count') is not None and payload['count']!=len(payload['rows']):raise ValueError('Incomplete provider envelope')
    return payload['rows']

def normalize_summary(raw,race):
    row=ForecastRow.model_validate(raw)
    return PollingSummary(race_id=race['id'],comparison_candidate_id=race['candidates'][0]['id'],poll_margin=row.poll_average,forecast_margin=row.best_bet_margin,probability=row.chance_left,rating=raw.get('rating'),polls_used=raw.get('polls_used'),as_of=stamp(raw.get('as_of')),availability='available' if row.poll_average is not None else 'no_polls',licence=raw.get('licence','CC BY 4.0'),url='https://www.pollingforecast.com'+raw.get('page','/us/data')).model_dump()

def normalize_poll(raw,race):
    results=[]
    for name,party,value in re.findall(r'([^;]+?)\s*\(([^)]+)\)\s*([\d.]+)',raw.get('figures') or ''):
        results.append({'name':name.strip(),'party':party,'share':float(value)/100})
    return Poll(id='pf:'+str(raw['poll_id']),race_id=race['id'],provider='polling_forecast',underlying_id=str(raw['poll_id']),pollster=raw.get('pollster') or 'Unknown',sponsor=raw.get('sponsor'),start=stamp(raw.get('fieldwork_start')),end=stamp(raw.get('fieldwork_end')),sample=raw.get('sample') or None,population=raw.get('population'),results=results,figures=raw.get('figures'),margin=raw.get('margin'),adjusted_margin=raw.get('adjusted_margin'),url=raw.get('source_url'),methodology={k:raw.get(k) for k in ['source_grade','partisan','question','stage','pollster_code']},licence=raw.get('licence','Unknown'),attribution='Polling Forecast; original pollster. Wikipedia contributors for rows licensed CC BY-SA 4.0.').model_dump()

def fetch(client,races):
    manifest={r['provider_ids']['polling_forecast']:r for r in races}
    summaries=[];polls=[];updated=[]
    for path in ['senate','governors']:
        payload=client.get(BASE+'/'+path); forecast_rows=rows(payload)
        expected=[r for r in races if r['office']==('Senate' if path=='senate' else 'Governor')]
        if {r['key'] for r in forecast_rows}!={r['provider_ids']['polling_forecast'] for r in expected}:raise ValueError('Race roster changed; review canonical manifest')
        for raw in forecast_rows:
            race=dict(manifest[raw['key']]); ForecastRow.model_validate(raw)
            candidates=[]
            for i,(field,party) in enumerate([('left_candidate',raw.get('left_party','D')),('rep_candidate','R')]):
                if raw.get(field):
                    candidates.append({'id':race['id']+':'+('left' if i==0 else 'rep'),'name':raw[field],'party':party,'caucus':None,'aliases':race['candidates'][i].get('aliases',[]) if len(race['candidates'])>i else [],'external_ids':{}})
            race['candidates']=candidates; race['updated_at']=stamp(raw.get('as_of')); updated.append(race)
            summaries.append(normalize_summary(raw,race))
    for kind in ['Senate','Governor']:
        for raw in rows(client.get(BASE+'/polls',params={'kind':kind})):
            if raw.get('race') in manifest and raw.get('stage') in (None,'vote','general'):
                polls.append(normalize_poll(raw,manifest[raw['race']]))
    pollsters=client.get(BASE+'/pollsters'); rows(pollsters)
    return updated,summaries,polls,pollsters
