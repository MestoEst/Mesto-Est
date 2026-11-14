/* Единственный источник мест при запуске — Django /api/spots/.
   Физические полигоны сохраняются в b.geometry; b.poly — только оформление. */
var MX = 65450, MY = 111320, GRID = 27.4;
var ZS = [], STREETS = [], FEATS = [], HULL = null;
var DISTRICT = {zones:[],accessible:[],chargers:[],listings:[]};
var SPOT_DATA = {status:'loading',error:'',legacyAvailable:false};
function defSel(){
  if(!ZS.length)return '';var c=[0,0];ZS.forEach(function(z){c[0]+=z.c[0]/ZS.length;c[1]+=z.c[1]/ZS.length;});
  var best=ZS[0],distance=Infinity;ZS.forEach(function(z){if(z.spots<10)return;var d=Math.hypot((z.c[0]-c[0])*MX,(z.c[1]-c[1])*MY);if(d<distance){best=z;distance=d;}});return best.id;
}
function street(id){ return STREETS.filter(function(s){ return s.id === id; })[0]; }
function spotName(zid,k){ var z=zone(zid);return z && z.bays[k] ? '№'+z.bays[k].num+', '+z.label : ''; }

/* The physical full-width polygon excludes makeBays' old 8% paint inset.
   Reapply that inset for drawing only, before SPOTS' GAP_M slot decoration. */
function displayPolygon(ring){
  var c=[0,0],n=ring.length-1;ring.slice(0,n).forEach(function(p){c[0]+=p[0]/n;c[1]+=p[1]/n;});
  var dx=(ring[1][0]-ring[0][0])*MX,dy=(ring[1][1]-ring[0][1])*MY,L=Math.hypot(dx,dy),ux=dx/L,uy=dy/L;
  return ring.map(function(p){var a=(p[0]-c[0])*MX*ux+(p[1]-c[1])*MY*uy;return [p[0]-a*.08*ux/MX,p[1]-a*.08*uy/MY];});
}
function applyCanonical(data){
  if(!data || data.type!=='FeatureCollection' || data.dataset!=='canonical-v1' || !Array.isArray(data.zones) || !Array.isArray(data.features) || !data.features.length) throw new Error('В базе нет канонических мест. Требуется импорт набора.');
  var zones={},ids={},numbers={},orders={},list=[];
  data.zones.forEach(function(p){
    if(!p.id || zones[p.id] || !Number.isInteger(p.display_order)) throw new Error('Некорректные зоны API');
    zones[p.id]={id:p.id,name:'Зона '+p.display_number,title:p.name,num:p.display_number,displayOrder:p.display_order,street:p.street_id,streetName:p.street_name,label:p.street_name+', зона '+p.display_number,type:'perimeter',bays:[],bc:[],rl:[],rank:[],profile:'home',j:0};
  });
  data.features.forEach(function(f){
    var p=f.properties||{},z=zones[p.zone],g=f.geometry;
    if(!p.id || ids[p.id] || !z || !g || g.type!=='Polygon' || !g.coordinates || !g.coordinates[0] || !Number.isInteger(p.display_number) || p.display_number<1 || !Number.isInteger(p.display_order) || p.display_order<1 || (p.is_occupied!==null && typeof p.is_occupied!=='boolean')) throw new Error('Некорректное место API');
    var nk=p.zone+':'+p.display_number,ok=p.zone+':'+p.display_order;
    if(numbers[nk]||orders[ok]) throw new Error('Повтор номера/порядка API');
    numbers[nk]=orders[ok]=true;ids[p.id]=true;
    var poly=displayPolygon(g.coordinates[0]),c=[0,0],n=poly.length-1;
    poly.slice(0,n).forEach(function(q){c[0]+=q[0]/n;c[1]+=q[1]/n;});
    z.bays.push({id:p.id,zone:p.zone,num:p.display_number,displayOrder:p.display_order,rowId:p.row_id,geometry:g,poly:poly,c:c,isOccupied:p.is_occupied,usualFreePercent:p.usual_free_percent});
  });
  var streets={};
  Object.keys(zones).map(function(id){return zones[id];}).filter(function(z){return z.bays.length;}).sort(function(a,b){return a.displayOrder-b.displayOrder||a.id.localeCompare(b.id);}).forEach(function(z){
    z.bays.sort(function(a,b){return a.displayOrder-b.displayOrder||a.id.localeCompare(b.id);});
    z.bc=z.bays.map(function(b){return b.c;});z.line=z.bc;z.spots=z.bays.length;z.c=[0,0];
    z.bc.forEach(function(c){z.c[0]+=c[0]/z.spots;z.c[1]+=c[1]/z.spots;});
    var rows={};z.bays.forEach(function(b,k){(rows[b.rowId] = rows[b.rowId]||[]).push(b);z.rank[k]=k;});
    Object.keys(rows).forEach(function(id){var bs=rows[id],a=bs[0].c,b=bs[bs.length-1].c;if(bs.length===1)b=[a[0]+.00001,a[1]];var ring=bs[0].geometry.coordinates[0],depth=Math.hypot((ring[2][0]-ring[1][0])*MX,(ring[2][1]-ring[1][1])*MY);z.rl.push({seg:[a,b],wd:Math.max(.7,depth/5)});});
    if(!streets[z.street])streets[z.street]={id:z.street,name:z.streetName,zones:[],spots:0,bc:[],c:[0,0]};
    var st=streets[z.street];st.zones.push(z.id);st.spots+=z.spots;st.bc=st.bc.concat(z.bc);list.push(z);
  });
  if(!list.length)throw new Error('В базе нет активных мест');
  // Publish only a fully validated response. Old localStorage never enters this path.
  ZS=list;STREETS=Object.keys(streets).map(function(id){var st=streets[id];st.bc.forEach(function(c){st.c[0]+=c[0]/st.bc.length;st.c[1]+=c[1]/st.bc.length;});return st;});
  DISTRICT.zones=ZS;FEATS=data.features;
  DISTRICT.listings=MAP_EXTRAS.listings.map(function(l){return Object.assign({},l);}).filter(function(l){
    var match=null;ZS.forEach(function(z){z.bays.forEach(function(b,k){if(b.id===l.spotId)match={z:z,b:b,k:k};});});
    if(!match)return false;l.zone=match.z.id;l.bay=match.k;l.num=match.b.num;l.street=match.z.street;return true;
  });
}
function preserveLegacyLayout(){
  try{
    var raw=localStorage.getItem('me_map_v2'),backup=localStorage.getItem('me_map_v2_before_ids');SPOT_DATA.legacyAvailable=!!(raw||backup);
    if(raw && !backup)localStorage.setItem('me_map_v2_before_ids',raw);
  }catch(e){SPOT_DATA.legacyAvailable=true;}
}
function exportLegacyLayout(){
  var raw=localStorage.getItem('me_map_v2');if(!raw)raw=localStorage.getItem('me_map_v2_before_ids');
  if(!raw)throw new Error('Сохранённой разметки нет');
  var url=URL.createObjectURL(new Blob([raw],{type:'application/geo+json'})),a=document.createElement('a');a.href=url;a.download='legacy-local-layout.geojson';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);
}
preserveLegacyLayout();

/* Existing non-spot demo amenities/listings. No parking polygons are generated here. */
var MAP_EXTRAS={"accessible":[{"id":"a1","ll":[27.660962,53.957032],"status":"free","name":"Зона 9","fi":142},{"id":"a2","ll":[27.665348,53.954697],"status":"busy","name":"Зона 31","fi":143},{"id":"a3","ll":[27.667503,53.953115],"status":"free","name":"Зона 53","fi":144}],"chargers":[{"id":"c1","ll":[27.663382,53.955638],"status":"busy","name":"Зона 21","fi":145},{"id":"c2","ll":[27.667007,53.954224],"status":"free","name":"Зона 39","fi":146},{"id":"c3","ll":[27.667317,53.95279],"status":"free","name":"Зона 59","fi":147}],"listings":[{"id":"l1","title":"Место у подъезда","zone":"z1","owner":"Алексей","rating":"4,9","rev":12,"hour":3,"day":15,"month":180,"whenText":"сб–вс, весь день","avail":["weekend","tomorrow"],"walk":3,"cov":false,"bay":2,"num":3,"street":"s5","spotId":"z1:2"},{"id":"l2","title":"Место во дворе","zone":"z7","owner":"Марина","rating":"5,0","rev":4,"free":true,"whenText":"чт–вс, пока я на даче","avail":["today","tomorrow","weekend"],"walk":3,"cov":false,"bay":7,"num":8,"street":"s3","spotId":"z7:7"},{"id":"l3","title":"Место у дома","zone":"z29","owner":"Игорь","rating":"4,7","rev":8,"hour":2.5,"day":12,"whenText":"каждый день, 9:00–18:00","avail":["today","tomorrow"],"walk":5,"cov":false,"bay":1,"num":2,"street":"s2","spotId":"z29:1"},{"id":"l4","title":"Место с зарядкой","zone":"z57","owner":"Ольга","rating":"4,8","rev":15,"hour":5,"day":25,"month":260,"whenText":"сб–вс, весь день","avail":["weekend"],"walk":5,"cov":false,"ev":true,"bay":1,"num":2,"street":"s2","spotId":"z57:1"},{"id":"l5","title":"Место у дома","zone":"z65","owner":"Дмитрий","rating":"4,6","rev":3,"month":220,"whenText":"с 1 ноября","avail":[],"walk":4,"cov":false,"bay":3,"num":4,"street":"s1","spotId":"z65:3"}]};
DISTRICT.accessible=MAP_EXTRAS.accessible;DISTRICT.chargers=MAP_EXTRAS.chargers;
