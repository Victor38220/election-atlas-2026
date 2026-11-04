import type {Race} from '../types';
import manifest from '../../config/races.json' with {type:'json'};

export type Chamber='Senate'|'House';
export interface SeatResult {id:string;state:string;district:string|null;office:Chamber;label:string;winner_name:string|null;winner_party:string|null;called:boolean;called_at:string|null;flip:boolean|null;previous_party:string|null;source_url:string;as_of:string|null;estimated_vote_in?:number|null}
export interface ChamberData {office:Chamber;total:number;majority:number;continuing:{party:string;label:string;count:number}[];seats:SeatResult[];source_url:string;as_of:string|null;fetched_at:string;baseline_label:string}
export interface CongressData {fetched_at:string;senate:ChamberData|null;house:ChamberData|null;errors:string[]}

type Candidate={first_name?:string|null;middle_name?:string|null;last_name?:string|null;suffix?:string|null;party?:{nyt_id?:string|null}|null};
type SourceRace={nyt_id?:string;election_date?:string;office_id?:string;race_type_id?:string;type?:string;seat_number?:string|null;race_call_status?:string|null;updated_at?:string|null;top_reporting_unit?:{state_postal?:string|null;provider_updated_at?:string|null;eevp?:number|null}|null;candidate_metadata?:Record<string,Candidate>;outcome?:{won?:string[];called_by?:string[];winner_accepted_at?:string[];gained?:boolean|null}};
type Payload={races?:SourceRace[];partyControlData?:{results?:{offices?:{S?:{party_balance?:Record<string,{no_election?:number}>}}}[]}};
const states=new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
function party(id:string|null|undefined):string|null {if(!id)return null;const value=id.toUpperCase();return value==='DEM'?'D':value==='GOP'||value==='REP'?'R':value==='IND'?'I':value==='OTH'?'O':null;}

/** Normalize published election seats. A call acceptance timestamp is not the exact call time. */
export function normalizeChamber(payload:unknown,office:Chamber,fetchedAt:string,races:Race[]=manifest as Race[]):ChamberData {
 if(!payload||typeof payload!=='object'||!Array.isArray((payload as Payload).races))throw new Error('Chamber feed has no race array');
 const data=payload as Payload;
 const source_url=`https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-${office.toLowerCase()}.json`;
 const seats:SeatResult[]=[];const seen=new Set<string>();
 for(const race of data.races??[]){
  const state=race.top_reporting_unit?.state_postal??'';
  if(!states.has(state)||race.election_date!=='2026-11-03'||race.office_id!==(office==='Senate'?'S':'H'))continue;
  const general=race.race_type_id==='G'&&race.type==='General';
  const louisiana=office==='House'&&state==='LA'&&race.race_type_id==='L'&&race.type==='Nonpartisan Election';
  const special=office==='Senate'&&race.race_type_id==='W'&&race.type==='Special General';
  if(!general&&!louisiana&&!special)continue;
  const manifestRace=office==='Senate'?races.find(r=>r.state===state&&r.office==='Senate'&&r.year===2026):undefined;
  if(office==='Senate'&&!manifestRace)continue;
  const district=office==='House'?race.seat_number??null:null;
  if(office==='House'&&(!district||!/^\d+$/.test(district)||Number(district)<1))continue;
  const key=office==='House'?`${state}-${district}`:state;if(seen.has(key))throw new Error(`Duplicate ${office} seat ${key}`);seen.add(key);
  const outcome=race.outcome;const won=outcome?.won??[];
  const called=race.race_call_status==='called'&&outcome?.called_by?.some(x=>x.toLowerCase()==='ap')===true&&won.length===1&&!!race.candidate_metadata?.[won[0]];
  const candidate=called?race.candidate_metadata?.[won[0]]:undefined;
  const winner_name=candidate?[candidate.first_name,candidate.middle_name,candidate.last_name,candidate.suffix].filter(Boolean).join(' ')||null:null;
  seats.push({id:race.nyt_id??`${state}-${office}-${district??''}`,state,district,office,label:office==='House'?`${state}-${district}`:state,winner_name,winner_party:party(candidate?.party?.nyt_id),called,called_at:called?outcome?.winner_accepted_at?.[0]??null:null,flip:called?(typeof outcome?.gained==='boolean'?outcome.gained:null):null,previous_party:manifestRace?.defending_party??null,source_url,as_of:race.top_reporting_unit?.provider_updated_at??race.updated_at??null,estimated_vote_in:typeof race.top_reporting_unit?.eevp==='number'&&race.top_reporting_unit.eevp>=0&&race.top_reporting_unit.eevp<=100?race.top_reporting_unit.eevp/100:null});
 }
 const balance=data.partyControlData?.results?.[0]?.offices?.S?.party_balance;
 const dem=balance?.DEM?.no_election,rep=balance?.GOP?.no_election;
 const continuing=office==='Senate'&&typeof dem==='number'&&typeof rep==='number'&&Number.isInteger(dem)&&Number.isInteger(rep)&&dem>=0&&rep>=0&&dem+rep===65?[{party:'D',label:'Democratic / aligned',count:dem},{party:'R',label:'Republican',count:rep}]:[];
 const times=seats.map(s=>s.as_of).filter((s):s is string=>!!s).sort();
 return {office,total:office==='Senate'?100:435,majority:office==='Senate'?51:218,continuing,seats,source_url,as_of:times.at(-1)??null,fetched_at:fetchedAt,baseline_label:office==='Senate'?'Continuing seats; Democratic / aligned includes caucusing independents. 51 is an outright majority.':'All 435 House seats are up for election.'};
}

const houseApportionment:Record<string,number>={AL:7,AK:1,AZ:9,AR:4,CA:52,CO:8,CT:5,DE:1,FL:28,GA:14,HI:2,ID:2,IL:17,IN:9,IA:4,KS:4,KY:6,LA:6,ME:2,MD:8,MA:9,MI:13,MN:8,MS:4,MO:8,MT:2,NE:3,NV:4,NH:2,NJ:12,NM:3,NY:26,NC:14,ND:1,OH:15,OK:5,OR:6,PA:17,RI:2,SC:7,SD:1,TN:9,TX:38,UT:4,VT:1,VA:11,WA:10,WV:2,WI:8,WY:1};

/** Reject incomplete snapshots so refresh callers can retain their last good data. */
export function validateChamberCompleteness(data:ChamberData):void {
 const expected=data.office==='Senate'?35:435;
 if(data.seats.length!==expected)throw new Error(`${data.office} feed has ${data.seats.length} seats; expected ${expected}`);
 if(data.office==='Senate'&&data.continuing.reduce((sum,row)=>sum+row.count,0)!==65)throw new Error('Senate feed lacks the 65 continuing seats');
 if(data.office==='House')for(const [state,count] of Object.entries(houseApportionment)){
  const districts=data.seats.filter(seat=>seat.state===state).map(seat=>seat.district);
  if(districts.length!==count||new Set(districts).size!==count||!Array.from({length:count},(_,i)=>String(i+1)).every(district=>districts.includes(district)))throw new Error(`House feed has invalid ${state} districts; expected 1–${count}`);
 }
}
