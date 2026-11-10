(function () {
  var TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  var NATIVE_ZOOM = 19, MAX_ZOOM = 21;
  var BASEMAPS = {
    soft: { url: TILES, native: NATIVE_ZOOM, attr: ATTR, cls: 'tiles-soft' },   /* OpenStreetMap, приглушённая под цвета страницы (фильтр в mesto-map.css) */
    osm:  { url: TILES, native: NATIVE_ZOOM, attr: ATTR, cls: '' }              /* обычная OpenStreetMap */
  };
  /* какая подложка: адрес ?map=flat | soft | osm главнее всего; потом MESTO_CONFIG.basemap; иначе приглушённая карта OpenStreetMap.
     При открытии двойным кликом (file://) сайт плиток блокирует запросы, поэтому там сразу ровный бежевый фон, как в ролике */
  function defaultBasemap() {
    var q = /[?&]map=(flat|soft|osm)\b/.exec(location.search);
    if (q) return q[1];
    var c = window.MESTO_CONFIG && window.MESTO_CONFIG.basemap;
    if (c) return c;
    return (location.protocol === 'file:' && !/Electron/.test(navigator.userAgent)) ? 'flat' : 'soft';
  }

  var holder = null, map = null, markLayer = null, youMarker = null, items = [];

  function ll(c) { return [c[1], c[0]]; }            /* [lng,lat] -> [lat,lng] */
  function cssVar(n, d) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d; }
  /* красивые места и машинки живут в features/map/spots.js; если файл не загрузился, карта рисуется по-старому */
  function spots(fn) { try { if (typeof SPOTS !== 'undefined') return fn(SPOTS); } catch (err) { if (window.console) console.warn('[spots]', err); } }

  function allBounds() {
    var pts = [];
    ZS.forEach(function (z) { z.bc.forEach(function (c) { pts.push(ll(c)); }); });
    return L.latLngBounds(pts);
  }
  function padding() {   /* отступы под панель */
    return window.innerWidth >= 960
      ? { paddingTopLeft: [430, 30], paddingBottomRight: [30, 30] }
      : { paddingTopLeft: [16, 64], paddingBottomRight: [16, Math.min(480, (function () { var sh = document.querySelector('.sheet'); return sh ? Math.round(sh.offsetHeight + 96) : 300; })()) ] };
  }
  function fitAll(animate) {
    var o = L.extend({ maxZoom: 19 }, padding());
    if (animate) map.flyToBounds(allBounds(), o);
    else map.fitBounds(allBounds(), L.extend(o, { animate: false }));
  }

  function init() {
    map = L.map(holder, { zoomControl: false, preferCanvas: true, zoomSnap: 0.5, minZoom: 15, maxZoom: MAX_ZOOM });
    /* подложка: 'soft' (приглушённая OpenStreetMap), 'osm' (обычная) или 'flat' (ровный бежевый фон, как в ролике); выбор в defaultBasemap() */
    var bm = BASEMAPS[defaultBasemap()];
    if (bm) { map.attributionControl.setPrefix(false); map.attributionControl.setPosition('topright'); }
    else map.removeControl(map.attributionControl);
    fitAll(false);   /* первый вид нужен ДО слоёв: с preferCanvas слои мест иначе падают (renderer ещё не готов) и вместо карты остаётся заглушка */
    if (bm) (function () {
    var tl = L.tileLayer(bm.url, { maxNativeZoom: bm.native, maxZoom: MAX_ZOOM, attribution: bm.attr, className: bm.cls }).addTo(map);
    /* если плитки не грузятся (нет интернета, блокировка), остаётся ровный фон, без битых квадратов */
    var tOk = 0, tBad = 0;
    tl.on('tileload', function () { tOk++; });
    tl.on('tileerror', function () { if (++tBad >= 3 && !tOk && map.hasLayer(tl)) { map.removeLayer(tl); map.attributionControl.remove(); } });
    })();

    spots(function (S) { S.attach(map); });           /* асфальт под зонами: слой идёт раньше мест */

    ZS.forEach(function (z) {
      z.bays.forEach(function (b, k) {
        var pts = spots(function (S) { return S.slotLatLngs(z, k); }) || b.poly.map(ll);
        var pg = L.polygon(pts, { weight: 0.6, smoothFactor: 0, lineJoin: 'round', lineCap: 'round' }).addTo(map);
        pg.on('click', function () { state.sel = z.id; state.spot = k; state.layer = 'places'; render(); });
        items.push({ pg: pg, z: z, k: k });
      });
    });
    markLayer = L.layerGroup().addTo(map);
    fitAll(false);
    map.setMaxBounds(allBounds().pad(2));
    /* открываем сразу выбранный двор: места, номера и машинки видны с первого экрана. Весь район: кнопка справа */
    var z0 = zone(state.sel);
    if (z0 && z0.bc && z0.bc.length) map.fitBounds(L.latLngBounds(z0.bc.map(ll)), L.extend({ maxZoom: 19.5, animate: false }, padding()));
    map.on('zoomend', draw);
    spots(function (S) { S.start(); });
  }

  function dot(c, fill, r, text, onClick) {
    var m = L.circleMarker(ll(c), { radius: r, fillColor: fill, fillOpacity: 1,
      color: cssVar('--ink', '#0E100D'), weight: 2 }).bindTooltip(text);
    if (onClick) m.on('click', onClick);
    m.addTo(markLayer);
  }

  function draw() {
    if (!map) return;
    var cFree = cssVar('--lime', '#C9F54E'), cBusy = cssVar('--z-lo', '#171A14');
    var fade = state.layer === 'places' ? 0.92 : 0.3;
    spots(function (S) { S.colors(); });
    items.forEach(function (it) {
      var on = it.z.id === state.sel && state.layer === 'places';
      var st = spots(function (S) { return S.bayStyle(it.z, it.k, S.isFree(it.z, it.k), { fade: fade, on: on }); });
      if (!st) {   /* без spots.js: простая раскраска по оценке зоны */
        var isFree = it.z.rank[it.k] < freeEst(it.z, T());
        st = { fillColor: isFree ? cFree : cBusy, fillOpacity: fade, color: cssVar('--ink', '#0E100D'), opacity: on ? 1 : 0.35, weight: on ? 2 : 0.6 };
      }
      it.pg.setStyle(st);
      if (on && state.spot === it.k) it.pg.bringToFront();
    });
    spots(function (S) { S.updateSel(); S.sync(); });

    markLayer.clearLayers();
    if (state.layer === 'streets') {
      spots(function (S) {
        S.streetPills(markLayer, function (st) {
          state.sel = st.zones[0]; state.spot = null; state.layer = 'places'; render(); focusStreet(st.id);
        });
      });
    }
    if (state.layer === 'access') DISTRICT.accessible.forEach(function (a) {
      dot(a.ll, a.status === 'free' ? cFree : cBusy, 11, a.name + ': ' + (a.status === 'free' ? 'свободно' : 'занято')); });
    if (state.layer === 'ev') DISTRICT.chargers.forEach(function (c) {
      dot(c.ll, c.status === 'free' ? cFree : cBusy, 11, c.name + ': ' + (c.status === 'free' ? 'свободно' : 'занято')); });
  }

  function focusZone(id) {
    var z = zone(id);
    if (!z || !map) return;
    if (z.bc && z.bc.length) map.fitBounds(L.latLngBounds(z.bc.map(ll)), L.extend({ maxZoom: 20 }, padding()));
    else if (z.c) map.setView(ll(z.c), 19);
  }
  function focusStreet(id) {
    var s = street(id);
    if (!s || !map) return;
    map.fitBounds(L.latLngBounds(s.bc.map(ll)), L.extend({ maxZoom: 19 }, padding()));
  }
  function focusSpot(zid, k) {
    var z = zone(zid);
    if (!z || !map || !z.bays[k]) return;
    map.fitBounds(L.latLngBounds([ll(z.bays[k].c)]), L.extend({ maxZoom: 20.5 }, padding()));
  }

  function locate() {
    if (!navigator.geolocation) { toast('Геолокация недоступна в этом браузере'); return; }
    navigator.geolocation.getCurrentPosition(function (p) {
      var lat = p.coords.latitude, lng = p.coords.longitude;
      state.gps = { lat: lat, lng: lng, acc: Math.round(p.coords.accuracy) };
      var best = null, bd = 60;
      ZS.forEach(function (z) { z.bc.forEach(function (c) {
        var d = Math.hypot((c[0] - lng) * MX, (c[1] - lat) * MY);
        if (d < bd) { bd = d; best = z; } }); });
      if (best) { state.sel = best.id; state.spot = null; }
      if (youMarker) map.removeLayer(youMarker);
      youMarker = L.circleMarker([lat, lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(map);
      if (allBounds().pad(0.5).contains([lat, lng])) map.setView([lat, lng], Math.max(map.getZoom(), 19));
      else toast('Вы далеко от района');
      render();
    }, function () { toast('Не удалось определить местоположение'); }, { enableHighAccuracy: true, timeout: 10000 });
  }

  MAP.attach = function () {
    var slot = $('#mapslot');
    if (!slot) return;
    var first = !holder;
    if (first) { holder = document.createElement('div'); holder.className = 'mapbox'; }
    slot.appendChild(holder);              /* карта создаётся один раз, при перерисовке переносится */
    if (first) init(); else map.invalidateSize(false);
    draw();
  };
  MAP.draw = draw;
  MAP.focusZone = focusZone;
  MAP.focusStreet = focusStreet;
  MAP.focusSpot = focusSpot;
  MAP.onLayer = draw;
  MAP.map = function () { return map; };

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-a]');
    if (!t || !map) return;
    var a = t.getAttribute('data-a');
    if (a === 'fitall') fitAll(true);
    else if (a === 'locate') locate();
    else if (a === 'theme') setTimeout(function () { spots(function (S) { S.themeChanged(); }); draw(); }, 0);
  });
})();
