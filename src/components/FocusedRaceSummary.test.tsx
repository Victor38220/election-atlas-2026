import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import FocusedRaceSummary from './FocusedRaceSummary';
import snapshotJSON from '../../public/data/latest.json';
import recorded from '../../tests/fixtures/openamerica-results.json';
import {normalizeResults} from '../lib/results';
import type {Snapshot} from '../types';
const snapshot=snapshotJSON as Snapshot;
const race=snapshot.races.find(r=>r.state==='TX'&&r.office==='Governor')!;
const result=normalizeResults(recorded.Governor,'Governor').find(r=>r.state==='TX')!;
afterEach(cleanup);
describe('reported leader cards',()=>{
 it('shows the real Texas Democratic leader and reported share even though the older model favored Abbott',()=>{
  const model=snapshot.summaries.find(s=>s.race_id===race.id)!;expect(model.probability).toBeLessThan(.5);
  const leader=[...result.candidates].sort((a,b)=>b.votes-a.votes)[0];expect(leader.name).toBe('Gina Hinojosa');expect(leader.party).toBe('D');
  const {container}=render(<FocusedRaceSummary snapshot={snapshot} race={race} result={result} onDetails={vi.fn()}/>);
  expect(screen.getByRole('heading',{name:'Gina Hinojosa'})).toBeInTheDocument();
  expect(screen.queryByRole('heading',{name:'Greg Abbott'})).not.toBeInTheDocument();
  expect(container.querySelector('.leader-share strong')).toHaveTextContent((leader.share!*100).toFixed(1)+'%');
  expect(screen.getByText('of reported votes')).toBeInTheDocument();
  expect(container.querySelector('.favorite-caption')).toHaveTextContent('Leading · Unofficial');
  expect(screen.getByText('Pre-election polling margin')).toBeInTheDocument();
  for(const provider of ['kalshi','polymarket']){
   const contracts=snapshot.contracts.filter(c=>c.race_id===race.id&&c.provider===provider&&c.candidate_id===race.candidates[0].id);
   const link=container.querySelector(`[data-provider="${provider}"] a`)!;
   expect(contracts.some(c=>link.getAttribute('title')?.includes(c.question))).toBe(true);
   const shown=link.querySelector('strong')!.textContent;
   const prices=snapshot.quotes.filter(q=>contracts.some(c=>c.id===q.contract_id)&&q.price!==null).map(q=>(q.price!*100).toFixed(1)+'%');
   expect(prices.length?prices:['—']).toContain(shown);
  }
 });
 it('does not substitute a model favorite when reported counts are unavailable, tied or zero',()=>{
  const tie={...result,total:2,candidates:result.candidates.slice(0,2).map(c=>({...c,votes:1,share:.5}))};
  for(const observed of [undefined,{...result,total:0},tie]){
   const {container,unmount}=render(<FocusedRaceSummary snapshot={snapshot} race={race} result={observed} onDetails={vi.fn()}/>);
   expect(screen.getByRole('heading',{name:'No reported leader'})).toBeInTheDocument();
   expect(container.querySelector('.leader-share')).not.toBeInTheDocument();
   expect([...container.querySelectorAll('.focused-market strong')].map(n=>n.textContent)).toEqual(['—','—']);unmount();
  }
 });
 it('does not assign a named candidate contract just because an unmatched reported leader has the same party',()=>{
  const changed={...result,candidates:result.candidates.map(c=>c.name==='Gina Hinojosa'?{...c,name:'Unmatched source candidate'}:c)};
  const {container}=render(<FocusedRaceSummary snapshot={snapshot} race={race} result={changed} onDetails={vi.fn()}/>);
  expect(screen.getByRole('heading',{name:'Unmatched source candidate'})).toBeInTheDocument();
  expect([...container.querySelectorAll('.focused-market strong')].map(n=>n.textContent)).toEqual(['—','—']);
 });
});
