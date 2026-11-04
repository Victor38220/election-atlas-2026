import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
test.beforeEach(async({page})=>{await page.route('**/api/**',route=>route.abort());});

test('renders the canonical map, changes office and data modes',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await expect(page.locator('path[data-state]')).toHaveCount(50);
 await expect(page.locator('path[data-race="true"]')).toHaveCount(35);
 await expect(page.getByTestId('state-HI')).toHaveAttribute('data-race','false');
 await page.getByRole('button',{name:'Governors 36',exact:true}).click();
 await expect(page.locator('path[data-race="true"]')).toHaveCount(36);
 await expect(page.getByTestId('state-HI')).toHaveAttribute('data-race','true');
 await page.getByRole('button',{name:'Difference',exact:true}).click();
 await expect(page.getByTestId('map-legend')).toContainText('Polymarket higher');
 await expect(page.getByTestId('map-legend')).toContainText('Kalshi higher');
 await page.getByRole('button',{name:'Polling',exact:true}).click();
 await expect(page.getByTestId('map-legend')).toContainText('Republican advantage');
 expect(errors).toEqual([]);
});

test('opens Georgia details, original polls and county returns',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await page.getByTestId('state-GA').click();
 const details=page.getByRole('region',{name:'Georgia Senate race details'});
 await expect(details).toBeVisible();
 await expect(details.getByText('Jon Ossoff',{exact:true})).toBeVisible();
 await expect(details.getByText('Mike Collins',{exact:true})).toBeVisible();
 await expect(details.getByText('Reported poll average',{exact:true})).toBeVisible();
 await details.getByRole('tab',{name:/Individual polls/}).click();
 await expect(details.getByRole('link',{name:'Original release'}).first()).toBeVisible();
 await expect(details.getByText(/Margins are the first listed candidate/)).toBeVisible();
 await page.getByRole('button',{name:'County explorer',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Georgia, county by county'})).toBeVisible();
 await expect(page.locator('path[data-county]')).toHaveCount(159);
 await page.getByRole('textbox',{name:'Search counties'}).fill('Fulton');
 await page.getByRole('button',{name:'Fulton',exact:true}).click();
 await expect(page.getByText('FIPS 13121',{exact:true})).toBeVisible();
 await expect(page.getByText('Democratic votes',{exact:true})).toBeVisible();
 await expect(page.getByText('Republican votes',{exact:true})).toBeVisible();
 await expect(page.getByText('Historical election returns. These are not live 2026 results or county forecasts.')).toBeVisible();
 await page.getByLabel('County election office').selectOption('Senate');
 await expect(page.getByLabel('County election year')).toHaveValue('2022');
 expect(errors).toEqual([]);
});

test('searches and filters the race directory with missing data handled',async({page})=>{
 await page.goto('/');
 const table=page.locator('#races');
 await page.getByRole('textbox',{name:'Search races'}).fill('Ohio');
 await expect(table.getByText('1 of 35 races')).toBeVisible();
 await expect(table.locator('tbody tr')).toHaveCount(1);
 await expect(table.getByText('SPECIAL',{exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'Search races'}).fill('');
 await page.getByRole('button',{name:'Filters',exact:true}).click();
 await page.getByLabel('Defending party').selectOption('D');
 await expect(table.locator('tbody tr')).toHaveCount(13);
 await page.getByLabel('Minimum market disagreement').selectOption('10');
 await expect(table.getByText('No races match these filters. Try broadening your search.')).toBeVisible();
});

test('keeps saved observations usable after API failures and supports deep links',async({page})=>{
 await page.goto('/#office=Senate&mode=kalshi&state=OH');
 const details=page.getByRole('region',{name:'Ohio Senate race details'});
 await expect(details).toBeVisible();
 await expect(details.getByText('Sherrod Brown',{exact:true})).toBeVisible();
 await expect(page.locator('.notice').filter({hasText:'could not refresh'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Kalshi',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(details.locator('.market-card')).not.toHaveCount(0);
 await page.reload();
 await expect(page.getByRole('region',{name:'Ohio Senate race details'})).toBeVisible();
 await expect(page.locator('path[data-state]')).toHaveCount(50);
 await expect(page.getByRole('link',{name:/Polling Forecast · CC BY 4.0/}).first()).toBeVisible();
});

test('maintains responsive layout and records visual evidence',async({page},testInfo)=>{
 await page.goto('/');
 await expect(page.locator('path[data-state]')).toHaveCount(50);
 await expect(page.locator('.notice').filter({hasText:'could not refresh'})).toBeVisible();
 await page.locator('.page-heading').scrollIntoViewIfNeeded();
 const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:window.innerWidth}));
 expect(width.scroll).toBeLessThanOrEqual(width.viewport+1);
 await mkdir('artifacts',{recursive:true});
 await page.screenshot({path:`artifacts/dashboard-${testInfo.project.name}.png`,fullPage:false});
 await page.getByTestId('state-GA').click();
 await page.getByRole('button',{name:'County explorer',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Georgia, county by county'})).toBeVisible();
 await page.locator('.county-explorer').scrollIntoViewIfNeeded();
 await page.screenshot({path:`artifacts/county-${testInfo.project.name}.png`,fullPage:false});
 const detailWidth=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:window.innerWidth}));
 expect(detailWidth.scroll).toBeLessThanOrEqual(detailWidth.viewport+1);
});
