import {describe,it,expect} from 'vitest';
import type {FeatureCollection,Geometry} from 'geojson';
import type {Race} from '../types';
import manifest from '../../config/races.json';
import fixture from '../../tests/fixtures/national-counties.json';
import mi from '../../public/geo/counties/MI.json';
import ny from '../../public/geo/counties/NY.json';
import ma from '../../public/geo/counties/MA.json';
import {normalizeNationalCounties,normalizeNationalResults} from './countyNational';
const races=manifest as Race[],fetched='2026-11-04T05:00:00Z';
const geometry=(g:unknown)=>g as FeatureCollection<Geometry>;
describe('nationwide published actual vote counts',()=>{
 it('maps Michigan candidate votes by exact county FIPS and keeps offices separate',()=>{
  const data=normalizeNationalCounties(fixture.michigan,'MI',geometry(mi),fetched,races);
  const oakland=data.rows.filter(r=>r.fips==='26125');expect(oakland).toHaveLength(2);
  expect(oakland.find(r=>r.office==='Senate')?.candidates[0]).toMatchObject({name:'Abdul El-Sayed',party:'D',votes:256025});
  expect(oakland.find(r=>r.office==='Governor')?.candidates[0]).toMatchObject({name:'Jocelyn Benson',party:'D',votes:269701});
  expect(data.status).toBe('partial');expect(data.fetched_at).toBe(fetched);
 });
 it('maps New York borough labels by FIPS instead of fuzzy county names',()=>{
  const data=normalizeNationalCounties(fixture.new_york,'NY',geometry(ny),fetched,races);
  expect(data.rows.map(r=>r.county)).toEqual(expect.arrayContaining(['Kings','New York','Queens']));expect(data.rows.every(r=>r.office==='Governor')).toBe(true);
 });
 it('retains the publisher statewide total separately when regional records do not reconcile',()=>{
  const data=normalizeNationalCounties(fixture.michigan,'MI',geometry(mi),fetched,races);
  const statewide=data.statewide!.find(r=>r.office==='Senate')!;
  expect(data.status).toBe('partial');expect(statewide.total).toBe(fixture.michigan.races[0].top_reporting_unit.total_votes);
  expect(statewide.total).not.toBe(data.rows.filter(r=>r.office==='Senate').reduce((sum,r)=>sum+(r.total??0),0));
  expect(statewide.source_url).toBe(fixture.michigan.races[0].url);
 });
 it('sums distinct Massachusetts towns with publisher county FIPS exactly once',()=>{
  const data=normalizeNationalCounties(fixture.massachusetts,'MA',geometry(ma),fetched,races);
  expect(data.rows).toHaveLength(1);expect(data.rows[0].fips).toBe('25025');
  expect(data.rows[0].total).toBe(fixture.massachusetts.races[0].reporting_units.reduce((s,u)=>s+(u.total_votes??0),0));
  expect(data.message).toContain('distinct towns');
 });
 it('uses actual totals even when model estimates are enormous',()=>{
  const raw=structuredClone(fixture.michigan);Object.assign(raw.races[0].reporting_units[0],{total_expected_vote:999999999,nyt_model_estimates:{votes_estimated:999999999}});
  expect(normalizeNationalCounties(raw,'MI',geometry(mi),fetched,races).rows).toEqual(normalizeNationalCounties(fixture.michigan,'MI',geometry(mi),fetched,races).rows);
 });
 it('accepts Florida special-general data and rejects primaries or wrong years',()=>{
  expect(normalizeNationalResults(fixture.florida_special,'Senate',races)[0].race_id).toBe(races.find(r=>r.state==='FL'&&r.office==='Senate')!.id);
  const raw=structuredClone(fixture.florida_special);raw.races[0].type='Primary';expect(normalizeNationalResults(raw,'Senate',races)).toEqual([]);
  raw.races[0].type='Special General';raw.races[0].election_date='2024-11-05';expect(normalizeNationalResults(raw,'Senate',races)).toEqual([]);
 });
 it('rejects duplicate units, absent counts and incompatible state identities',()=>{
  const raw=structuredClone(fixture.michigan);raw.races[0].reporting_units.push(raw.races[0].reporting_units[0]);expect(()=>normalizeNationalCounties(raw,'MI',geometry(mi),fetched,races)).toThrow('Duplicate');
  const wrong=structuredClone(fixture.michigan);wrong.races[0].reporting_units[0].state_postal='TX';expect(()=>normalizeNationalCounties(wrong,'MI',geometry(mi),fetched,races)).toThrow('different state');
  const missing=structuredClone(fixture.michigan);Object.assign(missing.races[0].reporting_units[0].candidates[0].votes,{total:null});expect(()=>normalizeNationalCounties(missing,'MI',geometry(mi),fetched,races)).toThrow('actual candidate');
 });
 it('keeps genuine zero totals awaiting with null candidate shares',()=>{
  const raw=structuredClone(fixture.michigan);for(const r of raw.races)for(const u of r.reporting_units){u.total_votes=0;for(const c of u.candidates)c.votes.total=0}
  const data=normalizeNationalCounties(raw,'MI',geometry(mi),fetched,races);expect(data.rows.every(r=>r.status==='awaiting'&&r.candidates.every(c=>c.share===null))).toBe(true);
 });
 it('keeps source estimated vote-in separate from candidate share and precinct reporting',()=>{
  const data=normalizeNationalCounties(fixture.michigan,'MI',geometry(mi),fetched,races);const county=data.rows[0];
  expect(county.estimated_vote_in).toBe(fixture.michigan.races[0].reporting_units[0].eevp!/100);
  expect(county.estimated_vote_in).not.toBe(county.reported!/county.reporting_total!);
  expect(data.statewide![0].estimated_vote_in).toBe(fixture.michigan.races[0].top_reporting_unit.eevp!/100);
 });
 it('rolls up published town estimates with source expected-vote weights and labels the method',()=>{
  const source=fixture.massachusetts.races[0].reporting_units;
  const expected=source.reduce((sum,u)=>sum+u.eevp!*u.total_expected_vote!,0)/source.reduce((sum,u)=>sum+u.total_expected_vote!,0)/100;
  const data=normalizeNationalCounties(fixture.massachusetts,'MA',geometry(ma),fetched,races);
  expect(data.rows[0].estimated_vote_in).toBeCloseTo(expected,10);expect(data.rows[0].estimated_vote_in_method).toBe('weighted_town_estimates');
 });
 it('retains unavailable estimates as null and rejects out-of-range source percentages',()=>{
  const raw=structuredClone(fixture.michigan);Object.assign(raw.races[0].reporting_units[0],{eevp:null});
  expect(normalizeNationalCounties(raw,'MI',geometry(mi),fetched,races).rows[0].estimated_vote_in).toBeNull();
  raw.races[0].reporting_units[0].eevp=101;expect(()=>normalizeNationalCounties(raw,'MI',geometry(mi),fetched,races)).toThrow('estimated vote-in');
 });
});
