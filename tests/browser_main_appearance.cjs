/* Reference: origin/main b46b4cb at Thu 12 Nov 2026 10:56 Moscow.
   Read-only browser check. Null statuses are supplied explicitly for the preview. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 if(!process.env.SPOT_TEST_URL)throw new Error('Set SPOT_TEST_URL to an isolated test server');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:980},timezoneId:'Europe/Moscow'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const Native=Date,at=Date.parse('2026-11-12T07:56:00Z');window.Date=class extends Native{constructor(...args){super(...(args.length?args:[at]));}};});
  await page.route('**/api/spots/',async route=>{const response=await route.fetch(),body=await response.json();body.features.forEach(f=>f.properties.is_occupied=null);await route.fulfill({response,json:body});});
  await page.goto(process.env.SPOT_TEST_URL+'/map?map=flat');await page.waitForFunction(()=>SPOT_DATA.status==='ready'&&MAP.map());await page.waitForTimeout(2200);
  const expected=['free','busy','busy','free','busy','free','busy','free','free','free'];
  assert.equal(await page.evaluate(()=>zone(state.sel).label),'ул. Небесная, зона 16');
  assert.equal(await page.evaluate(()=>freeEst(zone(state.sel))),6);
  assert.equal(await page.locator('#strip .car').count(),4);
  assert.deepEqual(await page.locator('#strip .bay').evaluateAll(es=>es.map(e=>e.classList.contains('free')?'free':'busy')),expected);
  assert.equal(await page.evaluate(()=>SPOTS.counts(zone(state.sel)).unknown),10,'Appearance must not turn estimates into observations');
  for(const theme of ['light','dark']){
   await page.locator(`[data-a="theme"][data-v="${theme}"]`).click();await page.waitForTimeout(150);
   const palette=await page.evaluate(()=>({halo:getComputedStyle(document.documentElement).getPropertyValue('--asph').trim(),actual:[...new Set(Object.values(MAP.map()._layers).filter(l=>l.options&&l.options.weight>10&&l._latlngs).map(l=>l.options.color))]}));
   assert.ok(palette.actual.includes(palette.halo),'Road decoration must follow selected theme');
   fs.mkdirSync('work/browser',{recursive:true});await page.screenshot({path:`work/browser/main-appearance-${theme}.png`});
  }
  await page.locator('[data-a="more"]').click();assert.ok(await page.locator('#hour').count());
  await page.locator('[data-a="fcmap"]').click();assert.equal(await page.evaluate(()=>state.mapFc),true);
  assert.deepEqual(errors,[]);console.log('PASS: main appearance restored (6 green slots, 4 cars, original zone/numbering/palette), both themes, forecast controls; 10 statuses remain unknown in the model.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
