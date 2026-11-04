import {expect, test} from '@playwright/test';
import type {CongressData, ChamberData} from '../../src/lib/chambers';
import type {CountyLiveData} from '../../src/types/countyResults';
import type {ResultsData} from '../../src/lib/results';

const base = process.env.LIVE_TEST_URL || process.env.PLAYWRIGHT_BASE_URL;
const percent = (v: number | null | undefined) => v == null ? 'Unavailable' : `${(v * 100).toFixed(1)}%`;

test('public Congress charts and Michigan estimated vote in', async ({page}, info) => {
 test.skip(!base, 'Set LIVE_TEST_URL to the deployed site.');
 test.setTimeout(150000);
 const houseResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/national/House', {timeout:60000});
 await page.goto(`${base}/#view=congress`, {waitUntil:'domcontentloaded'});
 const response = await houseResponse; expect(response.status()).toBe(200);
 const rawHouse = await response.json() as {races: {nyt_id: string; top_reporting_unit?: {eevp?: number | null}}[]};
 await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('election-atlas-congress-v1') || 'null')?.house?.fetched_at), {timeout:60000}).not.toBeNull();
 const data = await page.evaluate(() => JSON.parse(localStorage.getItem('election-atlas-congress-v1')!) as CongressData);
 expect(data.errors).toEqual([]);
 const rawSeat = data.house!.seats.find(s => s.estimated_vote_in != null);
 if (rawSeat) { const raw = rawHouse.races.find(r => r.nyt_id === rawSeat.id); expect(raw?.top_reporting_unit?.eevp).toBeCloseTo(rawSeat.estimated_vote_in! * 100); }
 expect(Date.now() - Date.parse(data.fetched_at)).toBeLessThan(120000);
 expect(data.senate?.continuing.reduce((n,c) => n+c.count,0)).toBe(65);
 await expect(page.locator('.focus-view-switch button')).toHaveCount(4);
 for (const button of await page.locator('.focus-view-switch button').all()) await expect(button).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 for (const chamber of [data.senate!,data.house!] as ChamberData[]) {
  const card = page.locator('.congress-card').filter({has:page.getByRole('heading',{name:chamber.office,exact:true})});
  const called = chamber.seats.filter(s=>s.called), continuing = chamber.continuing.reduce((n,c)=>n+c.count,0), remaining = chamber.total-continuing-called.length;
  await expect(card.locator('circle')).toHaveCount(chamber.total);
  await expect(card.locator('.congress-counts strong')).toHaveText([String(continuing),String(called.length),String(remaining),String(chamber.total)]);
  const counts = await card.locator('.congress-party-counts strong').allTextContents();
  expect(counts.reduce((n,c)=>n+Number(c),0)).toBe(chamber.total);
  const flips = called.filter(s=>s.flip);
  await expect(card.locator('circle.is-flip')).toHaveCount(flips.length);
  await expect(card.locator('.congress-flips li')).toHaveCount(flips.length);
  for(const flip of flips) await expect(card.locator('.congress-flips')).toContainText(flip.winner_name || 'Winner unavailable');
  if (flips[0]) { await card.getByLabel(`Inspect ${chamber.office} seat`).selectOption(flips[0].id); await expect(card.locator('.congress-selection')).toContainText(flips[0].winner_name || 'Winner unavailable'); }
  const first = called[0];
  if(first){const dot=card.locator('circle.called').filter({has:page.locator('title',{hasText:first.label+':'})}).first();await dot.focus();await page.keyboard.press('Enter');await expect(card.locator('.congress-selection')).toContainText(first.winner_name || 'Winner unavailable');await expect(card.locator('.congress-selection a')).toHaveAttribute('href',first.source_url);if(first.estimated_vote_in!=null)await expect(card.locator('.congress-selection')).toContainText(percent(first.estimated_vote_in));}
  await expect(card.locator('.congress-source')).toContainText('Source as of');
 }
 await page.screenshot({path:`artifacts/congress-final-proof/congress-${info.project.name}.png`,fullPage:true,animations:'disabled'});
 const before = data.fetched_at;
 await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('election-atlas-congress-v1') || 'null')?.fetched_at),{timeout:50000}).not.toBe(before);
 await page.getByRole('button',{name:'Election results',exact:true}).click();
 await page.getByLabel('Go to state').selectOption('MI');
 await expect(page.locator('path[data-county]')).toHaveCount(83);
 await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('county-live-2026-MI') || 'null')?.fetched_at),{timeout:60000}).toBeTruthy();
 await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('election-atlas-results-v1') || 'null')?.fetched_at),{timeout:60000}).toBeTruthy();
 const county = await page.evaluate(() => JSON.parse(localStorage.getItem('county-live-2026-MI')!) as CountyLiveData);
 const results = await page.evaluate(() => JSON.parse(localStorage.getItem('election-atlas-results-v1')!) as ResultsData);
 const fips = county.rows[0].fips;
 await page.locator(`path[data-county="${fips}"]`).focus();await page.keyboard.press('Enter');
 const brief=page.getByRole('region',{name:'Selected county information'});
 for(const row of county.rows.filter(r=>r.fips===fips)){
  const report=brief.locator('.county-current-report').filter({has:page.locator('.county-report-title strong',{hasText:row.office==='Senate'?'US Senate':'Governor'})});
  await expect(report.locator('.estimated-vote-in')).toContainText(percent(row.estimated_vote_in));
 }
 for(const office of ['Senate','Governor'] as const){const national=results.races.find(r=>r.state==='MI'&&r.office===office), local=county.statewide?.find(r=>r.office===office);const result=local && (!national || Date.parse(local.as_of || '') >= Date.parse(national.as_of || '')) ? local : national;if(result)await expect(page.getByTestId(`reported-result-${office}`).locator('.estimated-vote-in')).toContainText(percent(result.estimated_vote_in));}
});
