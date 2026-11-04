import {test,expect} from '@playwright/test';
import {mkdir,readFile} from 'node:fs/promises';
import type {Snapshot} from '../../src/types';
const seed=JSON.parse(await readFile(new URL('../../public/data/latest.json',import.meta.url),'utf8')) as Snapshot;
const senateStates=['AL','AK','AR','CO','DE','FL','GA','ID','IL','IA','KS','KY','LA','ME','MA','MI','MN','MS','MT','NE','NH','NJ','NM','NC','OH','OK','OR','RI','SC','SD','TN','TX','VA','WV','WY'].sort();
test.beforeEach(async({page})=>{await page.route('**/api/**',route=>route.abort());});

test('opens a single map showing all Senate and governor contests',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await expect(page.getByRole('heading',{name:'Senate & governor elections',exact:true})).toBeVisible();
 await expect(page.locator('path[data-state]')).toHaveCount(50);
 await expect(page.locator('path[data-senate="true"]')).toHaveCount(35);
 await expect(page.locator('path[data-governor="true"]')).toHaveCount(36);
 expect(await page.locator('path[data-senate="true"]').evaluateAll(paths=>paths.map(p=>p.getAttribute('data-state')).sort())).toEqual(senateStates);
 await expect(page.getByTestId('state-HI')).toHaveAttribute('data-senate','false');
 await expect(page.getByTestId('state-HI')).toHaveAttribute('data-governor','true');
 await expect(page.getByTestId('map-legend')).toContainText('Left: Senate · Right: Governor');
 await expect(page.getByTestId('map-legend')).toContainText('Independent');
 await expect(page.locator('.office-tabs,.mode-tabs,.summary-grid,.field-notes,.race-table-section,.composition')).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('state selection replaces the national map with counties and both statewide races',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await page.getByTestId('state-GA').click();
 await expect(page.getByRole('heading',{name:'Georgia',exact:true})).toBeVisible();
 await expect(page.locator('path[data-state]')).toHaveCount(0);
 await expect(page.locator('path[data-county]')).toHaveCount(159);
 await expect(page.getByTestId('race-summary-Senate')).toBeVisible();
 await expect(page.getByTestId('race-summary-Governor')).toBeVisible();
 await expect(page.getByTestId('race-summary-Senate').getByText('Statewide polling margin')).toBeVisible();
 await expect(page.getByTestId('race-summary-Governor').getByText('Statewide polling margin')).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Search counties'})).toBeHidden();
 await page.getByRole('button',{name:'Back to national map',exact:true}).click();
 await expect(page.locator('path[data-state]')).toHaveCount(50);
 await expect(page.locator('path[data-county]')).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('keeps favorite candidate prices separate on the two market providers',async({page})=>{
 await page.goto('/#state=GA');
 for(const race of seed.races.filter(r=>r.state==='GA')){
  const summary=seed.summaries.find(s=>s.race_id===race.id)!;
  const favorite=summary.probability!>.5?race.candidates[0]:race.candidates.find(c=>c.party==='R')!;
  const other=race.candidates.find(c=>c.id!==favorite.id)!;
  const card=page.getByTestId('race-summary-'+race.office);
  await expect(card.getByRole('heading',{name:favorite.name,exact:true})).toBeVisible();
  await expect(card.getByRole('heading',{name:other.name,exact:true})).toHaveCount(0);
  const pollMargin=summary.poll_margin==null?null:summary.poll_margin*(favorite.id===race.candidates[0].id?1:-1);
  await expect(card.locator('.poll-reading strong')).toHaveText(pollMargin==null?'—':`${pollMargin>0?'+':''}${pollMargin.toFixed(1)} pp`);
  await expect(card.locator('.focused-market')).toHaveCount(2);
  for(const provider of ['kalshi','polymarket'] as const){
   const contracts=seed.contracts.filter(c=>c.race_id===race.id&&c.candidate_id===favorite.id&&c.provider===provider);
   const quotes=seed.quotes.filter(q=>contracts.some(c=>c.id===q.contract_id));
   const possible=quotes.filter(q=>q.price!==null).map(q=>(q.price!*100).toFixed(1)+'%');
   const market=card.getByRole('link',{name:`${provider==='kalshi'?'Kalshi':'Polymarket'} ${race.office} favorite contract`});
   const actual=await market.locator('strong').innerText();
   if(possible.length)expect(possible).toContain(actual);else expect(actual).toBe('—');
  }
  await expect(card).toContainText('no blended estimate');
 }
});

test('live county reports preserve actual counts, genuine zeroes and unavailable coverage',async({page})=>{
 const historicalRequests:string[]=[];page.on('request',request=>{if(/\/data\/counties\/|\/api\/polling\/counties/.test(request.url()))historicalRequests.push(request.url())});
 await page.goto('/#state=NC');await expect(page.locator('path[data-status="reporting"]')).toHaveCount(100);
 await page.locator('path[data-county="37001"]').focus();await page.keyboard.press('Enter');
 const brief=page.getByRole('region',{name:'Selected county information'});
 await expect(brief.getByRole('heading',{name:'Alamance',exact:true})).toBeVisible();
 await expect(brief).toContainText('67,849 votes reported');await expect(brief).toContainText('39 / 39 precincts');
 await expect(brief).toContainText('Roy Cooper');await expect(brief).toContainText('38,109');
 await expect(brief.getByRole('link',{name:'North Carolina State Board of Elections ↗'})).toHaveAttribute('href',/er.ncsbe.gov/);
 await expect(brief).toContainText('Source time:');
 await expect(brief).toContainText('County polling and county markets are unavailable');
 await expect(page.getByLabel('County election year')).toHaveCount(0);
 await expect(page.getByRole('option',{name:'President',exact:true})).toHaveCount(0);
 await page.getByLabel('Go to state').selectOption('CA');await expect(page.locator('path[data-status="awaiting"]')).toHaveCount(58);
 await page.locator('path[data-county="06001"]').focus();await page.keyboard.press('Enter');
 await expect(brief.getByRole('heading',{name:'Alameda',exact:true})).toBeVisible();
 await expect(brief).toContainText('Awaiting reported votes');await expect(brief).toContainText('0 votes reported · 0 / 627 precincts');
 await expect(brief).not.toContainText('0.0%');
 await page.getByLabel('Go to state').selectOption('ME');await expect(page.locator('path[data-status="unavailable"]')).toHaveCount(16);
 await expect(page.locator('.county-live-status')).toHaveText('No verified 2026 live county feed is connected for this state.');
 await page.getByLabel('Go to state').selectOption('GA');await expect(page.locator('path[data-county]')).toHaveCount(159);
 await expect(page.locator('path[data-status="reporting"]')).toHaveCount(156);
 await expect(page.locator('path[data-status="awaiting"]')).toHaveCount(3);
 await page.locator('path[data-county="13001"]').focus();await page.keyboard.press('Enter');
 await expect(brief.getByRole('heading',{name:'Appling',exact:true})).toBeVisible();
 await expect(brief.locator('.county-current-report')).toHaveCount(2);
 await expect(brief).toContainText('6,176 votes reported');await expect(brief).toContainText('US Senate');await expect(brief).toContainText('Governor');
 await expect(page.locator('.county-explorer')).not.toContainText('2024');
 expect(historicalRequests).toEqual([]);
});

test('saved observations and deep links work when every API is unavailable',async({page})=>{
 await page.goto('/#state=OH');
 await expect(page.getByRole('heading',{name:'Ohio',exact:true})).toBeVisible();
 await expect(page.locator('path[data-state]')).toHaveCount(0);
 await expect(page.locator('path[data-county]')).not.toHaveCount(0);
 await expect(page.getByTestId('race-summary-Senate')).toContainText('Special');
 await expect(page.locator('.compact-notice')).toContainText('Saved observations remain available');
 await page.getByRole('button',{name:'More Senate race details',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Ohio Senate details'});
 await expect(dialog).toBeVisible();
 await dialog.getByRole('tab',{name:/Individual polls/}).click();
 await expect(dialog.getByRole('link',{name:'Original release'}).first()).toBeVisible();
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 await page.reload();await expect(page.getByRole('heading',{name:'Ohio',exact:true})).toBeVisible();
 await page.getByLabel('Go to state').selectOption('DE');
 await expect(page.getByTestId('race-summary-Senate')).toBeVisible();
 await expect(page.getByTestId('race-summary-Governor')).toHaveCount(0);
});

test('keeps the map prominent on desktop and mobile without horizontal overflow',async({page},testInfo)=>{
 await page.goto('/');await expect(page.locator('path[data-state]')).toHaveCount(50);
 const map=await page.locator('.nation-map').boundingBox();expect(map!.y).toBeLessThan((page.viewportSize()?.height??800)/2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual((page.viewportSize()?.width??0)+1);
 await mkdir('artifacts',{recursive:true});await page.screenshot({path:`artifacts/dashboard-${testInfo.project.name}.png`,fullPage:false,animations:'disabled'});
 await page.getByTestId('state-GA').focus();await page.keyboard.press('Enter');await expect(page.locator('path[data-county]')).toHaveCount(159);
 await page.screenshot({path:`artifacts/county-${testInfo.project.name}.png`,fullPage:false,animations:'disabled'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual((page.viewportSize()?.width??0)+1);
 await page.getByRole('button',{name:'Back to national map',exact:true}).click();await expect(page.locator('path[data-state]')).toHaveCount(50);
});

test('reported statewide results use vote leaders and never substitute past county returns',async({page},testInfo)=>{
 const recorded=JSON.parse(await readFile(new URL('../../public/data/results.json',import.meta.url),'utf8'));
 const ar=recorded.races.find((r:{state:string;office:string})=>r.state==='AR'&&r.office==='Senate');
 const leader=[...ar.candidates].sort((a:{votes:number},b:{votes:number})=>b.votes-a.votes)[0];
 // Recorded counts are untouched; ordering is intentionally reversed to test identity rather than API ordering.
 ar.candidates.reverse();
 await page.route('**/data/results.json',route=>route.fulfill({json:recorded}));
 await page.goto('/');await expect(page.locator('path[data-state]')).toHaveCount(50);
 await page.getByRole('button',{name:'Election results',exact:true}).click();
 await expect(page.locator('.results-status')).toContainText('races with reported data');
 await expect(page.getByTestId('map-legend')).toContainText('No reported count');
 const color=leader.party==='D'?'#579bd7':leader.party==='R'?'#e06c7e':leader.party==='I'?'#b198e0':'#52627a';
 await expect(page.locator('#race-split-AR stop').first()).toHaveAttribute('stop-color',color);
 await expect(page.locator('#race-split-ID stop').first()).toHaveAttribute('stop-color','#52627a');
 await page.getByTestId('state-AR').click();
 const result=page.getByTestId('reported-result-Senate');
 await expect(result).toContainText(ar.total.toLocaleString()+' votes reported');
 await expect(result).toContainText(leader.votes.toLocaleString()+' votes');
 await expect(result).toContainText('reporting units');
 await expect(result).toContainText('not the share of ballots counted');
 await expect(result).toContainText('A leader is not a declared winner');
 await expect(result.getByRole('link',{name:'Official state election offices via Open America'})).toHaveAttribute('href',ar.source_url);
 await expect(page.locator('.county-live-status')).toContainText('No verified 2026 live county feed');
 await expect(page.getByLabel('County election year')).toHaveCount(0);
 await expect(page.getByTestId('race-summary-Senate')).toBeVisible();
 await result.scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/results-${testInfo.project.name}.png`,fullPage:false,animations:'disabled'});
});

test('exit polls identify an attributed national observation and unavailable local coverage',async({page},testInfo)=>{
 await page.goto('/');await page.getByRole('button',{name:'Exit polls',exact:true}).click();
 const exit=page.getByRole('region',{name:'Published exit polls'});
 await expect(exit).toBeVisible();await expect(page.locator('path[data-state]')).toHaveCount(0);
 await expect(exit).toContainText('Recorded published reading · National');
 await expect(exit).toContainText('does not refresh with the market timer');
 await expect(exit).toContainText('No verified free API for state or county exit-poll tables is connected');
 await expect(exit.getByRole('link',{name:'CBS News exit polls',exact:true})).toHaveAttribute('href',/https:\/\/www.cbsnews.com\//);
 await expect(exit).toContainText('A national survey figure is not a statewide or county result');
 await page.screenshot({path:`artifacts/exit-${testInfo.project.name}.png`,fullPage:false,animations:'disabled'});
 await page.getByLabel('Go to state').selectOption('GA');await expect(exit.getByRole('heading',{name:'Georgia coverage',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Polls & markets',exact:true}).click();await expect(page.locator('path[data-county]')).toHaveCount(159);
 await page.getByRole('button',{name:'Back to national map',exact:true}).click();await expect(page.locator('path[data-state]')).toHaveCount(50);
});
