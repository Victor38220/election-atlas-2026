import {fireEvent,render,screen,within} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import fixture from '../../tests/fixtures/frontend.json';
import type {Snapshot} from '../types';
import {RaceDetails} from './RaceDetails';

vi.mock('./Charts',()=>({
  OddsHistoryChart:()=> <div>Observed market price history</div>,
  PollingChart:()=> <div>Individual poll margin observations</div>,
  contractLabel:(c:{outcome_type:string;outcome:string})=>`${c.outcome} ${c.outcome_type} YES`,
}));
const recorded=fixture as unknown as Snapshot;
function show(state:string,snapshot=recorded) {
 const race=snapshot.races.find(r=>r.state===state)!;
 const close=vi.fn();render(<RaceDetails snapshot={snapshot} race={race} history={{}} onClose={close}/>);
 return {race,close};
}

describe('race details with recorded real provider observations',()=>{
 it('identifies the Florida special election, candidates and incumbent',()=>{
  const {close}=show('FL');
  expect(screen.getByText(/2026 special election/)).toBeVisible();
  expect(screen.getByText('Angie Nixon')).toBeVisible();
  expect(screen.getByText('Ashley Moody')).toBeVisible();
  expect(screen.getByText(/Incumbent: Ashley Moody/)).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'Close race details'}));
  expect(close).toHaveBeenCalledOnce();
 });
 it('keeps independent Nebraska candidate separate from Democrats',()=>{
  show('NE');
  const candidate=screen.getByText('Dan Osborn').closest('.candidate')!;
  expect(within(candidate as HTMLElement).getByText('Independent')).toBeVisible();
  expect(within(candidate as HTMLElement).queryByText('Democratic')).toBeNull();
  expect(candidate).toHaveClass('candidate-i');
 });
 it('distinguishes raw polling average, modeled margin and model probability',()=>{
  show('ME');
  expect(screen.getByText('Reported poll average')).toBeVisible();
  expect(screen.getByText('Model forecast margin')).toBeVisible();
  expect(screen.getByText('Model win probability')).toBeVisible();
  expect(screen.getByText('Forecast, not vote share')).toBeVisible();
  expect(screen.getByText(/No compatible pair has been approved/)).toBeVisible();
  expect(screen.getByText(/Kalshi − Polymarket · equivalent outcome/).nextElementSibling).toHaveTextContent('—');
 });
 it('shows missing values as unavailable, never zero percent',()=>{
  const snapshot=structuredClone(recorded);
  const race=snapshot.races.find(r=>r.state==='ME')!;
  snapshot.summaries=snapshot.summaries.map(s=>s.race_id===race.id?{...s,poll_margin:null,forecast_margin:null,probability:null}:s);
  snapshot.quotes=snapshot.quotes.map(q=>q.race_id===race.id?{...q,price:null,bid:null,ask:null,last_trade:null}:q);
  show('ME',snapshot);
  const metrics=document.querySelector('.detail-metrics')!;
  expect(within(metrics as HTMLElement).getAllByText('—')).toHaveLength(3);
  expect(within(metrics as HTMLElement).queryByText('0.0%')).toBeNull();
  expect(screen.getAllByText('YES midpoint').every(el=>el.parentElement?.textContent?.startsWith('—'))).toBe(true);
 });
 it('opens individual polls with release links, fieldwork, sample and licensing',()=>{
  const {race}=show('ME');
  fireEvent.click(screen.getByRole('tab',{name:/Individual polls/}));
  const poll=recorded.polls.find(p=>p.race_id===race.id)!;
  expect(screen.getByText(poll.pollster)).toBeVisible();
  expect(screen.getByText(new RegExp(`n=${poll.sample!.toLocaleString()}`))).toBeVisible();
  expect(screen.getByRole('link',{name:/Original release/})).toHaveAttribute('href',poll.url);
  fireEvent.click(screen.getByText('Source and methodology'));
  expect(screen.getByText(`Licence: ${poll.licence}`)).toBeVisible();
  fireEvent.change(screen.getByRole('textbox',{name:'Search individual polls'}),{target:{value:'nonexistent-pollster'}});
  expect(screen.getByText('No polls match this search.')).toBeVisible();
 });
 it('shows unavailable market coverage without inventing contract outcomes',()=>{
  const snapshot=structuredClone(recorded);snapshot.contracts=[];snapshot.quotes=[];
  show('NE',snapshot);
  expect(screen.getByText('No verified market contract is available for these candidates.')).toBeVisible();
  expect(document.querySelectorAll('.market-card')).toHaveLength(0);
 });
 it('does not infer a race call from closed market status',()=>{
  const snapshot=structuredClone(recorded);
  snapshot.contracts=snapshot.contracts.map(c=>({...c,status:'closed'}));
  snapshot.quotes=snapshot.quotes.map(q=>({...q,price:null,last_trade:1}));
  show('ME',snapshot);
  expect(screen.getAllByText('closed').length).toBeGreaterThan(0);
  expect(screen.getByText(/No race calls are inferred/)).toBeVisible();
  expect(screen.queryByText(/elected winner/i)).toBeNull();
 });
});
