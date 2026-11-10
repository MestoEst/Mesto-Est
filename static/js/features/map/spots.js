/* Место есть: красивые места, машинки, номера и «уехал-приехал».
   Подключается после core/state.js и до features/map/map-view.js. Здесь два слоя:
     1) без карты: состояние места (свободно/занято), ряд мест зоны в панели, машинка-картинка;
     2) с Leaflet (SPOTS.attach из mesto-map.js): асфальт под зонами, машинки на занятых местах,
        номера мест, подписи зон и улиц, демо-движение машин.
   Если Leaflet не загрузился, слой 2 не включается, а слой 1 (ряд мест в панели) продолжает работать.

   «Занято» сейчас оценка по зоне (см. state.js). Когда сервер начнёт присылать is_occupied для каждого места,
   достаточно подставить его в SPOTS.isFree (одна функция ниже). */
var SPOTS = (function(){
  var MIN_ZOOM = 18, NUM_ZOOM = 19.5, ZONE_ZOOM = 17.5, GAP_M = 0.43;
  var BODY = [['#1d211b', '#2a2f27'], ['#f2f2ed', '#e1e1da'], ['#a9aea4', '#bfc3b9'], ['#2e4259', '#3b536f'], ['#6f3039', '#843d48'], ['#c9ccc4', '#d9dcd4']];

  state.spot = null;      /* выбранное место (номер в зоне, с нуля) */
  state.over = {};        /* что поменялось на местах: {зона: {номер: {busy, by, at}}} */

  /* ---------- 1. чистые функции ---------- */
  function hash(s){ var h = 2166136261; for(var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; }
  function key(z, k){ return z.id + ':' + k; }
  function variant(z, k){ return Math.floor(hash('v' + key(z, k)) * BODY.length); }

  /* форма места: центр, длина, ширина, угол (метры, x на восток, y на юг) */
  function shape(p){
    var n = p.length, cx = 0, cy = 0, i;
    if(n > 1 && p[0][0] === p[n-1][0] && p[0][1] === p[n-1][1]) n--;
    for(i = 0; i < n; i++){ cx += p[i][0]; cy += p[i][1]; } cx /= n; cy /= n;
    var sxx = 0, syy = 0, sxy = 0;
    for(i = 0; i < n; i++){ var dx = p[i][0] - cx, dy = p[i][1] - cy; sxx += dx*dx; syy += dy*dy; sxy += dx*dy; }
    var th = 0.5*Math.atan2(2*sxy, sxx - syy), ux = Math.cos(th), uy = Math.sin(th), vx = -uy, vy = ux;
    var a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    for(i = 0; i < n; i++){
      var qx = p[i][0] - cx, qy = p[i][1] - cy, a = qx*ux + qy*uy, b = qx*vx + qy*vy;
      if(a < a0) a0 = a; if(a > a1) a1 = a; if(b < b0) b0 = b; if(b > b1) b1 = b;
    }
    var la = a1 - a0, lb = b1 - b0, len, wid, ang;
    if(la >= lb){ len = la; wid = lb; ang = th; } else { len = lb; wid = la; ang = th + Math.PI/2; }
    return {cx:cx, cy:cy, len:len, wid:wid, ux:Math.cos(ang), uy:Math.sin(ang), rot:ang*180/Math.PI - 90};
  }
  var geo = {};
  function info(z, k){
    var id = key(z, k), g = geo[id];
    if(g) return g;
    var b = z.bays[k], c0 = b.c;
    var pts = b.poly.map(function(c){ return [(c[0] - c0[0])*MX, -(c[1] - c0[1])*MY]; });
    var sh = shape(pts), L = Math.min(sh.len*0.86, 4.5), W = L*0.4;
    if(W > sh.wid*0.82){ W = sh.wid*0.82; L = W/0.4; }
    var flip = hash('f' + id) > 0.5 ? 180 : 0;
    /* слот чуть меньше места: между местами остаётся разметка. Углы скругляет обводка той же краски */
    var kl = Math.max(0.5, (sh.len - 2*GAP_M)/sh.len), kw = Math.max(0.5, (sh.wid - 2*GAP_M)/sh.wid), ex = Math.cos(sh.rot*Math.PI/180 + Math.PI/2), ey = Math.sin(sh.rot*Math.PI/180 + Math.PI/2);
    var slot = pts.map(function(p){
      var dx = p[0] - sh.cx, dy = p[1] - sh.cy, a = dx*ex + dy*ey, bb = -dx*ey + dy*ex;
      a *= kl; bb *= kw;
      return [c0[0] + (sh.cx + a*ex - bb*ey)/MX, c0[1] - (sh.cy + a*ey + bb*ex)/MY];
    });
    g = geo[id] = {ll:[c0[1], c0[0]], rot:sh.rot + flip, u:L/90, v:variant(z, k), slot:slot, wid:sh.wid, len:sh.len};
    return g;
  }
  function slotLatLngs(z, k){ return info(z, k).slot.map(function(c){ return [c[1], c[0]]; }); }

  /* машинка сверху, носом вверх. viewBox: -3 0 46 90 */
  function carInner(v){
    var c = BODY[v % BODY.length];
    return '<rect x="2" y="1" width="36" height="88" rx="13" fill="'+c[0]+'"/>' +
      '<rect x="2" y="1" width="36" height="88" rx="13" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1"/>' +
      '<rect x="-1" y="29" width="5" height="8" rx="2.4" fill="'+c[0]+'"/><rect x="36" y="29" width="5" height="8" rx="2.4" fill="'+c[0]+'"/>' +
      '<rect x="7" y="36" width="26" height="24" rx="8" fill="'+c[1]+'"/>' +
      '<path d="M7.5 33 Q20 26 32.5 33 L30.5 41 Q20 37 9.5 41 Z" fill="#12161a" opacity=".88"/>' +
      '<path d="M9.5 58 Q20 62.5 30.5 58 L32.5 65 Q20 70 7.5 65 Z" fill="#12161a" opacity=".88"/>' +
      '<rect x="6" y="3" width="9" height="3.2" rx="1.6" fill="#fff4c2"/><rect x="25" y="3" width="9" height="3.2" rx="1.6" fill="#fff4c2"/>' +
      '<rect x="6" y="83.8" width="9" height="2.8" rx="1.4" fill="#d9483b"/><rect x="25" y="83.8" width="9" height="2.8" rx="1.4" fill="#d9483b"/>';
  }
  function carSVG(v, w, h){ return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 0 46 90" width="'+w+'" height="'+h+'" aria-hidden="true">'+carInner(v)+'</svg>'; }

  /* ---------- состояние: свободно или занято ---------- */
  var baseFree = freeEst;      /* оценка по зоне из state.js */
  function baseIsFree(z, k, t){ return z.rank[k] < baseFree(z, t); }
  function isNow(t){ return t === undefined && !state.mapFc; }
  function over(z, k){ var o = state.over[z.id]; return o && o[k]; }
  function isFree(z, k, t){
    if(isNow(t)){ var o = over(z, k); if(o) return !o.busy; }
    return baseIsFree(z, k, t);
  }
  /* счётчик «≈N свободно» учитывает машины, которые приехали и уехали */
  freeEst = function(z, t){
    var n = baseFree(z, t), o = state.over[z.id];
    if(!o || !z.rank || !isNow(t)) return n;
    var d = 0;
    Object.keys(o).forEach(function(k){ var base = z.rank[k] < n; if(o[k].busy && base) d--; else if(!o[k].busy && !base) d++; });
    return clamp(n + d, 0, z.spots);
  };
  function setBay(z, k, busy, by){
    var cur = isFree(z, k);
    if(cur === !busy && !over(z, k)){ /* уже так и есть: просто запомним, чтобы демо не трогало */ }
    (state.over[z.id] = state.over[z.id] || {})[k] = {busy:!!busy, by:by || 'user', at:Date.now()};
    if(cur !== !busy) flip(z, k, !!busy);
  }
  function listingAt(zid, k){ return allListings().filter(function(l){ return l.zone === zid && l.bay === k; })[0]; }

  /* ---------- ряд мест в панели ---------- */
  /* o: {act:'spot' — что делает нажатие, sel: выбранное место, id, rent: показывать ли значок аренды} */
  function strip(z, o){
    o = o || {};
    var action = o.act || 'spot', cur = o.sel === undefined ? state.spot : o.sel, showRent = o.rent !== false;
    var h = '<div class="strip" id="'+(o.id || 'strip')+'" role="group" aria-label="Места зоны: нажмите, чтобы выбрать">';
    z.bays.forEach(function(b, k){
      var free = isFree(z, k), sel = cur === k, ls = showRent && listingAt(z.id, k);
      h += '<button type="button" class="bay '+(free ? 'free' : 'busy')+(sel ? ' sel' : '')+(ls ? ' rent' : '')+'"'+A(action, k)+' aria-pressed="'+sel+'" aria-label="Место №'+(k+1)+', '+(free ? 'свободно' : 'занято')+(ls ? ', сдаётся' : '')+'">' +
        (free ? '' : '<span class="car">'+carSVG(variant(z, k), '100%', '100%')+'</span>') + '<i>'+(k + 1)+'</i>' + (ls ? '<u>₽</u>' : '') + '</button>';
    });
    return h + '</div>';
  }
  function spotRow(z){
    if(state.spot == null || !z.bays[state.spot]) return '<div class="dockhint spotnote h-mob">Нажмите на место в ряду: покажем номер и можно отметить именно его.</div>';
    var k = state.spot, free = isFree(z, k), ls = listingAt(z.id, k);
    return '<div class="spotrow"><div class="sn">№'+(k + 1)+'</div><div class="sb"><b>'+(free ? 'Свободно' : 'Занято')+'</b><span>'+esc(z.label)+'</span></div>' +
      (ls ? '<button type="button" class="chip lime"'+A('book', ls.id)+'>Арендовать</button>' : '') + '</div>';
  }

  /* ---------- 2. Leaflet ---------- */
  var map = null, haloLayer = null, sel = null, halos = [], carLayer = null, numLayer = null, carM = {}, numM = {}, zoneM = {}, leaving = {}, fx = {}, lastZoom = null, simT = null;
  function ll(c){ return [c[1], c[0]]; }
  function cssVar(n, d){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d; }
  function ppm(){ var lat = map.getCenter().lat; return Math.pow(2, map.getZoom())*256/(40075016.686*Math.cos(lat*Math.PI/180)); }
  var C = {};
  function colors(){ C = {lime:cssVar('--lime', '#C9F54E'), slot:cssVar('--slot', '#CFC9BA'), zlo:cssVar('--z-lo', '#171A14'), ink:cssVar('--ink', '#0E100D'), asph:cssVar('--asph', '#DFDACD')}; }
  function haloColor(){ return C.asph; }

  /* 1-й шаг: слои под местами (асфальт). Вызывать до создания полигонов, карте вид пока не нужен */
  function attach(m){
    map = m; colors();
    haloLayer = L.layerGroup().addTo(map);
    sel = L.polyline([], {weight:8, color:C.ink, opacity:0.28, lineCap:'round', lineJoin:'round', interactive:false}).addTo(haloLayer);
    halos = [];
    ZS.forEach(function(z){ z.rl.forEach(function(r){
      halos.push({z:z, pl:L.polyline(r.seg.map(ll), {weight:8, color:haloColor(), opacity:1, lineCap:'round', lineJoin:'round', interactive:false}).addTo(haloLayer), d:Math.max(1.6, r.wd*5) + 3.2});
    }); });
    carLayer = L.layerGroup().addTo(map);
    numLayer = L.layerGroup().addTo(map);
  }
  /* 2-й шаг: когда у карты уже есть вид (после fitBounds) */
  function start(){
    map.on('zoomend', onZoom); map.on('moveend', sync);
    onZoom();
    startDemo();
  }
  function bayW(){ return Math.max(0.8, ppm()*GAP_M*1.4); }      /* толщина обводки слота, px: скругляет углы */
  function onZoom(){
    if(!map) return;
    var p = ppm();
    halos.forEach(function(h){ h.pl.setStyle({weight:Math.max(3, h.d*p)}); });
    updateSel(p);
    lastZoom = null; sync();
  }
  function updateSel(p){
    if(!sel) return;
    var z = zone(state.sel), lines = [], d = 3.2;
    if(z && z.rl && state.layer === 'places'){ z.rl.forEach(function(r){ lines.push(r.seg.map(ll)); d = Math.max(d, r.wd*5 + 3.2); }); }
    sel.setLatLngs(lines.length ? lines : []);
    sel.setStyle({weight:Math.max(5, d*(p || ppm()) + 4), opacity:lines.length ? 0.28 : 0, color:C.ink});
  }
  function themeChanged(){ if(!map) return; colors(); halos.forEach(function(h){ h.pl.setStyle({color:haloColor()}); }); updateSel(); }

  /* стиль полигона места. isFree: свободно; zoom ≥ 18: «подушка» под машинкой, ниже: тёмная заливка как раньше */
  function bayStyle(z, k, free, o){
    var near = map && map.getZoom() >= MIN_ZOOM, lime = C.lime;
    var busyFill = near ? C.slot : C.zlo;
    var fill = free ? lime : busyFill, picked = state.spot === k && z.id === state.sel && state.layer === 'places';
    var st = {fillColor:fill, fillOpacity:o.fade, color:fill, opacity:o.fade, weight:near ? bayW() : 0.6, lineJoin:'round', lineCap:'round'};
    if(!near){ st.color = o.on ? C.ink : fill; st.opacity = o.on ? 0.9 : 1; st.weight = o.on ? 1.6 : 0.8; }
    if(picked){ st.color = C.ink; st.opacity = 1; st.weight = near ? Math.max(2.4, bayW()*0.5) : 2.4; }
    return st;
  }

  /* машинка: размер зависит от приближения; анимация приезда и отъезда */
  function carIcon(z, k, arrive){
    var g = info(z, k), p = ppm(), w = Math.max(2, 46*g.u*p), h = Math.max(4, 90*g.u*p);
    return L.divIcon({className:'sc-car', iconSize:[w, h], iconAnchor:[w/2, h/2],
      html:'<div class="sc-rot" style="width:'+w.toFixed(1)+'px;height:'+h.toFixed(1)+'px;transform:rotate('+g.rot.toFixed(1)+'deg)"><div class="sc-slide'+(arrive ? ' arrive' : '')+'" style="--run:'+(h*1.15).toFixed(1)+'px">'+carSVG(g.v, '100%', '100%')+'</div></div>'});
  }
  function numIcon(z, k, free, p){
    var fs = clamp(p*1.25, 9, 26);
    return L.divIcon({className:'sp-num', iconSize:[0, 0], iconAnchor:[0, 0], html:'<span class="'+(free ? 'f' : 'b')+'" style="font-size:'+fs.toFixed(1)+'px">'+(k + 1)+'</span>'});
  }
  function zoneIcon(z){ return L.divIcon({className:'sp-zone', iconSize:[0, 0], iconAnchor:[0, 0], html:'<span>'+esc(z.name)+'</span>'}); }
  function elOf(m){ return m && m.getElement ? m.getElement() : null; }

  function sync(){
    if(!map || !carLayer) return;
    try { syncInner(); } catch(err){ if(window.console) console.warn('[spots]', err); }
  }
  function syncInner(){
    var zm = map.getZoom(), view = map.getBounds().pad(0.15), p = ppm(), fade = state.layer === 'places' ? 1 : 0.3;
    var wantC = {}, wantN = {}, wantZ = {}, resize = lastZoom !== zm;
    lastZoom = zm;
    ZS.forEach(function(z){
      if(zm >= ZONE_ZOOM && zm < NUM_ZOOM && state.layer === 'places' && view.contains(ll(z.c))){ wantZ[z.id] = z; }
      if(zm < MIN_ZOOM) return;
      z.bays.forEach(function(b, k){
        if(!view.contains([b.c[1], b.c[0]])) return;
        var id = key(z, k), free = isFree(z, k);
        if(!free){
          wantC[id] = 1;
          var m = carM[id];
          if(!m){ var arr = fx[id] === 'arrive'; m = carM[id] = L.marker(info(z, k).ll, {icon:carIcon(z, k, arr), interactive:false, keyboard:false, opacity:fade}).addTo(carLayer); if(arr) arrive(m); delete fx[id]; }
          else if(resize){ m.setIcon(carIcon(z, k, false)); m.setOpacity(fade); }
          else m.setOpacity(fade);
        }
        if(zm >= NUM_ZOOM && state.layer === 'places'){
          wantN[id] = 1;
          var nm = numM[id], st = free ? 'f' : 'b';
          if(!nm){ nm = numM[id] = L.marker(info(z, k).ll, {icon:numIcon(z, k, free, p), interactive:false, keyboard:false}).addTo(numLayer); nm._st = st; nm._z = zm; }
          else if(nm._st !== st || nm._z !== zm){ nm.setIcon(numIcon(z, k, free, p)); nm._st = st; nm._z = zm; }
        }
      });
    });
    Object.keys(carM).forEach(function(id){ if(!wantC[id] && !leaving[id]){ carLayer.removeLayer(carM[id]); delete carM[id]; } });
    Object.keys(numM).forEach(function(id){ if(!wantN[id]){ numLayer.removeLayer(numM[id]); delete numM[id]; } });
    Object.keys(zoneM).forEach(function(id){ if(!wantZ[id]){ numLayer.removeLayer(zoneM[id]); delete zoneM[id]; } });
    Object.keys(wantZ).forEach(function(id){ if(!zoneM[id]) zoneM[id] = L.marker(ll(wantZ[id].c), {icon:zoneIcon(wantZ[id]), interactive:false, keyboard:false}).addTo(numLayer); });
  }
  function arrive(m){ setTimeout(function(){ var e = elOf(m), s = e && e.querySelector('.sc-slide'); if(s) s.classList.remove('arrive'); }, 40); }

  /* машина приехала (busy) или уехала: вызывается при отметке и в демо */
  function flip(z, k, busy){
    var id = key(z, k);
    if(busy){ fx[id] = 'arrive'; return; }
    var m = carM[id];
    if(m){
      leaving[id] = 1;
      var e = elOf(m), s = e && e.querySelector('.sc-slide'); if(s) s.classList.add('leave');
      setTimeout(function(){ delete leaving[id]; sync(); }, 1000);
    }
  }

  /* улицы: подписи на карте в слое «Улицы» */
  function streetPills(group, onPick){
    STREETS.forEach(function(st){
      var free = 0; st.zones.forEach(function(zid){ var z = zone(zid); if(z) free += freeEst(z); });
      var m = L.marker(ll(st.c), {icon:L.divIcon({className:'sp-street', iconSize:[0, 0], iconAnchor:[0, 0], html:'<span><b>'+esc(st.name)+'</b><i>≈'+free+'</i></span>'}), keyboard:false});
      m.on('click', function(){ onPick(st); });
      m.addTo(group);
    });
  }

  /* демо-движение: машины сами приезжают и уезжают. По умолчанию ВЫКЛЮЧЕНО: машинки меняются только когда человек отмечает место.
     Включить для показа: добавить к адресу ?live. В боевой версии вместо этого придут отметки жителей и is_occupied с сервера */
  var SIM_MS = 2300, pressing = false;
  document.addEventListener('pointerdown', function(){ pressing = true; }, true);
  document.addEventListener('pointerup', function(){ setTimeout(function(){ pressing = false; }, 250); }, true);
  document.addEventListener('pointercancel', function(){ pressing = false; }, true);
  function startDemo(){
    if(simT || !/[?&]live\b/.test(location.search)) return;
    simT = setInterval(tick, SIM_MS);
  }
  function tick(){
    if(typeof DEMO !== 'undefined' && !DEMO) return;
    if(!map || document.hidden || state.tab !== 'map' || state.mapFc || state.edit || map.getZoom() < 17.5) return;
    var view = map.getBounds(), c = [], now = Date.now();
    ZS.forEach(function(z){ z.bays.forEach(function(b, k){
      if(!view.contains([b.c[1], b.c[0]])) return;
      var o = over(z, k); if(o && o.by === 'user' && now - o.at < 600000) return;
      if(z.id === state.sel && state.spot === k) return;
      c.push([z, k]);
    }); });
    if(!c.length) return;
    var pick = c[Math.floor(Math.random()*c.length)], z = pick[0], k = pick[1];
    setBay(z, k, isFree(z, k), 'sim');
    mapCall('draw');
    var d = $('#dockwrap'); if(d && !pressing && typeof dock === 'function'){ var sc = $('#strip'), left = sc ? sc.scrollLeft : 0; d.innerHTML = dock(); sc = $('#strip'); if(sc) sc.scrollLeft = left; }
  }

  return {
    isFree:isFree, setBay:setBay, strip:strip, spotRow:spotRow, listingAt:listingAt, carSVG:carSVG, variant:variant,
    attach:attach, start:start, colors:colors, sync:sync, onZoom:onZoom, themeChanged:themeChanged, updateSel:updateSel, bayStyle:bayStyle, slotLatLngs:slotLatLngs, info:info,
    streetPills:streetPills, ppm:function(){ return map ? ppm() : 1; }, nearZoom:function(){ return !!map && map.getZoom() >= MIN_ZOOM; }
  };
})();
