import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SenateMap from './SenateMap';
import CountyExplorer from './CountyExplorer';
import type {Snapshot} from '../types';
import type {CountySelection} from './CountyExplorer';
import CountyReport from './CountyReport';
import races from '../../config/races.json';
import statesGeo from '../../public/geo/states.json';
import gaGeo from '../../public/geo/counties/GA.json';
import meGeo from '../../public/geo/counties/ME.json';
import caGeo from '../../public/geo/counties/CA.json';
import ncGeo from '../../public/geo/counties/NC.json';
import caData from '../../public/data/live-counties/CA.json';
import ncData from '../../public/data/live-counties/NC.json';
import caRaw from '../../tests/fixtures/california-live-counties.json';
import ncRaw from '../../tests/fixtures/nc-county-live.json';

const snapshot={schema_version:1,generated_at:'2026-11-04T00:00:00Z',races,summaries:[],contracts:[],quotes:[],polls:[],providers:{},context:{}} as Snapshot;
const SENATE=['AL','AK','AR','CO','DE','FL','GA','ID','IL','IA','KS','KY','LA','ME','MA','MI','MN','MS','MT','NE','NH','NJ','NM','NC','OH','OK','OR','RI','SC','SD','TN','TX','VA','WV','WY'].sort();
const response=(data:unknown)=>Promise.resolve({ok:true,json:async()=>data} as Response);
beforeEach(()=>{localStorage.clear();vi.stubGlobal('fetch',vi.fn((url:string)=>{
 if(url.includes('geo/states.json'))return response(statesGeo);
 if(url.includes('geo/counties/GA.json'))return response(gaGeo);
 if(url.includes('geo/counties/ME.json'))return response(meGeo);
 if(url.includes('geo/counties/CA.json'))return response(caGeo);
 if(url.includes('geo/counties/NC.json'))return response(ncGeo);
 if(url.includes('data/live-counties/CA.json'))return response(caData);
 if(url.includes('data/live-counties/NC.json'))return response(ncData);
 if(url==='/api/counties/CA')return response(caRaw);
 if(url.startsWith('/api/batch?'))return response([ncRaw.county,ncRaw.candidates,ncRaw.results]);
 return Promise.reject(new Error('Unexpected test request '+url));
}))});
afterEach(()=>{cleanup();vi.unstubAllGlobals()});

describe('National map',()=>{
 it('renders all 50 states and marks exactly the canonical 35 Senate states as races',async()=>{
  const {container}=render(<SenateMap snapshot={snapshot} office="Senate" mode="polling" selected={null} onSelect={()=>{}}/>);
  await waitFor(()=>expect(container.querySelectorAll('path[data-state]')).toHaveLength(50));
  const races=[...container.querySelectorAll('path[data-race="true"]')].map(p=>p.getAttribute('data-state')).sort();
  expect(races).toEqual(SENATE);
  expect(container.querySelector('[data-state="HI"]')).toHaveAttribute('data-race','false');
  expect(container.querySelector('[data-state="AK"]')?.getAttribute('d')?.length).toBeGreaterThan(50);
 });
 it('supports state selection with keyboard and pointer, including county context in a no-race state',async()=>{
  const onSelect=vi.fn();render(<SenateMap snapshot={snapshot} office="Senate" mode="forecast" selected={null} onSelect={onSelect}/>);
  const georgia=await screen.findByTestId('state-GA');
  fireEvent.keyDown(georgia,{key:'Enter'});expect(onSelect).toHaveBeenLastCalledWith('GA');
  fireEvent.click(screen.getByTestId('state-HI'));expect(onSelect).toHaveBeenLastCalledWith('HI');
 });
 it('changes the legend and selected-state metric when the mode changes',async()=>{
  const ga=snapshot.races.find(r=>r.state==='GA'&&r.office==='Senate')!;
  const withSummary={...snapshot,summaries:[{race_id:ga.id,probability:.6,poll_margin:2,comparison_candidate_id:ga.candidates[0].id,provider:'polling_forecast',forecast_margin:1,rating:'Leans D',polls_used:5,as_of:'2026-11-02',availability:'available',licence:'CC BY 4.0',url:'https://www.pollingforecast.com/us/senate/ga'}]};
  const {rerender}=render(<SenateMap snapshot={withSummary} office="Senate" mode="forecast" selected="GA" onSelect={()=>{}}/>);
  await screen.findByTestId('state-GA');expect(screen.getByText('60.0%')).toBeInTheDocument();
  rerender(<SenateMap snapshot={withSummary} office="Senate" mode="difference" selected="GA" onSelect={()=>{}}/>);
  expect(screen.getByTestId('map-legend')).toHaveTextContent('Polymarket higher');
  expect(screen.getByTestId('map-legend')).toHaveTextContent('Kalshi higher');
  expect(screen.getAllByText('No usable data')).toHaveLength(2);
 });
 it('shows the 36 state governor races while keeping no-race states neutral',async()=>{
  const {container}=render(<SenateMap snapshot={snapshot} office="Governor" mode="polling" selected={null} onSelect={()=>{}}/>);
  await waitFor(()=>expect(container.querySelectorAll('path[data-state]')).toHaveLength(50));
  expect(container.querySelectorAll('path[data-race="true"]')).toHaveLength(36);
  expect(container.querySelector('[data-state="VA"]')).toHaveAttribute('data-race','false');
  expect(container.querySelector('[data-state="HI"]')).toHaveAttribute('data-race','true');
 });
});

describe('Live 2026 county explorer',()=>{
 it('renders actual North Carolina county counts and passes the selected report with its source intact',async()=>{
  const selected=vi.fn();const {container}=render(<CountyExplorer state="NC" stateName="North Carolina" fips="37" onCountyChange={selected}/>);
  await waitFor(()=>expect(container.querySelectorAll('path[data-county]')).toHaveLength(100));
  await waitFor(()=>expect(container.querySelectorAll('path[data-status="reporting"]')).toHaveLength(2));
  expect(screen.getByText('2026 county results')).toBeInTheDocument();
  expect(screen.queryByLabelText('County election year')).not.toBeInTheDocument();
  expect(screen.queryByRole('option',{name:'President'})).not.toBeInTheDocument();
  const county=container.querySelector('path[data-county="37001"]')!;
  fireEvent.keyDown(county,{key:'Enter'});
  await waitFor(()=>expect(selected).toHaveBeenLastCalledWith(expect.objectContaining({name:'Alamance',office:'Senate',rows:[expect.objectContaining({fips:'37001',year:2026,total:67849,reported:39,reporting_total:39,status:'reporting'})]})));
  const observation=selected.mock.calls.at(-1)![0] as CountySelection;
  expect(observation.rows[0].candidates.find(c=>c.name==='Roy Cooper')?.votes).toBe(38109);
  expect(observation.rows[0].source_url).toContain('er.ncsbe.gov');
  expect(screen.getByRole('link',{name:'North Carolina State Board of Elections'})).toHaveAttribute('href',expect.stringContaining('er.ncsbe.gov'));
  expect(vi.mocked(fetch).mock.calls.every(([url])=>!String(url).includes('data/counties/'))).toBe(true);
 });
 it('keeps genuinely zero California reports awaiting and never substitutes history in unsupported states',async()=>{
  const selected=vi.fn();const {container,rerender}=render(<CountyExplorer state="CA" stateName="California" fips="06" onCountyChange={selected}/>);
  await waitFor(()=>expect(container.querySelectorAll('path[data-status="awaiting"]')).toHaveLength(58));
  expect(screen.getByText('County feed connected. Awaiting reported votes.')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Governor'})).toHaveAttribute('aria-pressed','true');
  fireEvent.click(container.querySelector('path[data-county="06001"]')!);
  await waitFor(()=>expect(selected).toHaveBeenLastCalledWith(expect.objectContaining({name:'Alameda',rows:[expect.objectContaining({total:0,reported:0,reporting_total:627,status:'awaiting'})]})));
  const observation=selected.mock.calls.at(-1)![0] as CountySelection;
  const report=render(<CountyReport result={observation.rows[0]}/>);
  expect(screen.getByText('0 votes reported · 0 / 627 precincts')).toBeInTheDocument();
  expect(screen.getByText('The source has not reported counted votes for this county.')).toBeInTheDocument();
  expect(report.container.textContent).not.toContain('0.0%');report.unmount();
  rerender(<CountyExplorer state="ME" stateName="Maine" fips="23" onCountyChange={selected}/>);
  await waitFor(()=>expect(container.querySelectorAll('path[data-status="unavailable"]')).toHaveLength(16));
  expect(screen.getByText('No verified 2026 live county feed is connected for this state.')).toBeInTheDocument();
  expect(screen.queryByLabelText('County election year')).not.toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.every(([url])=>!String(url).includes('data/counties/'))).toBe(true);
 });
});
