import {render,screen} from '@testing-library/react';
import {describe,expect,it} from 'vitest';
import fixture from '../../tests/fixtures/frontend.json';
import type {Snapshot} from '../types';
import {OddsHistoryChart,PollingChart} from './Charts';
const snapshot=fixture as unknown as Snapshot;
const race=snapshot.races.find(r=>r.state==='NE')!;
describe('observation charts',()=>{
 it('explains that unavailable market history has no invented trend',()=>{
  render(<OddsHistoryChart snapshot={snapshot} race={race} history={{}}/>);
  expect(screen.getByText('No observed prices in this range')).toBeVisible();
  expect(screen.getByText(/History starts when a usable quote is collected/)).toBeVisible();
  expect(document.querySelector('svg')).toBeNull();
 });
 it('treats a null poll margin as missing rather than a zero-margin observation',()=>{
  const poll={...snapshot.polls.find(p=>p.race_id===race.id)!,margin:null};
  render(<PollingChart race={race} polls={[poll]}/>);
  expect(screen.getByText('No dated polling observations with a reported margin are available.')).toBeVisible();
  expect(document.querySelector('svg')).toBeNull();
 });
});
