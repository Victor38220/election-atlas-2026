import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

test('Colorado official ZIP normalizes to fresh 2026 county results in the deployed browser',async({page})=>{
 test.skip(!process.env.LIVE_TEST_URL,'Set LIVE_TEST_URL for live proof.');test.setTimeout(60000);
 await page.goto(process.env.LIVE_TEST_URL!+'/#state=CO');await expect(page.locator('path[data-county]')).toHaveCount(64);
 await expect.poll(async()=>page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('county-live-2026-CO')??'null');return d?.fetched_at?Date.now()-Date.parse(d.fetched_at):Infinity}),{timeout:45000}).toBeLessThan(120000);
 const proof=await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('county-live-2026-CO')!);return {state:d.state,year:d.year,rows:d.rows.length,fetched_at:d.fetched_at,source:d.source_url}});
 expect(proof.year).toBe(2026);expect(proof.rows).toBe(128);console.log('Colorado live ZIP proof',JSON.stringify(proof));
});

test('Texas prominently shows Hinojosa reported share and same-candidate market contracts on production',async({page},testInfo)=>{
 test.skip(!process.env.LIVE_TEST_URL,'Set LIVE_TEST_URL for live proof.');test.setTimeout(60000);
 await page.goto(process.env.LIVE_TEST_URL!+'/#state=TX');await expect(page.locator('path[data-county]')).toHaveCount(254);
 await expect.poll(async()=>page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('election-atlas-results-v1')??'null');return d?.fetched_at?Date.now()-Date.parse(d.fetched_at):Infinity}),{timeout:45000}).toBeLessThan(120000);
 const card=page.getByTestId('race-summary-Governor');await expect(card.getByRole('heading',{name:'Gina Hinojosa',exact:true})).toBeVisible();await expect(card.getByRole('heading',{name:'Greg Abbott',exact:true})).toHaveCount(0);
 const actual=await page.evaluate(()=>JSON.parse(localStorage.getItem('election-atlas-results-v1')!).races.find((r:{state:string;office:string})=>r.state==='TX'&&r.office==='Governor'));
 const leader=[...actual.candidates].sort((a:{votes:number},b:{votes:number})=>b.votes-a.votes)[0];expect(leader.name).toBe('Gina Hinojosa');await expect(card.locator('.leader-share strong')).toHaveText((leader.share*100).toFixed(1)+'%');
 await expect(card).toContainText('of reported votes');await expect(card).toContainText('Leading · Unofficial');
 await expect.poll(async()=>page.evaluate(()=>Boolean(localStorage.getItem('election-atlas-v1'))),{timeout:45000}).toBe(true);
 const snapshot=await page.evaluate(()=>JSON.parse(localStorage.getItem('election-atlas-v1')!)) as import('../../src/types').Snapshot;const race=snapshot.races.find(r=>r.state==='TX'&&r.office==='Governor')!;const candidate=race.candidates.find(c=>c.name==='Gina Hinojosa')!;
 for(const provider of ['kalshi','polymarket']){const cell=card.locator(`[data-provider="${provider}"]`);const contracts=snapshot.contracts.filter(c=>c.race_id===race.id&&c.candidate_id===candidate.id&&c.provider===provider);const title=await cell.locator('a').getAttribute('title');expect(contracts.some(c=>title?.includes(c.question))).toBe(true)}
 await mkdir('artifacts',{recursive:true});await card.scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/live-Texas-leader-${testInfo.project.name}.png`,fullPage:false,animations:'disabled'});
 console.log('Texas actual leader proof',JSON.stringify({leader:leader.name,share:leader.share,source_as_of:actual.as_of,url:page.url()}));
});
