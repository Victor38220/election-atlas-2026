from scripts.models import Poll
from scripts.normalize import stamp,name_key,number
BASE='https://api.votehub.com'
def unwrap(data,key='polls'):
    value=data.get(key,[]) if isinstance(data,dict) else data
    if not isinstance(value,list):raise ValueError('Invalid VoteHub response')
    return value

def normalize_poll(raw,races):
    office={'us-senator':'Senate','governor':'Governor'}.get(raw.get('poll_type'))
    if not office:return None
    subject=raw.get('subject') or ''
    if '2026' not in subject:return None
    matches=[r for r in races if r['office']==office and name_key(subject)==name_key('2026 '+r['state_name'])]
    if len(matches)!=1:return None
    race=matches[0];answers=raw.get('answers') or []
    observed={name_key(a.get('choice')):number(a.get('pct')) for a in answers}
    if not all(name_key(c['name']) in observed for c in race['candidates'][:2]):return None
    margin=observed[name_key(race['candidates'][0]['name'])]-observed[name_key(race['candidates'][1]['name'])]
    return Poll(id='vh:'+str(raw['id']),race_id=race['id'],provider='votehub',underlying_id=str(raw['id']),pollster=raw.get('pollster') or 'Unknown',sponsor=', '.join(raw.get('sponsors') or []) or None,start=stamp(raw.get('start_date')),end=stamp(raw.get('end_date')),sample=int(raw['sample_size']) if number(raw.get('sample_size')) else None,population=raw.get('population'),results=[{'name':a['choice'],'share':float(a['pct'])/100} for a in answers],margin=margin,url=raw.get('url'),methodology={'partisan':raw.get('partisan'),'internal':raw.get('internal')},licence='CC BY 4.0',attribution='VoteHub; original pollster.').model_dump()

def fetch(client,races):
    types=unwrap(client.get(BASE+'/poll-types'),'poll_types')
    polls=[]
    for kind in ['us-senator','governor']:
        if kind in types:
            for raw in unwrap(client.get(BASE+'/polls',params={'poll_type':kind})):
                poll=normalize_poll(raw,races)
                if poll:polls.append(poll)
    return polls,{'available_poll_types':types,'message':'Only explicit 2026 state contests and matching candidate names accepted. Generic ballot never used for state races.'}
