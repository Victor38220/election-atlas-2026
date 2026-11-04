import type {FeatureCollection,Geometry} from 'geojson';
import type {CountyLiveData,CountyLiveResult} from '../types/countyResults';
import type {Office} from '../types';

const SOURCE='https://texianpartisan.com/election-night-2026/';
const NAME='Texas SOS via Texian Partisan (secondary mirror)';
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid Texas county feed object');return v as Record<string,unknown>};
const string=(v:unknown)=>{if(typeof v!=='string'||!v.trim())throw new Error('Missing Texas county feed identity');return v};
const count=(v:unknown)=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)throw new Error('Invalid Texas vote or reporting count');return v};
const key=(v:string)=>v.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const party=(v:string)=>({DEM:'D',REP:'R',LIB:'L',GRE:'G',GRN:'G',IND:'I',W:'W',WI:'W'} as Record<string,string>)[v]??v;
const time=(v:unknown)=>{if(v===null||v===undefined)return null;const s=string(v);if(!Number.isFinite(Date.parse(s)))throw new Error('Invalid Texas source timestamp');return s};

export function normalizeTexas(raw:unknown,geo:FeatureCollection<Geometry>,fetchedAt:string):CountyLiveData{
 const bundle=object(raw);if(bundle.election_date!=='2026-11-03')throw new Error('Texas source is not the November 3, 2026 general election');
 const boundaries=new Map(geo.features.map(feature=>[key(String(feature.properties?.name??'')),feature]));
 const rows:CountyLiveResult[]=[];const sourceTimes:string[]=[];const mirrorTimes:string[]=[];let skipped=0;
 for(const office of ['Senate','Governor'] as Office[]){
  if(bundle[office]===undefined)continue;
  const feed=object(bundle[office]);const senate=office==='Senate';
  if(feed.key!==(senate?'us-senate':'governor')||feed.race!==(senate?'U.S. Senator':'Governor'))throw new Error('Texas source office mismatch');
  if(!Array.isArray(feed.candidates)||!feed.candidates.length||!Array.isArray(feed.counties)||!feed.counties.length)throw new Error('Empty Texas county results');
  const candidates=feed.candidates.map(v=>{const c=object(v);return {name:string(c.name),party:party(string(c.party))}});
  if(new Set(candidates.map(c=>key(c.name))).size!==candidates.length)throw new Error('Duplicate Texas candidate identity');
  const mirrorTime=time(feed.fetchedAt);if(!mirrorTime)throw new Error('Missing Texas mirror collection timestamp');
  const sourceTime=time(feed.sourceUpdatedAt);
  for(const stamp of [mirrorTime,sourceTime].filter((v):v is string=>v!==null)){const value=Date.parse(stamp);if(value<Date.parse('2026-11-03T00:00:00Z')||value>=Date.parse('2027-01-01T00:00:00Z')||value>Date.parse(fetchedAt)+60000)throw new Error('Texas feed timestamp is outside the 2026 general-election window or in the future')}
  if(sourceTime&&Date.parse(sourceTime)>Date.parse(mirrorTime)+60000)throw new Error('Texas source timestamp is after mirror collection');
  if(sourceTime)sourceTimes.push(sourceTime);mirrorTimes.push(mirrorTime);
  const seen=new Set<string>();
  for(const value of feed.counties){
   const county=object(value);const countyName=string(county.id);const countyKey=key(countyName);
   if(seen.has(countyKey))throw new Error('Duplicate Texas county result');seen.add(countyKey);
   const boundary=boundaries.get(countyKey);if(!boundary||!String(boundary.id).startsWith('48')){skipped++;continue}
   if(!Array.isArray(county.votes)||county.votes.length!==candidates.length)throw new Error('Texas candidate outcomes do not match vote array');
   const votes=county.votes.map(count);const total=count(county.total);if(votes.reduce((a,b)=>a+b,0)!==total)throw new Error('Texas candidate votes do not sum to county total');
   const reported=county.reported==null?null:count(county.reported);const precincts=county.precincts==null?null:count(county.precincts);
   if(reported!==null&&precincts!==null&&reported>precincts)throw new Error('Invalid Texas precinct reporting totals');
   rows.push({fips:String(boundary.id),county:String(boundary.properties?.name??countyName),state:'TX',office,year:2026,candidates:candidates.map((c,i)=>({...c,votes:votes[i],share:total>0?votes[i]/total:null})).sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name)),total,reported,reporting_total:precincts,reporting_unit:reported!==null&&precincts!==null?'precincts':null,source_time:sourceTime,fetched_at:mirrorTime,source_url:SOURCE,source_name:NAME,status:total>0?'reporting':'awaiting'});
  }
 }
 if(!rows.length)throw new Error('No Texas general-election county results');
 const sourceTime=sourceTimes.length?sourceTimes.sort((a,b)=>Date.parse(a)-Date.parse(b))[0]:null;
 const incomplete=skipped>0||(['Senate','Governor'] as Office[]).some(office=>rows.filter(row=>row.office===office).length!==geo.features.length);
 return {state:'TX',year:2026,election_date:'2026-11-03',fetched_at:mirrorTimes.sort((a,b)=>Date.parse(a)-Date.parse(b))[0],source_time:sourceTime,source_name:NAME,source_url:SOURCE,rows,status:incomplete?'partial':'ok',message:`${new Set(rows.map(r=>r.fips)).size} Texas counties.${incomplete?' County coverage is incomplete; these counts cannot be used as statewide totals.':''} Unofficial general-election returns from the Texas Secretary of State and county feeds via a secondary Texian Partisan mirror; no race calls.`};
}
