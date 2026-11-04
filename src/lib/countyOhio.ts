import type {FeatureCollection,Geometry} from 'geojson';
import type {CountyLiveData,CountyLiveResult} from '../types/countyResults';
import type {Office} from '../types';
const SOURCE='https://liveresults.ohiosos.gov/Api/v1/download?filename=VSSC1622XmlFileBlob';
const elements=(parent:Document|Element,name:string)=>Array.from(parent.getElementsByTagNameNS('*',name));
const text=(parent:Document|Element,name:string)=>elements(parent,name)[0]?.textContent?.trim()??'';
const key=(v:string)=>v.toLowerCase().replace(/ county$/,'').replace(/[^a-z0-9]/g,'');
function count(v:string|null):number|null{if(v===null||v==='')return null;const n=Number(v);if(!Number.isInteger(n)||n<0)throw new Error('Invalid Ohio count');return n}
function party(v:string){return ({DEM:'D',REP:'R',LIB:'L',Indep:'I',Nonprtycan:'I',None:'','Write-in':''} as Record<string,string>)[v]??v}
export function normalizeOhio(raw:unknown,geo:FeatureCollection<Geometry>,fetchedAt:string):CountyLiveData{
 if(typeof raw!=='string'||!raw.trim())throw new Error('Missing Ohio XML');
 const document=new DOMParser().parseFromString(raw,'application/xml');if(elements(document,'parsererror').length)throw new Error('Invalid Ohio XML');
 const report=document.documentElement,election=elements(document,'Election')[0];
 if(report.localName!=='ElectionReport'||report.getAttribute('IssuerAbbreviation')!=='OH'||!election||election.getAttribute('Date')!=='2026-11-03'||election.getAttribute('Type')!=='General')throw new Error('Ohio source is not the November 3, 2026 general election');
 const sourceTime=report.getAttribute('GeneratedDate');if(sourceTime&&!Number.isFinite(Date.parse(sourceTime)))throw new Error('Invalid Ohio generated timestamp');
 const geometry=new Map(geo.features.map(f=>[key(String(f.properties?.name??'')),f]));
 // The source also has electoral district records named "Adams County", etc.
 // Only actual reporting-unit counties may supply county votes or reporting stats.
 const counties=elements(document,'GpUnit').filter(g=>g.getAttribute('Type')==='County'&&g.getAttribute('IsElectoralDistrict')==='false');
 const countyById=new Map(counties.map(c=>[c.getAttribute('ObjectId')!,c]));
 const parties=new Map(elements(document,'Party').map(p=>[p.getAttribute('ObjectId')!,party(p.getAttribute('Abbreviation')??'')]));
 const candidates=new Map(elements(election,'Candidate').map(c=>[c.getAttribute('ObjectId')!,c]));
 const normalized:CountyLiveResult[]=[];let skipped=0;
 const contests=elements(election,'Contest').filter(c=>['U.S. Senator','Governor and Lieutenant Governor'].includes(c.getAttribute('Name')??''));
 if(contests.length!==2)throw new Error('Ohio U.S. Senate and Governor contests not uniquely identified');
 for(const contest of contests){const office:Office=contest.getAttribute('Name')==='U.S. Senator'?'Senate':'Governor';
  const selections=elements(contest,'BallotSelection').map(selection=>{
   const ids=elements(selection,'CandidateId').map(i=>i.textContent?.trim()??'');const people=ids.map(id=>candidates.get(id));if(people.some(p=>!p))throw new Error('Ohio candidate reference missing');
   const top=people.length===1?people[0]!:people.find(p=>p?.getAttribute('IsTopTicket')==='true');if(!top)throw new Error('Ohio governor ticket head missing');
   const name=text(top,'BallotName');if(!name)throw new Error('Ohio ballot candidate name missing');const affiliation=parties.get(text(top,'PartyId'));if(affiliation===undefined)throw new Error('Ohio candidate party reference missing');
   const counts=new Map<string,number>();for(const c of elements(selection,'VoteCounts')){if(c.getAttribute('Type')!=='Total')continue;const unit=text(c,'GpUnitId');if(!countyById.has(unit))continue;const n=count(c.getAttribute('Count'));if(n===null)throw new Error('Ohio county vote count missing');if(counts.has(unit))throw new Error('Duplicate Ohio county total');counts.set(unit,n)}
   return {name,party:affiliation,counts};
  });
  for(const [id,county] of countyById){const name=county.getAttribute('Name')??'';const boundary=geometry.get(key(name));if(!boundary||!String(boundary.id).startsWith('39')){skipped++;continue}
   if(selections.some(s=>!s.counts.has(id))){skipped++;continue}
   const total=selections.reduce((n,s)=>n+s.counts.get(id)!,0);const options=selections.map(s=>({name:s.name,party:s.party,votes:s.counts.get(id)!,share:total>0?s.counts.get(id)!/total:null})).sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name));
   normalized.push({fips:String(boundary.id),county:String(boundary.properties?.name??name),state:'OH',office,year:2026,candidates:options,total,reported:count(county.getAttribute('SubUnitsReported')),reporting_total:count(county.getAttribute('TotalSubUnits')),reporting_unit:'precincts',source_time:sourceTime,fetched_at:fetchedAt,source_url:SOURCE,source_name:'Ohio Secretary of State',status:total>0?'reporting':'awaiting'});
  }
 }
 return {state:'OH',year:2026,election_date:'2026-11-03',fetched_at:fetchedAt,source_time:sourceTime,source_name:'Ohio Secretary of State',source_url:SOURCE,rows:normalized,status:skipped?'partial':normalized.length?'ok':'unavailable',message:`${new Set(normalized.map(r=>r.fips)).size} Ohio counties with Senate and Governor returns. Official source refreshes every three minutes; unofficial counts.`};
}
