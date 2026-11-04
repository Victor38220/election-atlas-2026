import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

test('refreshes actual providers through the deployed Cloudflare proxy',async({page})=>{
 test.skip(!process.env.LIVE_TEST_URL,'Set LIVE_TEST_URL to run a rate-limited live smoke check.');
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.LIVE_TEST_URL!,{waitUntil:'domcontentloaded',timeout:60000});
 await expect(page.locator('path[data-state]')).toHaveCount(50);
 await expect(page.locator('.refresh-block small')).not.toContainText('Loading live sources',{timeout:60000});
 const providers=['Polling Forecast','VoteHub','Kalshi','Polymarket'];
 for(const provider of providers){const card=page.locator('.source-grid article').filter({has:page.getByText(provider,{exact:true})});await expect(card.locator('.source-status')).toHaveText('Connected',{timeout:60000});}
 await page.getByTestId('state-ME').click();
 await expect(page.getByRole('region',{name:'Maine Senate race details'})).toBeVisible();
 await expect(page.locator('.market-card.kalshi .market-price').first()).not.toContainText('—');
 await expect(page.locator('.market-card.polymarket .market-price').first()).not.toContainText('—');
 await mkdir('artifacts',{recursive:true});
 await page.screenshot({path:'artifacts/deployed-live.png',fullPage:false});
 expect(errors).toEqual([]);
});
