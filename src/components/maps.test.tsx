import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SenateMap from './SenateMap';
import CountyExplorer from './CountyExplorer';
import type {Snapshot,CountyData} from '../types';
import races from '../../config/races.json';
import statesGeo from '../../public/geo/states.json';
import gaGeo from '../../public/geo/counties/GA.json';
import meGeo from '../../public/geo/counties/ME.json';
import gaData from '../../public/data/counties/GA.json';
import meData from '../../public/data/counties/ME.json';

const snapshot={schema_version:1,generated_at:'2026-11-04T00:00:00Z',races,summaries:[],contracts:[],quotes:[],polls:[],providers:{},context:{}} as Snapshot;
const SENATE=['AL','AK','AR','CO','DE','FL','GA','ID','IL','IA','KS','KY','LA','ME','MA','MI','MN','MS','MT','NE','NH','NJ','NM','NC','OH','OK','OR','RI','SC','SD','TN','TX','VA','WV','WY'].sort();
const response=(data:unknown)=>Promise.resolve({ok:true,json:async()=>data} as Response);
beforeEach(()=>{vi.stubGlobal('fetch',vi.fn((url:string)=>{
 if(url.includes('geo/states.json'))return response(statesGeo);
 if(url.includes('geo/counties/GA.json'))return response(gaGeo);
 if(url.includes('geo/counties/ME.json'))return response(meGeo);
 if(url.includes('data/counties/GA.json'))return response(gaData);
 if(url.includes('data/counties/ME.json'))return response(meData);
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

describe('County explorer',()=>{
 it('shows historical county returns and preserves office/year distinctions when switching',async()=>{
  render(<CountyExplorer state="GA" stateName="Georgia" fips="13"/>);
  expect(await screen.findByRole('heading',{name:'Georgia, county by county'})).toBeInTheDocument();
  expect(screen.getByText('Historical election returns. These are not live 2026 results or county forecasts.')).toBeInTheDocument();
  expect(screen.getByLabelText('County election office')).toHaveValue('President');
  expect(screen.getByLabelText('County election year')).toHaveValue('2024');
  const sample=(gaData as CountyData).rows.find(r=>r.office==='President'&&r.year===2024&&Boolean(r.county))!;
  fireEvent.change(screen.getByRole('textbox',{name:'Search counties'}),{target:{value:sample.county}});
  fireEvent.click(screen.getByRole('button',{name:sample.county}));
  expect(screen.getByText('FIPS '+sample.fips)).toBeInTheDocument();
  expect(screen.getByText('Democratic votes')).toBeInTheDocument();
  expect(screen.getAllByText(sample.dem_votes!.toLocaleString()).length).toBeGreaterThan(0);
  fireEvent.change(screen.getByLabelText('County election office'),{target:{value:'Senate'}});
  const latestSenate=Math.max(...(gaData as CountyData).rows.filter(r=>r.office==='Senate').map(r=>r.year));
  expect(screen.getByLabelText('County election year')).toHaveValue(String(latestSenate));
 });
 it('reloads county geography and data when navigating to another state',async()=>{
  const {rerender}=render(<CountyExplorer state="GA" stateName="Georgia" fips="13"/>);
  await screen.findByRole('heading',{name:'Georgia, county by county'});
  rerender(<CountyExplorer state="ME" stateName="Maine" fips="23"/>);
  await screen.findByRole('heading',{name:'Maine, county by county'});
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('data/counties/ME.json'),expect.any(Object));
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('geo/counties/ME.json'),expect.any(Object));
  expect(screen.getByLabelText('County election year')).toHaveValue('2024');
 });
});
