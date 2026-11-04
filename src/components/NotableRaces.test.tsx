import {describe,expect,it} from 'vitest';
import {render,screen,within} from '@testing-library/react';
import NotableRaces from './NotableRaces';
import type {NotableRace} from './NotableRaces';

const la:NotableRace={id:'la',title:'Los Angeles mayoral general election',location:'Los Angeles, California',electionDate:'2026-11-03',markets:[{provider:'Kalshi',url:'https://kalshi.com/markets/kxmayorla/election/kxmayorla-26',volumeContracts:61560000,status:'active',outcomes:[{name:'Karen Bass',price:.05},{name:'Nithya Raman',price:.95}]}],news:[]};
describe('notable races',()=>{
 it('links to the market and labels the highest last-traded price, without presenting it as a result',()=>{
  render(<NotableRaces races={[la]} updatedAt="2026-11-04T06:00:00Z" methodology="Ranked by Kalshi contracts traded."/>);
  const row=screen.getByRole('article');
  expect(within(row).getByRole('heading',{name:'Los Angeles mayoral general election'})).toBeInTheDocument();
  expect(within(row).getByRole('link',{name:/Kalshi/})).toHaveAttribute('href',la.markets[0].url);
  expect(within(row).getByText(/Nithya Raman:/)).toHaveTextContent('95¢ last trade');
  expect(within(row).queryByText(/Karen Bass:/)).not.toBeInTheDocument();
  expect(screen.getByText(/Ranked by Kalshi contracts traded/)).toBeInTheDocument();
  expect(within(row).getByText('No polling available')).toBeInTheDocument();
 });
 it('shows sourced individual poll results separately from market prices',()=>{
  const poll={pollster:'Example Research',sponsor:null,fieldStart:'2026-10-20',fieldEnd:'2026-10-22',sampleSize:800,population:'likely voters',source:'Example News',url:'https://example.com/poll',collection:{name:'The Basin',url:'https://basin.la/interactives/polls-la-mayor-2026.html'},outcomes:[{name:'Candidate A',percent:45},{name:'Candidate B',percent:40}]};
  render(<NotableRaces races={[{...la,polls:[poll]}]}/>);
  expect(screen.getByRole('link',{name:/Original source: Example News/})).toHaveAttribute('href',poll.url);
  expect(screen.getByRole('link',{name:'The Basin'})).toHaveAttribute('href','https://basin.la/interactives/polls-la-mayor-2026.html');
  expect(screen.getByText(/Oct 20, 2026.*Oct 22, 2026.*800 likely voters/)).toBeInTheDocument();
  expect(screen.getByText('Candidate A 45% · Candidate B 40%')).toBeInTheDocument();
  expect(screen.getByText(/individual polls, not a forecast/)).toBeInTheDocument();
 });
 it('does not attribute a House poll to The Basin',()=>{
  const poll={pollster:'Example Research',sponsor:null,fieldStart:'2026-10-20',fieldEnd:'2026-10-22',sampleSize:800,population:'likely voters',source:'Example News',url:'https://example.com/house-poll',outcomes:[{name:'Candidate A',percent:45}]};
  render(<NotableRaces races={[{...la,id:'house',title:'House race',polls:[poll]}]}/>);
  expect(screen.getByRole('link',{name:/Original source: Example News/})).toHaveAttribute('href',poll.url);
  expect(screen.queryByRole('link',{name:'The Basin'})).not.toBeInTheDocument();
 });
 it('shows only explicitly sourced race calls and uncalled status',()=>{
  const {rerender}=render(<NotableRaces races={[{...la,result:{status:'called',winner:'Candidate A',party:'Independent',calledBy:'Example News',sourceUrl:'https://example.com/results'}}]}/>);
  expect(screen.getByRole('link',{name:/Called: Candidate A \(Independent\).*Example News/})).toHaveAttribute('href','https://example.com/results');
  rerender(<NotableRaces races={[{...la,result:{status:'uncalled',sourceUrl:'https://example.com/results'}}]}/>);
  expect(screen.getByRole('link',{name:'Not called'})).toHaveAttribute('href','https://example.com/results');
  rerender(<NotableRaces races={[la]}/>);
  expect(screen.queryByText(/not called/i)).not.toBeInTheDocument();
 });
 it('caps the display at five and reports missing feeds gracefully',()=>{
  const {rerender}=render(<NotableRaces races={Array.from({length:6},(_,i)=>({...la,id:String(i),title:`Race ${i}`}))}/>);
  expect(screen.getAllByRole('article')).toHaveLength(5);
  rerender(<NotableRaces races={[]} error="source failed"/>);
  expect(screen.getByRole('status')).toHaveTextContent(/temporarily unavailable/i);
 });
});
