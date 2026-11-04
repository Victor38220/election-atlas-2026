import type {FeatureCollection,Geometry} from 'geojson';
import type {Office,Race} from '../types';
import type {CountyLiveData,CountyLiveResult} from '../types/countyResults';
import type {RaceResult} from './results';

type Row=Record<string,unknown>;
const row=(value:unknown):Row=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid published election data');return value as Row};
const list=(value:unknown):Row[]=>{if(!Array.isArray(value))throw new Error('Missing published election records');return value.map(row)};
const text=(value:unknown)=>typeof value==='string'?value:'';
const count=(value:unknown):number|null=>{if(value===null||value===undefined)return null;if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new Error('Invalid reported vote count');return value};
const stamp=(value:unknown)=>{const s=text(value);if(!s)return null;if(!Number.isFinite(Date.parse(s)))throw new Error('Invalid election source timestamp');return s};
function estimatedVoteIn(value:unknown):number|null{if(value===null||value===undefined)return null;if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100)throw new Error('Invalid published estimated vote-in percentage');return value/100}
const parties:Record<string,string>={DEM:'D',GOP:'R',REP:'R',IND:'I',LIB:'L',GRN:'G',GRE:'G'};
export const nationalSlug=(name:string)=>name.toLowerCase().replace(/\s+/g,'-');
export const nationalUrl=(stateName:string)=>`https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-${nationalSlug(stateName)}.json`;

function candidates(race:Row,unit:Row,total:number|null){
 const metadata=row(race.candidate_metadata);const seen=new Set<string>();
 return list(unit.candidates).map(item=>{const id=text(item.nyt_id);if(!id||seen.has(id))throw new Error('Missing or duplicate candidate identity');seen.add(id);const meta=row(metadata[id]);const name=[meta.first_name,meta.middle_name,meta.last_name,meta.suffix].map(text).filter(Boolean).join(' ');if(!name)throw new Error('Missing candidate name');const party=text(row(meta.party).nyt_id);const votes=count(row(item.votes).total);if(votes===null)throw new Error('Missing actual candidate votes');return {name,party:parties[party]??party,votes,share:total!==null&&total>0?votes/total:null}}).sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name));
}
function sourceRaces(payload:unknown,office:Office,races:Race[],state?:string){
 return list(row(payload).races).filter(r=>r.election_date==='2026-11-03'&&((r.type==='General'&&r.race_type_id==='G')||(r.type==='Special General'&&r.race_type_id==='W'))&&r.office_id===(office==='Senate'?'S':'G')).flatMap(source=>{
  const sourceState=text(row(source.top_reporting_unit).state_postal);if(state&&sourceState!==state)return [];
  const matches=races.filter(r=>r.state===sourceState&&r.office===office&&r.year===2026&&r.election_type===(source.race_type_id==='W'?'special':'regular'));if(matches.length!==1)return [];
  return [{source,race:matches[0]}];
 });
}
/** Actual vote totals and separately labeled source counting estimates. No model vote forecast enters counted votes. */
export function normalizeNationalResults(payload:unknown,office:Office,races:Race[]):RaceResult[]{
 return sourceRaces(payload,office,races).map(({source,race})=>{
  const unit=row(source.top_reporting_unit),total=count(unit.total_votes);if(total===null)throw new Error('Missing statewide reported total');
  const observed=candidates(source,unit,total);if(observed.reduce((sum,c)=>sum+c.votes,0)>total)throw new Error('Candidate votes exceed reported total');
  return {race_id:race.id,state:race.state,office,as_of:stamp(unit.provider_updated_at)||stamp(source.updated_at),pct_reporting:null,estimated_vote_in:estimatedVoteIn(unit.eevp),total,candidates:observed,stale:false,source_url:text(source.url)||nationalUrl(race.state_name)};
 });
}

export function normalizeNationalCounties(payload:unknown,state:string,geo:FeatureCollection<Geometry>,fetchedAt:string,races:Race[]):CountyLiveData{
 const stateRaces=races.filter(r=>r.state===state);if(!stateRaces.length)throw new Error('No tracked election in this state');
 const sourceUrl=nationalUrl(stateRaces[0].state_name),sourceName='Reported election returns via The New York Times';
 const geometry=new Map(geo.features.map(f=>[String(f.id).padStart(5,'0'),String(f.properties?.name??'')]));
 const district=geo.features[0]?.properties?.geography_type==='state_house_district';
 const rows:CountyLiveResult[]=[];const clocks:string[]=[];let incomplete=false;let unreconciled=false;let aggregated=false;let incompatible=0;
 for(const office of [...new Set(stateRaces.map(r=>r.office))]){
  const matches=sourceRaces(payload,office,races,state);if(matches.length!==1){incomplete=true;continue}const {source}=matches[0];
  const timestamp=stamp(row(source.top_reporting_unit).provider_updated_at)||stamp(source.updated_at);if(timestamp)clocks.push(timestamp);
  const units=list(source.reporting_units);const countyUnits=units.filter(u=>u.level==='county');
  // New England reports towns. Use only the county FIPS supplied by the publisher, with distinct town IDs.
  const selected=district?units.filter(u=>u.level==='state_house_district'):countyUnits.length?countyUnits:units.filter(u=>u.level==='township');if(!district&&!countyUnits.length&&selected.length)aggregated=true;
  const groups=new Map<string,Row[]>(),seen=new Set<string>();
  for(const unit of selected){
   if(unit.state_postal!==state||text(unit.fips_state)!==stateRaces[0].fips)throw new Error('County result belongs to a different state');
   const county=text(district?unit.fips_suffix:unit.fips_county);if(!/^\d{3}$/.test(county)){incompatible++;continue}const fips=text(unit.fips_state)+county;
   if(!geometry.has(fips)){incompatible++;continue}const identity=text(unit.nyt_id);if(!identity||seen.has(identity))throw new Error('Duplicate reporting geography');seen.add(identity);
   const group=groups.get(fips)??[];group.push(unit);groups.set(fips,group);
  }
  for(const [fips,group] of groups){
   if(countyUnits.length&&group.length!==1)throw new Error('Duplicate county vote total');
   const grouped=new Map<string,ReturnType<typeof candidates>[number]>();let total=0;let missing=false,reported=0,precincts=0,missingReporting=false;
   for(const unit of group){const observedTotal=count(unit.total_votes);if(observedTotal===null){missing=true;continue}const observed=candidates(source,unit,observedTotal);if(observed.reduce((s,c)=>s+c.votes,0)>observedTotal)throw new Error('County candidate votes exceed total');total+=observedTotal;
    for(const c of observed){const key=c.party+'|'+c.name;const old=grouped.get(key);grouped.set(key,{...c,votes:c.votes+(old?.votes??0),share:null})}
    const pr=count(unit.precincts_reporting),pt=count(unit.precincts_total);if(pr===null||pt===null)missingReporting=true;else{if(pr>pt)throw new Error('Invalid precinct count');reported+=pr;precincts+=pt}
   }
   if(missing){incomplete=true;continue}
   const observed=[...grouped.values()].map(c=>({...c,share:total>0?c.votes/total:null})).sort((a,b)=>b.votes-a.votes);
   let estimated=group.length===1?estimatedVoteIn(group[0].eevp):null;let estimateMethod:CountyLiveResult['estimated_vote_in_method']=estimated===null?null:'published';
   if(group.length>1){let weight=0,weighted=0,missingEstimate=false;for(const unit of group){const value=estimatedVoteIn(unit.eevp),expected=unit.total_expected_vote;if(value===null||typeof expected!=='number'||!Number.isFinite(expected)||expected<=0){missingEstimate=true;break}weight+=expected;weighted+=value*expected}if(!missingEstimate&&weight>0){estimated=weighted/weight;estimateMethod='weighted_town_estimates'}}
   rows.push({fips,county:geometry.get(fips)!,geography_type:district?'state_house_district':'county',...district?{district_id:fips.slice(2)}:{},state,office,year:2026,candidates:observed,total,estimated_vote_in:estimated,estimated_vote_in_method:estimateMethod,reported:missingReporting?null:reported,reporting_total:missingReporting?null:precincts,reporting_unit:missingReporting?null:'precincts',source_time:timestamp,fetched_at:fetchedAt,source_url:sourceUrl,source_name:sourceName,status:total>0?'reporting':'awaiting'});
  }
  if(groups.size!==geometry.size)incomplete=true;
  // A county aggregate cannot replace statewide counts when towns/units are missing.
  const stateTotal=count(row(source.top_reporting_unit).total_votes);const countyTotal=rows.filter(r=>r.office===office).reduce((s,r)=>s+(r.total??0),0);
  if(stateTotal!==null&&countyTotal!==stateTotal){incomplete=true;unreconciled=true}
 }
 const statewide=(['Senate','Governor'] as Office[]).flatMap(office=>normalizeNationalResults(payload,office,races)).filter(r=>r.state===state);
 return {state,geography_type:district?'state_house_district':'county',statewide,year:2026,election_date:'2026-11-03',fetched_at:fetchedAt,source_time:clocks.sort().at(-1)??null,source_name:sourceName,source_url:sourceUrl,rows,status:!rows.length?'unavailable':incomplete||incompatible?'partial':'ok',message:!rows.length?'The source does not publish county totals compatible with this map. Statewide counts remain available.':`${new Set(rows.map(r=>r.fips)).size} ${district?'election districts':'counties'} with published returns.${district?' Alaska publishes House election districts, not borough/census-area county totals. Ranked-choice source counts do not establish a final-round winner.':''}${aggregated?' County totals sum distinct towns using publisher-supplied county FIPS.':''}${state==='CT'?' Connecticut uses the eight county groupings supplied by this feed, not the nine planning regions.':''}${incompatible?' Some reporting boundaries do not match this county map.':''}${unreconciled?' Local sums do not fully reconcile with the statewide snapshot; statewide cards use the separately reported state total.':incomplete?' Some county or office records are missing; statewide totals are reported separately.':''} Source times apply to the published race feed; individual local update times are not supplied. Unofficial counts. Counting-progress estimates are labeled separately; no win-probability forecasts are included.`};
}
