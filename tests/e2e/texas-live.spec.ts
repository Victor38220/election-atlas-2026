import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import type {CountyLiveData,CountyLiveResult} from '../../src/types/countyResults';
import {partyColor,pct} from '../../src/lib/analytics';

const isTexasBatch=(url:string)=>{
 const parsed=new URL(url);
 return parsed.pathname==='/api/batch'&&(parsed.searchParams.get('paths')??'').includes('/api/counties/TX/Senate');
};
const expectedFill=(row:CountyLiveResult)=>{
 const candidates=[...row.candidates].sort((a,b)=>b.votes-a.votes);
 const leader=row.status==='reporting'&&(row.total??0)>0&&candidates[0]?.votes>0&&candidates[0].votes!==candidates[1]?.votes?candidates[0]:null;
 return leader?partyColor(leader.party):row.status==='reporting'?'#52627a':'#28374b';
};

test('Texas loads real current county votes, switches offices, and refreshes on the half-minute',async({page},testInfo)=>{
 test.skip(!process.env.LIVE_TEST_URL,'Set LIVE_TEST_URL for actual public Texas feed verification.');
 test.setTimeout(75000);
 const errors:string[]=[];const historical:string[]=[];const requests:{at:number;url:string}[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{
  if(isTexasBatch(request.url()))requests.push({at:Date.now(),url:request.url()});
  if(/\/data\/counties\//.test(request.url()))historical.push(request.url());
 });
 await page.route('**/api/counties/national/**',route=>route.abort());
 const liveResponse=page.waitForResponse(response=>isTexasBatch(response.url())&&response.status()===200);
 await page.goto(process.env.LIVE_TEST_URL!+'/?texasproof='+Date.now()+'#state=TX');
 await expect(page.locator('path[data-county]')).toHaveCount(254);
 const raw=await (await liveResponse).json() as {fetchedAt:string;sourceUpdatedAt:string;counties:unknown[]}[];
 expect(raw).toHaveLength(2);for(const feed of raw){expect(feed.counties).toHaveLength(254);expect(Date.now()-Date.parse(feed.fetchedAt)).toBeLessThan(120000)}
 const backendTime=raw.map(feed=>feed.fetchedAt).sort((a,b)=>Date.parse(a)-Date.parse(b))[0];
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('county-live-2026-TX')??'null')?.fetched_at),{timeout:15000}).toBe(backendTime);
 const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('county-live-2026-TX')!)) as CountyLiveData;
 expect(data.state).toBe('TX');expect(data.year).toBe(2026);expect(data.election_date).toBe('2026-11-03');expect(data.rows).toHaveLength(508);
 expect(data.source_url).toBe('https://texianpartisan.com/election-night-2026/');expect(data.source_time).toBeTruthy();
 const reporting:Record<string,number>={};
 for(const office of ['Senate','Governor'] as const){
  const rows=data.rows.filter(row=>row.office===office);expect(rows).toHaveLength(254);
  reporting[office]=rows.filter(row=>row.status==='reporting'&&(row.total??0)>0).length;expect(reporting[office]).toBeGreaterThan(200);
  await page.getByRole('button',{name:office,exact:true}).click();
  await expect(page.getByRole('button',{name:office,exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('path[data-status="reporting"]')).toHaveCount(reporting[office]);
  const actual=await page.locator('path[data-county]').evaluateAll(paths=>Object.fromEntries(paths.map(path=>[path.getAttribute('data-county'),path.getAttribute('fill')])));
  for(const row of rows)expect(actual[row.fips],office+' '+row.county+' color').toBe(expectedFill(row));
 }
 await page.locator('path[data-county="48201"]').click();
 const brief=page.getByRole('region',{name:'Selected county information'});await expect(brief.getByRole('heading',{name:'Harris',exact:true})).toBeVisible();
 const harris=data.rows.filter(row=>row.fips==='48201');expect(harris).toHaveLength(2);
 await expect(brief.locator('.county-current-report')).toHaveCount(2);
 for(const row of harris){
  const article=brief.locator('.county-current-report').filter({has:page.locator('.county-report-title strong',{hasText:row.office==='Senate'?'US Senate':'Governor'})});
  await expect(article).toContainText(row.total!.toLocaleString()+' votes reported');
  for(const candidate of row.candidates){
   const result=article.locator('.county-current-candidate').filter({hasText:candidate.name});
   await expect(result.locator('strong')).toHaveText(candidate.votes.toLocaleString());await expect(result.locator('small')).toHaveText(pct(candidate.share));
  }
  await expect(article.getByRole('link')).toHaveAttribute('href',row.source_url);await expect(article).toContainText('Source time:');
 }
 await expect(page.locator('.county-source')).toContainText('Fetched');await expect(page.locator('.county-source')).toContainText('Source time:');
 await expect(page.locator('.county-live-error')).toHaveCount(0);await expect(brief).toContainText('Unofficial');
 await mkdir('artifacts',{recursive:true});await brief.evaluate(element=>element.scrollIntoView({block:'start'}));
 await page.screenshot({path:`artifacts/live-Texas-counties-${testInfo.project.name}.png`,fullPage:false,animations:'disabled'});
 const requestCount=requests.length;
 await expect.poll(()=>requests.length,{timeout:35000}).toBeGreaterThan(requestCount);
 const automatic=requests[requestCount];expect(automatic.at%30000,'automatic county request starts at :00 or :30').toBeLessThan(2000);
 expect(historical).toEqual([]);expect(errors).toEqual([]);
 const proof={project:testInfo.project.name,county_paths:254,rows:data.rows.length,reporting,source:data.source_url,source_time:data.source_time,backend_fetched_at:data.fetched_at,harris:harris.map(row=>({office:row.office,total:row.total,candidates:row.candidates})),automatic_refresh_at:new Date(automatic.at).toISOString(),errors};
 await writeFile(`artifacts/live-Texas-counties-${testInfo.project.name}.json`,JSON.stringify(proof,null,2));console.log('Texas county live proof',JSON.stringify(proof));
});
