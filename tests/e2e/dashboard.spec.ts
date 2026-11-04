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

test('county selection shows historical local returns with statewide polling kept distinct',async({page})=>{
 await page.goto('/#state=GA');await expect(page.locator('path[data-county]')).toHaveCount(159);
 await page.locator('.county-directory summary').click();
 await page.getByRole('textbox',{name:'Search counties'}).fill('Fulton');
 await page.getByRole('button',{name:'Fulton',exact:true}).click();
 const brief=page.getByRole('region',{name:'Selected county information'});
 await expect(brief.getByRole('heading',{name:'Fulton',exact:true})).toBeVisible();
 await expect(brief).toContainText('2024 President · historical returns');
 await expect(brief).toContainText('County polling unavailable');
 await expect(brief).toContainText('Polls and market prices above are statewide');
 await expect(brief.locator('.county-votes-compact b')).toHaveCount(2);
 await page.getByLabel('County election office').selectOption('Senate');
 await expect(page.getByLabel('County election year')).toHaveValue('2022');
 await expect(brief.getByRole('heading',{name:'Select a county',exact:true})).toBeVisible();
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

test('reported results use vote leaders regardless of source order and keep county history separate',async({page},testInfo)=>{
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
 await expect(page.locator('.county-result-note')).toContainText('historical returns');
 await expect(page.getByLabel('County election year')).toHaveValue('2024');
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
