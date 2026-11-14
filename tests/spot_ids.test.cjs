const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
function load(saved){
  const store = {me_map_v2: saved ? JSON.stringify(saved) : null};
  const c = {crypto:{randomUUID}, window:{console}, localStorage:{getItem:k=>store[k],setItem:(k,v)=>store[k]=v}};
  vm.createContext(c); vm.runInContext(fs.readFileSync('static/js/data/mesto-data.js','utf8'),c);
  c.store = store; return c;
}
const c=load(); const base=c.baseFeats();
const all=c.ZS.flatMap(z=>z.bays.map(b=>b.id));assert.equal(all.length,734);assert.equal(new Set(all).size,734);
c.RUNS.reverse();c.applyFeatures(c.baseFeats());
assert.deepEqual(JSON.parse(JSON.stringify(c.ZS.flatMap(z=>z.bays.map(b=>[b.id,b.poly])).sort((a,b)=>a[0].localeCompare(b[0])))),JSON.parse(JSON.stringify(load().ZS.flatMap(z=>z.bays.map(b=>[b.id,b.poly])).sort((a,b)=>a[0].localeCompare(b[0])))));
c.RUNS.reverse();c.applyFeatures(base);
const geometry = c.ZS.flatMap(z=>z.bays.map(b=>[b.id,JSON.stringify(b.poly)]));
c.applyFeatures(base.slice().reverse());
const after=new Map(c.ZS.flatMap(z=>z.bays.map(b=>[b.id,JSON.stringify(b.poly)])));
geometry.forEach(([id,poly])=>assert.equal(after.get(id),poly));
// Append a physical bay to an existing generated run: preserve old IDs explicitly.
const extended=load(), oldBays=extended.ZS[0].bays.map(b=>({id:b.id,c:Array.from(b.c)}));
extended.RUNS[0][1]++;extended.RUNS[0][7].push('new:'+randomUUID());extended.applyFeatures(extended.baseFeats());
oldBays.forEach(b=>{const now=extended.ZS[0].bays.find(x=>x.id===b.id);assert.ok(now);assert.ok(Math.hypot(now.c[0]-b.c[0],now.c[1]-b.c[1])<1e-12)});
const row=JSON.parse(JSON.stringify(base[0]));row.properties.spotIds=row.properties.spotIds.map(()=> 'new:'+randomUUID());row.properties.zone='new-zone';
c.applyFeatures([row,...base]);geometry.forEach(([id,poly])=>assert.equal(new Map(c.ZS.flatMap(z=>z.bays.map(b=>[b.id,JSON.stringify(b.poly)]))).get(id),poly));
// Zone changes cannot change a bay's identity.
const moved=JSON.parse(JSON.stringify(base));moved[0].properties.zone='changed-zone';c.applyFeatures(moved);assert.equal(c.ZS.find(z=>z.id==='changed-zone').bays[0].id,base[0].properties.spotIds[0]);
const legacy=JSON.parse(JSON.stringify(base));legacy.forEach(f=>delete f.properties.spotIds);
const migrated=load(legacy);assert.deepEqual(Array.from(migrated.ZS.flatMap(z=>z.bays.map(b=>b.id))),Array.from(all));assert.ok(migrated.store.me_map_v2_before_ids);
const edited=JSON.parse(JSON.stringify(legacy));edited[0].geometry.coordinates[0][0]+=.00001;
const custom=load(edited);assert.ok(custom.ZS[0].bays.slice(0,29).every(b=>b.id.startsWith('local:')));
const second=load(JSON.parse(custom.store.me_map_v2));assert.deepEqual(Array.from(second.ZS[0].bays.map(b=>b.id)),Array.from(custom.ZS[0].bays.map(b=>b.id)));
const broken=JSON.parse(JSON.stringify(base));broken[0].properties.spots++;
assert.throws(()=>c.applyFeatures(broken),/spotIds/);
const duplicate=JSON.parse(JSON.stringify(base));duplicate[1].properties.spotIds[0]=duplicate[0].properties.spotIds[0];assert.throws(()=>c.applyFeatures(duplicate),/ID/);
// Existing shapes remain exactly the same as the main baseline.
const original=JSON.parse(fs.readFileSync('docs/spot-ids/frontend-baseline.json'));
const current=load().ZS.flatMap(z=>z.bays.map(b=>({id:b.id,poly:b.poly})));
assert.deepEqual(JSON.parse(JSON.stringify(current)),original.map(b=>({id:b.id,poly:b.poly})));
console.log('OK: 734 explicit IDs, reorder, insertion, zone change, localStorage migration, duplicate rejection, unchanged geometry');

// Exercise actual SPOTS state: changing one bay follows its ID after reorder.
const spots=load();Object.assign(spots,{state:{mapFc:false},document:{addEventListener:()=>{}},freeEst:z=>Math.floor(z.bays.length/2),clamp:(n,a,b)=>Math.max(a,Math.min(b,n))});
vm.runInContext(fs.readFileSync('static/js/features/map/spots.js','utf8'),spots);
const z=spots.ZS[0], id=z.bays[0].id, neighbor=z.bays[1].id;
spots.SPOTS.setBay(z,0,true,'user');assert.equal(spots.state.over[id].busy,true);assert.equal(spots.state.over[neighbor],undefined);
z.bays.reverse();z.rank.reverse();assert.equal(spots.SPOTS.id(z,z.bays.length-1),id);assert.equal(spots.SPOTS.isFree(z,z.bays.length-1),false);
console.log('OK: selected status stored by ID, neighbor untouched');

// Exercise production event handlers and assert exact endpoint / separation of zone marks.
(async()=>{
 const handlers={}, posts=[], cfg={spots:true,marks:true};
 const api={on:k=>cfg[k],ev:(k,fn)=>(handlers[k]??=[]).push(fn),soft:()=>{},say:()=>{},repaint:()=>{},post:(p,b)=>{posts.push({p,b});return Promise.resolve({id:1})}};
 const env={API:api,ZS:[],state:{marks:[],helped:1},encodeURIComponent,Promise,setTimeout};
 vm.createContext(env);vm.runInContext(fs.readFileSync('static/js/api/zones.js','utf8'),env);
 const m={sp:true,spotId:'z1:7',zone:'z1',kind:'busy',prevBusy:false};
 handlers.mark.forEach(fn=>fn({mark:m}));await Promise.resolve();
 assert.equal(posts.length,1);assert.equal(posts[0].p,'/api/spots/z1%3A7/status/');assert.equal(posts[0].b.is_occupied,true);
 handlers.unmark.forEach(fn=>fn({mark:m}));await Promise.resolve();assert.equal(posts.length,2);assert.equal(posts[1].b.is_occupied,false);
 handlers.mark.forEach(fn=>fn({mark:{zone:'z1',kind:'free'},gps:{}}));await Promise.resolve();assert.equal(posts[2].p,'/api/zones/z1/marks/');
 console.log('OK: selected ID sent to spot API; zone mark is a separate action');
})().catch(e=>{console.error(e);process.exitCode=1});
