import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

type Candidate={name:string;party:string;votes:number;share:number|null};
type CountyRow={fips:string;county:string;state:string;office:'Senate'|'Governor';year:number;candidates:Candidate[];total:number|null;status:string};
type CountyData={state:string;geography_type?:string;year:number;election_date:string;fetched_at:string;source_name:string;source_url:string;message:string;rows:CountyRow[]};
type NationalRace={race_id:string;state:string;office:'Senate'|'Governor';total:number;candidates:Candidate[]};
type APCall={race_id:string;authority:string;winner_name:string;source_candidate_id:string;source_url:string};
type ResultsData={fetched_at:string;races:NationalRace[];calls:APCall[]};
type RawRace={election_date?:string;type?:string;office_id?:string;updated_at?:string;top_reporting_unit?:{state_postal?:string;provider_updated_at?:string}};
type BatchRequest={at:number;paths:string[];status?:number};

const base=()=>process.env.LIVE_TEST_URL??process.env.PLAYWRIGHT_BASE_URL;
const formatVotes=(n:number)=>n.toLocaleString('en-US');
const partyColor=(party:string)=>party==='D'?'#579bd7':party==='R'?'#e06c7e':party==='I'?'#b198e0':'#52627a';
const ctFips=['09001','09003','09005','09007','09009','09011','09013','09015'];

function observeNetwork(page:import('@playwright/test').Page){
 const batches:BatchRequest[]=[];
 const byRequest=new WeakMap<object,BatchRequest>();
 const nationalCounties=new Set<string>();
 const legacyCountyRequests:string[]=[];
 page.on('request',request=>{
  const url=new URL(request.url());
  if(url.pathname==='/api/batch'){
   let paths:string[]=[];
   try{paths=JSON.parse(url.searchParams.get('paths')??'[]') as string[]}catch{/* Invalid batch URLs are checked by the assertions below. */}
   if(paths.includes('/api/national/Senate')&&paths.includes('/api/national/Governor')){
    const batch={at:Date.now(),paths};batches.push(batch);byRequest.set(request,batch);
   }
  }
  const countyPrefix='/api/counties/';
  if(url.pathname.startsWith(countyPrefix)){
   const match=url.pathname.match(/^\/api\/counties\/national\/([A-Z]{2})$/);
   if(match)nationalCounties.add(match[1]);
   else legacyCountyRequests.push(url.pathname);
  }
  if(/\/data\/counties\/|\/api\/polling\/counties/.test(url.pathname))legacyCountyRequests.push(url.pathname);
 });
 page.on('response',response=>{
  const batch=byRequest.get(response.request());if(batch)batch.status=response.status();
 });
 return {batches,nationalCounties,legacyCountyRequests};
}

async function countyResponse(page:import('@playwright/test').Page,state:string,requestedAfter=Date.now()){
 const response=await page.waitForResponse(r=>new URL(r.url()).pathname===`/api/counties/national/${state}`&&r.request().method()==='GET',{timeout:60000});
 expect(response.status(),`${state} national county API status`).toBe(200);
 const raw=await response.json() as {races?:RawRace[]};
 expect(Array.isArray(raw.races),`${state} API returns the live NYT race payload`).toBe(true);
 const raceRows=raw.races!.filter(r=>r.election_date==='2026-11-03'&&['General','Special General'].includes(r.type)&&['S','G'].includes(r.office_id)&&r.top_reporting_unit?.state_postal===state);
 expect(raceRows.length,`${state} has published Senate/Governor source races`).toBeGreaterThan(0);
 const clocks=raceRows.map(r=>r.top_reporting_unit?.provider_updated_at||r.updated_at).filter((x):x is string=>typeof x==='string').sort();
 const sourceTime=clocks.at(-1)??null;
 await expect.poll(()=>page.evaluate(state=>{
  const d=JSON.parse(localStorage.getItem('county-live-2026-'+state)??'null');return d?{fetched_at:d.fetched_at,source_time:d.source_time}:null;
 },state),{timeout:20000}).toMatchObject({source_time:sourceTime});
 const data=await page.evaluate(state=>JSON.parse(localStorage.getItem('county-live-2026-'+state)!) as CountyData,state);
 expect(Date.now()-Date.parse(data.fetched_at),`${state} normalized cache is freshly written after the API response`).toBeLessThan(120000);
 expect(Date.parse(data.fetched_at),`${state} cache timestamp follows the actual request`).toBeGreaterThanOrEqual(requestedAfter-1000);
 return data;
}

async function waitForStoredCounty(page:import('@playwright/test').Page,state:string,data:CountyData){
 await expect.poll(()=>page.evaluate(state=>{
  const stored=JSON.parse(localStorage.getItem('county-live-2026-'+state)??'null');return stored?.fetched_at??null;
 },state),{timeout:20000}).toBe(data.fetched_at);
}

async function selectCountyAndVerify(page:import('@playwright/test').Page,state:string,data:CountyData,screenshot:string){
 const rows=data.rows.filter(row=>row.status==='reporting'&&(row.total??0)>0&&row.candidates.some(c=>c.votes>0&&c.share!==null));
 const row=rows.find(candidate=>data.rows.some(other=>other.fips===candidate.fips&&other.office!==candidate.office&&(other.total??0)>0))??rows[0];
 expect(row,`${state} has a county with actual candidate votes`).toBeTruthy();
 await page.locator(`path[data-county="${row.fips}"]`).focus();await page.keyboard.press('Enter');
 const brief=page.getByRole('region',{name:'Selected county information'});
 await expect(brief).toContainText(row.county);
 const selected=await page.evaluate(({state,fips})=>{
  const d=JSON.parse(localStorage.getItem('county-live-2026-'+state)!);return d.rows.filter((r:{fips:string})=>r.fips===fips);
 },{state,fips:row.fips}) as CountyRow[];
 expect(selected.length).toBeGreaterThan(0);
 for(const actual of selected){
  const report=brief.locator('.county-current-report').filter({has:page.locator('.county-report-title strong',{hasText:actual.office==='Senate'?'US Senate':'Governor'})});
  await expect(report).toHaveCount(1);
  if((actual.total??0)>0){
   await expect(report.locator('.county-report-total')).toContainText(`${formatVotes(actual.total!)} votes reported`);
   for(const candidate of actual.candidates.filter(c=>c.votes>0&&c.share!==null)){
    const displayed=report.locator('.county-current-candidate').filter({hasText:candidate.name});
    await expect(displayed.locator('strong')).toHaveText(formatVotes(candidate.votes));
    await expect(displayed.locator('small')).toHaveText(`${(candidate.share!*100).toFixed(1)}%`);
   }
  }
 }
 await mkdir('artifacts',{recursive:true});await brief.scrollIntoViewIfNeeded();
 await page.screenshot({path:screenshot,fullPage:true,animations:'disabled'});
}

test('live nationwide results and NYT county maps use fresh actual returns',async({page},testInfo)=>{
 test.skip(!base(),'Set LIVE_TEST_URL or PLAYWRIGHT_BASE_URL for the nationwide live proof.');
 test.setTimeout(210000);
 const network=observeNetwork(page);
 const initialStarted=Date.now();const initialCounty=countyResponse(page,'MI',initialStarted);
 const batchResponse=page.waitForResponse(r=>{
  if(new URL(r.url()).pathname!=='/api/batch')return false;
  try{const paths=JSON.parse(new URL(r.url()).searchParams.get('paths')??'[]') as string[];return paths.includes('/api/national/Senate')&&paths.includes('/api/national/Governor')}catch{return false}
 },{timeout:60000});
 await page.goto(base()+'/#state=MI',{waitUntil:'domcontentloaded',timeout:60000});

 const initialMI=await initialCounty;
 expect(initialMI.state).toBe('MI');expect(initialMI.year).toBe(2026);expect(initialMI.election_date).toBe('2026-11-03');
 expect(initialMI.source_name).toContain('New York Times');expect(initialMI.rows).toHaveLength(166);
 expect(initialMI.rows.filter(r=>r.office==='Senate')).toHaveLength(83);expect(initialMI.rows.filter(r=>r.office==='Governor')).toHaveLength(83);
 expect(new Set(initialMI.rows.map(r=>r.fips)).size).toBe(83);
 expect(initialMI.rows.every(r=>r.fips.startsWith('26')&&r.state==='MI'&&r.year===2026)).toBe(true);
 await waitForStoredCounty(page,'MI',initialMI);

 const liveBatch=await batchResponse;expect(liveBatch.status()).toBe(200);
 await expect.poll(()=>page.evaluate(()=>{
  const d=JSON.parse(localStorage.getItem('election-atlas-results-v1')??'null');return d?.fetched_at??null;
 }),{timeout:30000}).not.toBeNull();
 const results=await page.evaluate(()=>JSON.parse(localStorage.getItem('election-atlas-results-v1')!) as ResultsData);
 expect(Date.now()-Date.parse(results.fetched_at)).toBeLessThan(120000);
 expect(results.races).toHaveLength(71);
 expect(results.races.some(r=>r.race_id==='2026-senate-fl-special'&&r.office==='Senate')).toBe(true);
 expect(results.races.some(r=>r.race_id==='2026-senate-oh-special'&&r.office==='Senate')).toBe(true);
 expect(results.calls.length).toBeGreaterThan(0);
 for(const call of results.calls){expect(call.authority).toBe('Associated Press');expect(call.winner_name).not.toBe('');expect(call.source_candidate_id).not.toBe('');expect(call.source_url).toMatch(/^https:\/\//)}
 const firstBatch=network.batches.find(b=>b.paths.includes('/api/national/Senate')&&b.paths.includes('/api/national/Governor'));
 expect(firstBatch,'real Senate/Governor batch request').toBeTruthy();expect(firstBatch!.status).toBe(200);

 // The hook schedules its next real request at the next :00 or :30 boundary.
 const boundary=(Math.floor(Date.now()/30000)+1)*30000;
 await expect.poll(()=>network.batches.some(b=>b.at>=boundary&&b.at<=boundary+2000&&b.status===200),{timeout:Math.max(1000,boundary-Date.now()+3500),intervals:[50,100]}).toBe(true);
 const timedBatch=network.batches.find(b=>b.at>=boundary&&b.at<=boundary+2000&&b.status===200)!;
 expect(timedBatch.at-boundary).toBeLessThanOrEqual(2000);

 await selectCountyAndVerify(page,'MI',initialMI,`artifacts/nationwide-MI-${testInfo.project.name}.png`);

 const nyWait=countyResponse(page,'NY');await page.getByLabel('Go to state').selectOption('NY');const ny=await nyWait;
 expect(ny.state).toBe('NY');expect(ny.rows).toHaveLength(62);expect(ny.rows.every(r=>r.office==='Governor'&&r.state==='NY'&&r.fips.startsWith('36'))).toBe(true);
 expect(new Set(ny.rows.map(r=>r.fips)).size).toBe(62);expect(ny.source_name).toContain('New York Times');await waitForStoredCounty(page,'NY',ny);
 await selectCountyAndVerify(page,'NY',ny,`artifacts/nationwide-NY-${testInfo.project.name}.png`);

 const checks:[string,number,Record<string,number>][]=[
  ['MA',28,{Senate:14,Governor:14}],['CT',8,{Governor:8}],['FL',134,{Senate:67,Governor:67}],['OH',176,{Senate:88,Governor:88}],['AK',80,{Senate:40,Governor:40}],
 ];
 for(const [state,rowCount,officeCounts] of checks){
  const response=countyResponse(page,state);await page.getByLabel('Go to state').selectOption(state);const data=await response;
  expect(data.state).toBe(state);expect(data.year).toBe(2026);expect(data.election_date).toBe('2026-11-03');expect(data.rows).toHaveLength(rowCount);
  expect(data.source_name).toContain('New York Times');
  for(const [office,count] of Object.entries(officeCounts))expect(data.rows.filter(r=>r.office===office)).toHaveLength(count);
  if(state==='MA'){
   expect(new Set(data.rows.filter(r=>r.office==='Senate').map(r=>r.fips)).size).toBe(14);
   expect(new Set(data.rows.filter(r=>r.office==='Governor').map(r=>r.fips)).size).toBe(14);
   expect(data.message).toMatch(/sum distinct towns using publisher-supplied county FIPS/i);
  }
  if(state==='CT')expect([...new Set(data.rows.map(r=>r.fips))].sort()).toEqual(ctFips);
  if(state==='FL'||state==='OH'){
   expect(results.races.some(r=>r.race_id===`2026-senate-${state.toLowerCase()}-special`&&r.office==='Senate')).toBe(true);
   expect(data.rows.some(r=>r.office==='Senate')).toBe(true);expect(data.rows.some(r=>r.office==='Governor')).toBe(true);
  }
  if(state==='AK'){
   expect(data.geography_type).toBe('state_house_district');
   expect(data.rows.every(r=>r.county.startsWith('State House District '))).toBe(true);
   expect(new Set(data.rows.map(r=>r.county)).size).toBe(40);
   expect(data.message).toMatch(/not borough\/census-area county totals/i);
  }
  await waitForStoredCounty(page,state,data);
 }

 await page.getByRole('button',{name:'Back to national map',exact:true}).click();
 const nyPath=page.locator('path[data-state="NY"]');const miPath=page.locator('path[data-state="MI"]');
 await expect(nyPath).toHaveAttribute('data-contests','1');
 const nyRace=results.races.find(r=>r.state==='NY'&&r.office==='Governor');expect(nyRace).toBeTruthy();
 const nyCall=results.calls.find(c=>c.race_id===nyRace!.race_id);
 const nyFill=await nyPath.getAttribute('fill');expect(nyFill).not.toContain('race-split-NY');
 await expect(nyPath).toHaveAttribute('data-ap-called-governor',nyCall?'true':'false');
 if(nyCall)expect(nyFill).toBe(partyColor(nyCall.party??''));

 await expect(miPath).toHaveAttribute('data-contests','2');await expect(miPath).toHaveAttribute('fill','url(#race-split-MI)');
 for(const office of ['Senate','Governor'] as const){
  const race=results.races.find(r=>r.state==='MI'&&r.office===office)!;const call=results.calls.find(c=>c.race_id===race.race_id);
  await expect(miPath).toHaveAttribute(office==='Senate'?'data-ap-called-senate':'data-ap-called-governor',call?'true':'false');
  const max=Math.max(...race.candidates.map(c=>c.votes));const hasLeader=race.total>0&&max>0&&race.candidates.filter(c=>c.votes===max).length===1;
  const hatch=page.locator(`path[clip-path="url(#hatch-MI-${office})"]`);
  await expect(hatch).toHaveCount(!call&&hasLeader?1:0);
 }
 await expect(page.locator('.map-legend')).toContainText('Solid: AP called winner');
 await expect(page.locator('.map-legend')).toContainText('Hatched: reported leader, uncalled');

 expect([...network.nationalCounties].sort()).toEqual(['AK','CT','FL','MA','MI','NY','OH']);
 expect(network.legacyCountyRequests).toEqual([]);
});

test('packaged NY and Michigan rows keep the county view useful when live APIs are offline',async({page})=>{
 test.skip(!base(),'Set LIVE_TEST_URL or PLAYWRIGHT_BASE_URL to inspect deployed county seeds.');
 const seedResponse=await page.request.get(base()+'/data/live-counties/MI.json');expect(seedResponse.status()).toBe(200);
 const seed=await seedResponse.json() as CountyData;expect(seed.rows).toHaveLength(166);
 await page.addInitScript((value)=>localStorage.setItem('county-live-2026-MI',JSON.stringify(value)),seed);
 await page.route('**/api/batch?*',route=>route.abort());
 await page.route('**/api/counties/national/**',route=>route.abort());
 await page.goto(base()+'/#state=MI',{waitUntil:'domcontentloaded',timeout:60000});
 await expect.poll(()=>page.evaluate(()=>{
  const data=JSON.parse(localStorage.getItem('county-live-2026-MI')??'null');return data?.rows?.length??0;
 }),{timeout:30000}).toBe(166);
 const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('county-live-2026-MI')!) as CountyData);
 expect(data.source_name).toContain('New York Times');expect(data.rows.some(row=>row.total!==null&&row.total>0&&row.candidates.some(c=>c.votes>0))).toBe(true);
 await expect(page.locator('path[data-county]')).toHaveCount(83);
 await expect(page.locator('.county-live-error')).toHaveCount(1);
});
