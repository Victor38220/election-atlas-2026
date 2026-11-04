export type Office='Senate'|'Governor';
export type Provider='kalshi'|'polymarket';
export type Mode='polling'|'forecast'|'kalshi'|'polymarket'|'difference';
export interface Candidate {id:string;name:string;party:string;caucus:string|null;aliases:string[]}
export interface Race {id:string;state:string;state_name:string;fips:string;office:Office;year:number;election_type:'regular'|'special';incumbent:string|null;incumbent_party:string|null;defending_party:string;candidates:Candidate[];status:string;provider_ids:Record<string,string>;sources:string[];updated_at:string}
export interface Summary {race_id:string;provider:string;comparison_candidate_id:string;poll_margin:number|null;forecast_margin:number|null;probability:number|null;rating:string|null;polls_used:number|null;as_of:string|null;availability:string;licence:string;url:string}
export interface Poll {id:string;race_id:string;provider:string;underlying_id:string;pollster:string;sponsor:string|null;start:string|null;end:string|null;sample:number|null;population:string|null;results:{name:string;party?:string;share:number}[];figures:string|null;margin:number|null;adjusted_margin:number|null;url:string|null;methodology:Record<string,unknown>;licence:string;attribution:string}
export interface Contract {id:string;provider:Provider;event_id:string;market_id:string;outcome_id:string|null;race_id:string|null;candidate_id:string|null;outcome:string;outcome_type:'party'|'candidate'|'control';question:string;rules:string;url:string;status:string;protocol:string|null;settlement:string;comparison_group:string|null}
export interface Quote {contract_id:string;provider:Provider;race_id:string|null;candidate_id:string|null;outcome:string;price:number|null;bid:number|null;ask:number|null;midpoint:number|null;last_trade:number|null;volume:number|null;liquidity:number|null;source_timestamp:string|null;fetched_at:string;pricing_method:string;warning:string|null}
export interface Status {status:'ok'|'partial'|'error'|'unavailable';last_attempt:string;last_success:string|null;message:string;refresh_seconds:number}
export interface Snapshot {schema_version:number;generated_at:string;providers:Record<string,Status>;races:Race[];summaries:Summary[];polls:Poll[];contracts:Contract[];quotes:Quote[];context:Record<string,unknown>}
export interface Point {t:string;p:number;method:string;bucket?:string}
export type History=Record<string,Point[]>;
export interface CountyRow {fips:string;state:string;county:string;office:string;year:number;dem_votes:number|null;rep_votes:number|null;total_votes:number|null;margin:number|null;source:string;licence:string}
export interface CountyData {as_of:string;attribution:string;rows:CountyRow[]}
