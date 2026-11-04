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
 });
 it('caps the display at five and reports missing feeds gracefully',()=>{
  const {rerender}=render(<NotableRaces races={Array.from({length:6},(_,i)=>({...la,id:String(i),title:`Race ${i}`}))}/>);
  expect(screen.getAllByRole('article')).toHaveLength(5);
  rerender(<NotableRaces races={[]} error="source failed"/>);
  expect(screen.getByRole('status')).toHaveTextContent(/temporarily unavailable/i);
 });
});
