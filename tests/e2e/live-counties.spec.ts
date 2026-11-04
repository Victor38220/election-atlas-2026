import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import type {CountyLiveData} from '../../src/types/countyResults';

test('reads all eight current county feeds and keeps Texas leader prices tied to current counts',async({page},testInfo)=>{
 test.skip(!process.env.LIVE_TEST_URL,'Set LIVE_TEST_URL to verify the deployed live county adapters.');
 test.setTimeout(90000);
 const historicalRequests:string[]=[];const errors:string[]=[];
 page.on('request',r=>{if(/\/data\/counties\/|\/api\/polling\/counties/.test(r.url()))historicalRequests.push(r.url())});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.LIVE_TEST_URL!+'/#state=NC',{waitUntil:'domcontentloaded'});
 await expect(page.locator('path[data-county]')).toHaveCount(100);
 const fresh=async(state:string)=>{
  await expect.poll(async()=>page.evaluate(state=>{const data=JSON.parse(localStorage.getItem('county-live-2026-'+state)??'null');return data?.fetched_at?Date.now()-Date.parse(data.fetched_at):Infinity},state),{timeout:45000}).toBeLessThan(120000);
  return await page.evaluate(state=>JSON.parse(localStorage.getItem('county-live-2026-'+state)!),state) as CountyLiveData;
 };
 const nc=await fresh('NC');expect(nc.year).toBe(2026);expect(nc.rows).toHaveLength(100);
 const alamance=nc.rows.find(r=>r.fips==='37001'&&r.office==='Senate')!;expect(alamance.total).toBeGreaterThan(0);
 expect(alamance.source_url).toContain('er.ncsbe.gov');
 await page.locator('path[data-county="37001"]').focus();await page.keyboard.press('Enter');
 const brief=page.getByRole('region',{name:'Selected county information'});
 await expect(brief).toContainText(alamance.total!.toLocaleString()+' votes reported');
 await expect(brief).toContainText('North Carolina State Board of Elections');
 await expect(page.getByLabel('County election year')).toHaveCount(0);
 await mkdir('artifacts',{recursive:true});await brief.scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/live-county-NC-${testInfo.project.name}.png`,fullPage:false,animations:'disabled'});
 await page.getByLabel('Go to state').selectOption('GA');await expect(page.locator('path[data-county]')).toHaveCount(159);
 const ga=await fresh('GA');expect(ga.year).toBe(2026);expect(ga.rows).toHaveLength(318);
 expect(ga.rows.some(r=>r.office==='Senate')).toBe(true);expect(ga.rows.some(r=>r.office==='Governor')).toBe(true);
 const appling=ga.rows.filter(r=>r.fips==='13001');expect(appling).toHaveLength(2);expect(appling.every(r=>(r.total??0)>0)).toBe(true);
 await page.locator('path[data-county="13001"]').focus();await page.keyboard.press('Enter');
 await expect(brief.locator('.county-current-report')).toHaveCount(2);
 for(const race of appling)await expect(brief).toContainText(race.total!.toLocaleString()+' votes reported');
 await expect(brief).toContainText('Georgia Secretary of State');
 await brief.scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/live-county-GA-${testInfo.project.name}.png`,fullPage:false,animations:'disabled'});
 await page.getByLabel('Go to state').selectOption('CA');await expect(page.locator('path[data-county]')).toHaveCount(58);
 const ca=await fresh('CA');expect(ca.year).toBe(2026);expect(ca.rows).toHaveLength(58);
 const alameda=ca.rows.find(r=>r.fips==='06001')!;
 await page.locator('path[data-county="06001"]').focus();await page.keyboard.press('Enter');
 await expect(brief).toContainText('California Secretary of State');
 await expect(brief).toContainText(alameda.total!.toLocaleString()+' votes reported');
 if(alameda.total===0){await expect(brief).toContainText('Awaiting reported votes');await expect(brief).not.toContainText('0.0%')}
 await expect(brief).not.toContainText('Invalid Date');
 for(const [state,count] of [['VA',133],['OH',88],['AZ',15],['MN',87],['CO',64]] as const){
  await page.getByLabel('Go to state').selectOption(state);await expect(page.locator('path[data-county]')).toHaveCount(count);
  const data=await fresh(state);expect(data.year).toBe(2026);expect(data.rows.length).toBeGreaterThan(0);
  expect(data.rows.every(row=>row.year===2026&&row.state===state)).toBe(true);
  const office=state==='AZ'?'Governor':'Senate';const row=data.rows.find(r=>r.office===office&&(r.total??0)>0)??data.rows.find(r=>r.office===office)!;
  await page.locator(`path[data-county="${row.fips}"]`).focus();await page.keyboard.press('Enter');
  await expect(brief).toContainText(row.county);await expect(brief).toContainText(row.source_name);
  if(row.total!==null)await expect(brief).toContainText(row.total.toLocaleString()+' votes reported');
  expect(data.source_url).toMatch(/^https:/);
 }
 await page.getByLabel('Go to state').selectOption('TX');await expect(page.locator('path[data-county]')).toHaveCount(254);
 const texas=page.getByTestId('race-summary-Governor');await expect(texas.getByRole('heading',{name:'Gina Hinojosa',exact:true})).toBeVisible();
 await expect(texas.getByRole('heading',{name:'Greg Abbott',exact:true})).toHaveCount(0);
 await expect(texas.locator('.leader-share strong')).toHaveText(/\d+\.\d%/);await expect(texas).toContainText('of reported votes');
 const snapshot=await page.evaluate(()=>JSON.parse(localStorage.getItem('election-atlas-v1')!)) as import('../../src/types').Snapshot;
 const race=snapshot.races.find(r=>r.state==='TX'&&r.office==='Governor')!;const candidate=race.candidates.find(c=>c.name==='Gina Hinojosa')!;
 for(const provider of ['kalshi','polymarket']){
  const cell=texas.locator(`[data-provider="${provider}"]`);const contracts=snapshot.contracts.filter(c=>c.race_id===race.id&&c.candidate_id===candidate.id&&c.provider===provider);
  const title=await cell.locator('a').getAttribute('title');expect(contracts.some(c=>title?.includes(c.question))).toBe(true);
 }
 await texas.scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/live-Texas-leader-${testInfo.project.name}.png`,fullPage:false,animations:'disabled'});
 await page.getByLabel('Go to state').selectOption('ME');await expect(page.locator('path[data-status="unavailable"]')).toHaveCount(16);
 await expect(page.locator('.county-live-status')).toContainText('No verified 2026 live county feed');
 expect(historicalRequests).toEqual([]);expect(errors).toEqual([]);
});
