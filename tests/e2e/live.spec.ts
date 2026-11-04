import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

test('refreshes real provider data and shows favorite prices through the deployed Cloudflare proxy',async({page})=>{
 test.skip(!process.env.LIVE_TEST_URL,'Set LIVE_TEST_URL for the optional live provider smoke check.');
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.LIVE_TEST_URL!,{waitUntil:'domcontentloaded',timeout:60000});
 await expect(page.locator('path[data-state]')).toHaveCount(50);
 await expect(page.locator('.live-refresh')).not.toContainText('Updating…',{timeout:60000});
 await page.locator('.focused-sources summary').click();
 for(const provider of ['Polling Forecast','VoteHub','Kalshi','Polymarket']){
  const card=page.locator('.source-grid article').filter({has:page.getByText(provider,{exact:true})});
  await expect(card.locator('.source-status')).toHaveText(/Connected|Partial refresh/,{timeout:60000});
 }
 const observed=await page.evaluate(()=>JSON.parse(localStorage.getItem('election-atlas-v1')??'{}').providers as Record<string,{last_success:string|null}>);
 for(const provider of ['polling_forecast','votehub','kalshi','polymarket'])expect(Date.now()-Date.parse(observed[provider].last_success!)).toBeLessThan(120000);
 await page.getByTestId('state-ME').click();
 await expect(page.locator('path[data-county]')).toHaveCount(16);
 await expect(page.getByTestId('race-summary-Senate')).toBeVisible();
 await expect(page.getByTestId('race-summary-Governor')).toBeVisible();
 await expect(page.getByTestId('race-summary-Senate').locator('.focused-market')).toHaveCount(2);
 await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/deployed-live.png',fullPage:false,animations:'disabled'});
 expect(errors).toEqual([]);
});
