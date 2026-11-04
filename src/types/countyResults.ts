import type {Office} from './index';
import type {ResultCandidate,RaceResult} from '../lib/results';
export interface CountyLiveResult {
 geography_type?:'county'|'state_house_district';district_id?:string;
 estimated_vote_in?:number|null;
 estimated_vote_in_method?:'published'|'weighted_town_estimates'|null;
 fips:string;county:string;state:string;office:Office;year:2026;
 candidates:ResultCandidate[];total:number|null;reported:number|null;reporting_total:number|null;reporting_unit:string|null;
 source_time:string|null;fetched_at:string;source_url:string;source_name:string;status:'reporting'|'awaiting';
}
export interface CountyLiveData {
 geography_type?:'county'|'state_house_district';
 statewide?:RaceResult[];
 state:string;year:2026;election_date:'2026-11-03';fetched_at:string;source_time:string|null;source_name:string;source_url:string;
 rows:CountyLiveResult[];status:'ok'|'partial'|'unavailable';message:string;
}
