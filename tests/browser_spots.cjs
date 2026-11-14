/* Run against an isolated test database only; this test writes statuses. */
const {chromium}=require('playwright');const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 if(!process.env.SPOT_TEST_URL)throw new Error('Set SPOT_TEST_URL to the server running with a temporary database');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('me_map_v2','[{"legacy":"do not display"}]');if(!localStorage.getItem('me_map_v2_before_ids'))localStorage.setItem('me_map_v2_before_ids','original backup');});
  await page.goto(process.env.SPOT_TEST_URL+'/map?map=flat');
  await page.waitForFunction(()=>SPOT_DATA.status==='ready'&&MAP.map());
  assert.equal(await page.evaluate(()=>ZS.reduce((n,z)=>n+z.bays.length,0)),734);
  assert.equal(await page.evaluate(()=>localStorage.getItem('me_map_v2_before_ids')),'original backup');
  assert.equal(await page.evaluate(()=>SPOT_DATA.legacyAvailable),true);
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Экспортировать',exact:true}).click();
  const downloaded=await downloading;assert.equal(fs.readFileSync(await downloaded.path(),'utf8'),'[{"legacy":"do not display"}]');
  assert.ok(await page.locator('#strip .bay.free').count()>0);assert.ok(await page.locator('#strip .bay.busy .car').count()>0);
  assert.equal(await page.locator('#strip .bay.unknown').count(),0);
  const ids=await page.evaluate(()=>zone(state.sel).bays.slice(0,3).map(b=>b.id));
  await page.locator('#strip [data-a="spot"]').first().click();
  assert.equal(await page.evaluate(()=>state.spot),ids[0]);
  const response=page.waitForResponse(r=>r.url().includes('/api/spots/'+encodeURIComponent(ids[0])+'/status/'));
  await page.locator('[data-a="mark"][data-v="busy"]').click();assert.equal((await response).status(),200);
  await page.waitForFunction(()=>!API.spotPending);
  assert.equal(await page.evaluate(()=>SPOTS.isFree(zone(state.sel),0)),false);
  assert.ok(await page.locator('.sc-car').count()>0);
  fs.mkdirSync('work/browser',{recursive:true});await page.waitForTimeout(1200);await page.screenshot({path:'work/browser/occupied.png'});
  await page.reload();await page.waitForFunction(()=>SPOT_DATA.status==='ready'&&MAP.map());
  const statuses=await page.evaluate(ids=>{const by={};ZS.forEach(z=>z.bays.forEach(b=>by[b.id]=b.isOccupied));return ids.map(id=>by[id]);},ids);
  assert.equal(statuses[0],true);assert.equal(statuses[1],null);
  // Click the real Leaflet canvas at the physical bay center.
  const point=await page.evaluate(id=>{const z=zone(state.sel),b=z.bays.find(b=>b.id===id),m=MAP.map(),p=m.latLngToContainerPoint([b.c[1],b.c[0]]),r=m.getContainer().getBoundingClientRect();return{x:r.x+p.x,y:r.y+p.y};},ids[0]);
  await page.mouse.click(point.x,point.y);await page.waitForFunction(id=>state.spot===id,ids[0]);
  const freeResponse=page.waitForResponse(r=>r.url().includes('/status/'));await page.locator('[data-a="mark"][data-v="free"]').click();assert.equal((await freeResponse).status(),200);await page.waitForFunction(()=>!API.spotPending);
  assert.equal(await page.evaluate(()=>SPOTS.counts(zone(state.sel)).free),1);
  await page.screenshot({path:'work/browser/free-selected.png'});
  // A failed write must restore unknown, not mark it occupied/free.
  await page.locator('#strip [data-a="spot"]').nth(1).click();
  await page.route('**/api/spots/*/status/',r=>r.fulfill({status:500,contentType:'application/json',body:'{"error":"test failure"}'}));
  await page.locator('[data-a="mark"][data-v="busy"]').click();await page.waitForFunction(()=>!API.spotPending&&state.last===null);
  assert.equal(await page.evaluate(()=>SPOTS.confirmedFree(zone(state.sel),1)),null);await page.unroute('**/api/spots/*/status/');
  // Zonal mark must neither POST a spot nor overwrite individual statuses.
  await page.locator('#strip [data-a="spot"]').nth(1).click();let spotPosts=0;
  page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/spots/'))spotPosts++;});
  await page.locator('[data-a="mark"][data-v="busy"]').click();assert.equal(spotPosts,0);
  assert.equal(await page.evaluate(()=>SPOTS.counts(zone(state.sel)).unknown),await page.evaluate(()=>zone(state.sel).spots-1));
  await page.locator('[data-a="tab"][data-v="offer"]').click();await page.locator('#ostrip [data-a="opick"]').nth(1).click();assert.ok(await page.evaluate(()=>!!offer.spotId));
  await page.locator('[data-a="tab"][data-v="map"]').click();await page.evaluate(()=>{MAP.map().setZoom(18);});
  await page.waitForFunction(()=>document.querySelectorAll('.sp-zone').length>0);await page.screenshot({path:'work/browser/zone-labels.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'work/browser/mobile.png'});
  // Initial API error shows explicit retry; no stale localStorage or generated fallback.
  await page.route('**/api/spots/',r=>r.abort());await page.reload();await page.waitForFunction(()=>SPOT_DATA.status==='error');
  assert.equal(await page.locator('.leaflet-container').count(),0);assert.equal(await page.evaluate(()=>ZS.length),0);
  await page.screenshot({path:'work/browser/api-error.png'});await page.unroute('**/api/spots/');
  await page.locator('[data-a="retry-spots"]').click();await page.waitForFunction(()=>SPOT_DATA.status==='ready'&&MAP.map());
  assert.deepEqual(errors,[]);
  console.log('PASS browser: 734 API bays, Leaflet/canvas selection, cars, labels, status persistence, neighbor isolation, unknown counters, failed-write rollback, separate zone mark, stable offer ID, localStorage isolation and actual file export, mobile layout, API error and retry.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
