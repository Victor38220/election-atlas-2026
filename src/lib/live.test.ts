import {describe,it,expect} from 'vitest';
import {nextBoundary,numeric,probability,validMidpoint,appendHistory} from './live';
import type {Quote} from '../types';
describe('live refresh and quote guards',()=>{
 it('aligns to both boundaries without timer drift',()=>{expect(nextBoundary(60000)).toBe(90000);expect(nextBoundary(89999)).toBe(90000);expect(nextBoundary(90000)).toBe(120000)});
 it('preserves missing prices and true zero values',()=>{expect(numeric(null)).toBeNull();expect(probability('0')).toBe(0);expect(probability('1.1')).toBeNull();expect(numeric('NaN')).toBeNull()});
 it('rejects closed, empty, crossed, boundary and wide books',()=>{expect(validMidpoint(.4,.5,'active',100)).toBe(.45);for(const args of [[0,1,'active',100],[.4,.5,'closed',100],[.4,.5,'active',0],[.5,.4,'active',100],[.1,.8,'active',100]] as const)expect(validMidpoint(args[0],args[1],args[2],args[3])).toBeNull()});
 it('retains actually observed history and replaces only its five-minute bucket',()=>{const quote={contract_id:'k',price:.6,fetched_at:'2026-11-04T02:30:10Z',pricing_method:'midpoint'} as Quote;const h=appendHistory({k:[{t:'2026-11-04T02:30:00Z',p:.5,method:'midpoint'}]},[quote],Date.parse('2026-11-04T02:30:10Z'));expect(h.k).toHaveLength(1);expect(h.k[0].p).toBe(.6)});
});

import {normalizeMarket} from './live';
import fixtures from '../../tests/fixtures/live-quote-responses.json';
import type {Contract,Race} from '../types';
describe('recorded quote identity validation',()=>{
 const races=fixtures.races as Race[];const fetched='2026-11-04T02:40:00Z';
 it('normalizes the recorded Maine Kalshi YES bid/ask in dollars',()=>{const result=normalizeMarket(fixtures.kalshi.raw,fixtures.kalshi.contract as Contract,races,fetched);expect(result.quote.bid).toBe(.86);expect(result.quote.ask).toBe(.87);expect(result.quote.price).toBe(.865);expect(result.quote.source_timestamp).toBeNull()});
 it('never promotes a finalized book or last trade to live odds',()=>{const raw={...fixtures.kalshi.raw,status:'finalized'};const result=normalizeMarket(raw,fixtures.kalshi.contract as Contract,races,fetched);expect(result.quote.price).toBeNull();expect(result.quote.last_trade).not.toBeNull()});
 it('normalizes the recorded Georgia Polymarket contract as a separate YES contract',()=>{const result=normalizeMarket(fixtures.polymarket.raw,fixtures.polymarket.contract as Contract,races,fetched);expect(result.contract.outcome_type).toBe('party');expect(result.contract.outcome).toBe('D');expect(result.quote.price).toBeNull();expect(result.contract.comparison_group).toBeNull()});
 it('rejects changes to the source question or settlement rules',()=>{for(const raw of [{...fixtures.kalshi.raw,title:'2028 Maine Senate primary winner?'},{...fixtures.kalshi.raw,rules_primary:'If the candidate wins the primary.'}])expect(()=>normalizeMarket(raw,fixtures.kalshi.contract as Contract,races,fetched)).toThrow('mapping needs review')});
});
