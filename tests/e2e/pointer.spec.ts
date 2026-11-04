import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
test('production pointer hits state land and external state labels',async({page},testInfo)=>{
 test.skip(!process.env.LIVE_TEST_URL,'Set LIVE_TEST_URL for production pointer investigation.');test.setTimeout(90000);
 const logs:unknown[]=[];const fail:string[]=[];await mkdir('artifacts',{recursive:true});
 await page.goto(process.env.LIVE_TEST_URL!+'/?pointercheck='+Date.now());await expect(page.locator('path[data-state]')).toHaveCount(50);
 await expect(page.locator('.live-refresh')).not.toContainText('Updating…');
 const assets=await page.locator('script[src]').evaluateAll(items=>items.map(s=>s.getAttribute('src')));logs.push({assets,url:page.url()});
 for(const [state,kind] of [['GA','land'],['TX','land'],['GA','label'],['MA','label'],['NJ','label'],['RI','label']] as const){
  if(await page.getByRole('button',{name:'Back to national map',exact:true}).count()){await page.getByRole('button',{name:'Back to national map',exact:true}).click();await expect(page.locator('path[data-state]')).toHaveCount(50)}
  await page.locator('.national-focus').evaluate(async el=>{await Promise.allSettled(el.getAnimations({subtree:true}).map(a=>a.finished))});
  const target=kind==='land'?page.getByTestId('state-'+state):page.locator('.state-label').filter({hasText:new RegExp('^'+state+'$')});
  await target.scrollIntoViewIfNeeded();const box=await target.boundingBox();if(!box)throw Error('Missing target '+state);
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.click(x,y);
  const selected=await page.waitForFunction(state=>new URLSearchParams(location.hash.slice(1)).get('state')===state,state,{timeout:1500}).then(()=>true).catch(()=>false);
  if(selected)await expect(page.locator('path[data-county]')).toHaveCount(({GA:159,TX:254,MA:14,NJ:21,RI:5} as Record<string,number>)[state]);
  const record={state,kind,x,y,selected,url:page.url(),h1:await page.locator('main h1').innerText(),statePaths:await page.locator('path[data-state]').count(),countyPaths:await page.locator('path[data-county]').count()};logs.push(record);
  if(!selected)fail.push(state+' '+kind);
  await page.screenshot({path:`artifacts/pointer-${state}-${kind}-${testInfo.project.name}.png`,fullPage:false,animations:'disabled'});
 }
 await writeFile(`artifacts/pointer-${testInfo.project.name}.json`,JSON.stringify(logs,null,2));console.log(JSON.stringify(logs));expect(fail).toEqual([]);
});
