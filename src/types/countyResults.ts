import type {Office} from './index';
import type {ResultCandidate} from '../lib/results';
export interface CountyLiveResult {
 fips:string;county:string;state:string;office:Office;year:2026;
 candidates:ResultCandidate[];total:number|null;reported:number|null;reporting_total:number|null;reporting_unit:string|null;
 source_time:string|null;fetched_at:string;source_url:string;source_name:string;status:'reporting'|'awaiting';
}
export interface CountyLiveData {
 state:string;year:2026;election_date:'2026-11-03';fetched_at:string;source_time:string|null;source_name:string;source_url:string;
 rows:CountyLiveResult[];status:'ok'|'partial'|'unavailable';message:string;
}
