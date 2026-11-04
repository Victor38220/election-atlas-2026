import {test,expect} from '@playwright/test';
import {mkdir,readFile} from 'node:fs/promises';
import type {Snapshot} from '../../src/types';
const seed=JSON.parse(await readFile(new URL('../../public/data/latest.json',import.meta.url),'utf8')) as Snapshot;
const reportedSeed=JSON.parse(await readFile(new URL('../../public/data/results.json',import.meta.url),'utf8')) as {races:{race_id:string;candidates:{name:string;party:string;votes:number;share:number}[];total:number}[]};
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
 await expect(page.getByTestId('map-legend')).toContainText('Two-race states split Senate / Governor');
 await expect(page.getByTestId('map-legend')).toContainText('Independent');
 await expect(page.locator('.office-tabs,.mode-tabs,.summary-grid,.field-notes,.race-table-section,.composition')).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('state selection replaces the national map with counties and both statewide races',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await page.locator('[data-state-label="GA"] rect').click();
 await expect(page.getByRole('heading',{name:'Georgia',exact:true})).toBeVisible();
 await expect(page.locator('path[data-state]')).toHaveCount(0);
 await expect(page.locator('path[data-county]')).toHaveCount(159);
 await expect(page.getByTestId('race-summary-Senate')).toBeVisible();
 await expect(page.getByTestId('race-summary-Governor')).toBeVisible();
 await expect(page.getByTestId('race-summary-Senate').getByText('Pre-election polling margin')).toBeVisible();
 await expect(page.getByTestId('race-summary-Governor').getByText('Pre-election polling margin')).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Search counties'})).toBeHidden();
 await page.getByRole('button',{name:'Back to national map',exact:true}).click();
 await expect(page.locator('path[data-state]')).toHaveCount(50);
 await expect(page.locator('path[data-county]')).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('matches both market providers to the actual reported leader',async({page})=>{
 await page.goto('/#state=GA');
 for(const race of seed.races.filter(r=>r.state==='GA')){
  const summary=seed.summaries.find(s=>s.race_id===race.id)!;
  const observed=reportedSeed.races.find(r=>r.race_id===race.id);
  const leader=observed&&observed.total>0?[...observed.candidates].sort((a,b)=>b.votes-a.votes)[0]:null;
  expect(leader).not.toBeNull();
  const favorite=race.candidates.find(c=>c.name===leader!.name)!;
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
   const market=card.locator(`[data-provider="${provider}"] a`);
   const actual=await market.locator('strong').innerText();
   if(possible.length)expect(possible).toContain(actual);else expect(actual).toBe('—');
  }
  await expect(card).toContainText('no blended estimate');
 }
});

test('published county reports retain source attribution and matched geography',async({page})=>{
 const historicalRequests:string[]=[];page.on('request',request=>{if(/\/data\/counties\/|\/api\/polling\/counties/.test(request.url()))historicalRequests.push(request.url())});
 for(const [state,count,fips] of [['NC',100,'37001'],['CA',58,'06001'],['ME',16,'23005'],['GA',159,'13001']] as const){
  const data=JSON.parse(await readFile(new URL(`../../public/data/live-counties/${state}.json`,import.meta.url),'utf8'));
  const row=data.rows.find((r:{fips:string})=>r.fips===fips);
  expect(row).toBeTruthy();
  if(state==='NC')await page.goto('/#state=NC');else await page.getByLabel('Go to state').selectOption(state);
  await expect(page.locator('path[data-county]')).toHaveCount(count);
  const shape=page.locator(`path[data-county="${fips}"]`);await expect(shape).toHaveAttribute('data-status',row.status);
  await shape.focus();await page.keyboard.press('Enter');
  const brief=page.getByRole('region',{name:'Selected county information'});
  await expect(brief.getByRole('heading',{name:row.county,exact:true})).toBeVisible();
  await expect(brief).toContainText(`${row.total.toLocaleString()} votes reported`);
  await expect(brief.getByRole('link',{name:`${row.source_name} ↗`}).first()).toHaveAttribute('href',row.source_url);
  if(row.status==='reporting')await expect(brief).toContainText(row.candidates[0].votes.toLocaleString());
  await expect(brief).toContainText('Source time:');
  await expect(page.getByLabel('County election year')).toHaveCount(0);
 }
 expect(historicalRequests).toEqual([]);
});

test('results map distinguishes AP calls from uncalled leaders and fills single-race states',async({page})=>{
 const data=JSON.parse(await readFile(new URL('../../public/data/results.json',import.meta.url),'utf8'));
 const called=data.calls.find((c:{state:string;office:string})=>c.state==='AL'&&c.office==='Senate');
 expect(called.authority).toBe('Associated Press');
 data.calls=data.calls.filter((c:{state:string})=>c.state!=='NY');
 const uncalled=data.races.find((r:{state:string;office:string;total:number})=>r.state==='NY'&&r.office==='Governor'&&r.total>0);
 expect(uncalled).toBeTruthy();
 await page.route('**/data/results.json',route=>route.fulfill({json:data}));
 await page.goto('/');
 const al=page.getByTestId('state-AL');await expect(al).toHaveAttribute('data-ap-called-senate','true');
 await expect(al).toHaveAttribute('aria-label',new RegExp(`AP called ${called.winner_name}`));
 const ny=page.getByTestId('state-NY');await expect(ny).toHaveAttribute('data-contests','1');
 await expect(ny).not.toHaveAttribute('fill',/race-split/);
 await expect(ny.locator('..').locator('path[fill="url(#leader-hatch)"]')).toHaveCount(1);
 await expect(page.getByTestId('map-legend')).toContainText('Solid: AP called winner');
 await expect(page.getByTestId('map-legend')).toContainText('Hatched: reported leader, uncalled');
});

test('Alaska displays election districts and explains their geography',async({page})=>{
 await page.goto('/#state=AK');await expect(page.locator('path[data-county]')).toHaveCount(40);
 await expect(page.locator('.county-map-hint').first()).toContainText('House election districts');
 await expect(page.locator('.county-map-hint').first()).toContainText('not boroughs or census-area counties');
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
 await page.route('**/data/live-counties/AR.json',route=>route.abort());
 const recorded=JSON.parse(await readFile(new URL('../../public/data/results.json',import.meta.url),'utf8'));
 const ar=recorded.races.find((r:{state:string;office:string})=>r.state==='AR'&&r.office==='Senate');
 const leader=[...ar.candidates].sort((a:{votes:number},b:{votes:number})=>b.votes-a.votes)[0];
 // Recorded counts are untouched; ordering is intentionally reversed to test identity rather than API ordering.
 ar.candidates.reverse();
 await page.route('**/data/results.json',route=>route.fulfill({json:recorded}));
 await page.goto('/');await expect(page.locator('path[data-state]')).toHaveCount(50);
 await page.getByRole('button',{name:'Election results',exact:true}).click();
 await expect(page.locator('.results-status')).toContainText('races with reported data');
 await expect(page.getByTestId('map-legend')).toContainText('No verified count');
 const color=leader.party==='D'?'#579bd7':leader.party==='R'?'#e06c7e':leader.party==='I'?'#b198e0':'#52627a';
 await expect(page.locator('#race-split-AR stop').first()).toHaveAttribute('stop-color',color);
 await page.locator('[data-state-label="AR"] rect').click();
 const result=page.getByTestId('reported-result-Senate');
 await expect(result).toContainText(ar.total.toLocaleString()+' votes reported');
 await expect(result).toContainText(leader.votes.toLocaleString()+' votes');
 await expect(result).toContainText('Reporting units');
 await expect(result).toContainText('not the share of ballots counted');
 await expect(result).toContainText('A leader is not a declared winner');
 await expect(result.getByRole('link',{name:'Published election results source'})).toHaveAttribute('href',ar.source_url);
 await expect(page.locator('.county-explorer')).not.toContainText('2024');
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


test('Texas governor prioritizes the reported Democratic leader over the older Abbott forecast',async({page})=>{
 await page.route('**/data/live-counties/TX.json',route=>route.abort());
 const race=seed.races.find(r=>r.state==='TX'&&r.office==='Governor')!;
 const model=seed.summaries.find(s=>s.race_id===race.id)!;
 expect(model.probability).toBeLessThan(.5);
 const observation=reportedSeed.races.find(r=>r.race_id===race.id)!;
 const leader=[...observation.candidates].sort((a,b)=>b.votes-a.votes)[0];
 expect(leader.name).toBe('Gina Hinojosa');expect(leader.party).toBe('D');
 await page.goto('/#state=TX');
 const card=page.getByTestId('race-summary-Governor');
 await expect(card.getByRole('heading',{name:'Gina Hinojosa',exact:true})).toBeVisible();
 await expect(card.getByRole('heading',{name:'Greg Abbott',exact:true})).toHaveCount(0);
 await expect(card.locator('.leader-share strong')).toHaveText((leader.share*100).toFixed(1)+'%');
 await expect(card).toContainText(/Leading.*Unofficial/i);
 for(const provider of ['kalshi','polymarket'] as const){
  const matching=seed.contracts.filter(c=>c.race_id===race.id&&c.provider===provider&&c.candidate_id===race.candidates[0].id);
  const cell=card.locator(`[data-provider="${provider}"]`);
  await expect(cell).toHaveCount(1);
  if(matching.length){const title=await cell.locator('a').getAttribute('title');expect(matching.some(c=>title?.includes(c.question))).toBe(true)}
 }
});


test('Maine cards use the published reported leaders',async({page})=>{
 await page.goto('/#state=ME');await expect(page.locator('path[data-county]')).toHaveCount(16);
 for(const office of ['Senate','Governor']){
  const observation=reportedSeed.races.find(r=>r.race_id===`2026-${office.toLowerCase()}-me`)!;
  const leader=[...observation.candidates].sort((a,b)=>b.votes-a.votes)[0];
  const card=page.getByTestId('race-summary-'+office);
  await expect(card.getByRole('heading',{name:leader.name,exact:true})).toBeVisible();
  await expect(card.locator('.leader-share strong')).toHaveText((leader.share*100).toFixed(1)+'%');
 }
});
