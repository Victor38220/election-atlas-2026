import re
from scripts.normalize import name_key
EXCLUDE=r'\b(primary|nominee|nomination|margin|combo|within|state senate|lieutenant|turnout|recount|first round|round 1)\b'

def match_race(title,rules,races,provider):
    text=(title+' '+rules).lower()
    if re.search(EXCLUDE,title.lower()):return None
    if not re.search(r'\b2026\b',text) and not(provider=='kalshi' and 'term beginning in 2027' in text):return None
    if re.search(r'\b(2024|2028|2029)\b',title+' '+rules):return None
    office='Senate' if re.search(r'\bsenat(e|or)\b',text) else 'Governor' if re.search(r'\b(governor|gubernatorial)\b',text) else None
    if not office:return None
    located=[]
    for race in races:
        if race['office']!=office:continue
        for match in re.finditer(r'\b'+re.escape(race['state_name'].lower())+r'\b',text):located.append((race,match.span()))
    # West Virginia contains the complete name Virginia. Prefer the enclosing state,
    # while still rejecting contracts that independently mention multiple states.
    matches=[]
    for race,span in located:
        if any(other['id']!=race['id'] and outer[0]<=span[0] and outer[1]>=span[1] and outer!=span for other,outer in located):continue
        if not any(existing['id']==race['id'] for existing in matches):matches.append(race)
    if len(matches)!=1:return None
    r=matches[0]
    if r['election_type']=='special' and provider=='kalshi' and 'special' not in rules.lower():return None
    if provider=='kalshi' and not re.search(r'(sworn in|wins? the|winner)',rules.lower()):return None
    if provider=='polymarket' and not ('winner of' in rules.lower() and ('certification' in rules.lower() or 'official' in rules.lower())):return None
    return r

def match_outcome(label,question,race):
    text=question.lower()
    # Party contract remains a party contract even when UI subtitle names a candidate.
    party='D' if re.search(r'\bdemocrat(ic|ics|s)?\b',text) else 'R' if re.search(r'\brepublican(s)?\b',text) else None
    if party:
        candidate=next((c for c in race['candidates'] if c['party']==party),None)
        return (party,'party',candidate['id'] if candidate else None)
    key=name_key(label)
    candidates=[c for c in race['candidates'] if key in [name_key(c['name'])]+[name_key(a) for a in c.get('aliases',[])]]
    if len(candidates)==1:return candidates[0]['name'],'candidate',candidates[0]['id']
    return None

def compatible(a,b):
    return bool(a.get('comparison_group') and a.get('comparison_group')==b.get('comparison_group') and a['race_id']==b['race_id'] and a['outcome']==b['outcome'] and a['outcome_type']==b['outcome_type'])
