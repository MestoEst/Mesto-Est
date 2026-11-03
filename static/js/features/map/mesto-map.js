
(function () {
  var TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  var NATIVE_ZOOM = 19, MAX_ZOOM = 21;

  var holder = null, map = null, markLayer = null, youMarker = null, items = [];

  function ll(c) { return [c[1], c[0]]; }            /* [lng,lat] -> [lat,lng] */
  function cssVar(n, d) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d; }

  function allBounds() {
    var pts = [];
    ZS.forEach(function (z) { z.bc.forEach(function (c) { pts.push(ll(c)); }); });
    return L.latLngBounds(pts);
  }
  function padding() {   /* отступы под панель */
    return window.innerWidth >= 960
      ? { paddingTopLeft: [430, 30], paddingBottomRight: [30, 30] }
      : { paddingTopLeft: [16, 64], paddingBottomRight: [16, 300] };
  }
  function fitAll(animate) {
    var o = L.extend({ maxZoom: 19 }, padding());
    if (animate) map.flyToBounds(allBounds(), o);
    else map.fitBounds(allBounds(), L.extend(o, { animate: false }));
  }

  function init() {
    map = L.map(holder, { zoomControl: false, preferCanvas: true, zoomSnap: 0.5, minZoom: 15, maxZoom: MAX_ZOOM });
    map.attributionControl.setPrefix(false);
    map.attributionControl.setPosition('topright');
    L.tileLayer(TILES, { maxNativeZoom: NATIVE_ZOOM, maxZoom: MAX_ZOOM, attribution: ATTR }).addTo(map);

    ZS.forEach(function (z) {
      z.bays.forEach(function (b, k) {
        var pg = L.polygon(b.poly.map(ll), { weight: 0.6, smoothFactor: 0 }).addTo(map);
        pg.on('click', function () { state.sel = z.id; state.layer = 'places'; render(); });
        items.push({ pg: pg, z: z, k: k });
      });
    });
    markLayer = L.layerGroup().addTo(map);
    fitAll(false);
    map.setMaxBounds(allBounds().pad(2));
  }

  function dot(c, fill, r, text, onClick) {
    var m = L.circleMarker(ll(c), { radius: r, fillColor: fill, fillOpacity: 1,
      color: cssVar('--ink', '#0E100D'), weight: 2 }).bindTooltip(text);
    if (onClick) m.on('click', onClick);
    m.addTo(markLayer);
  }

  function draw() {
    if (!map) return;
    var t = T();
    var cFree = cssVar('--lime', '#C9F54E'), cBusy = cssVar('--z-lo', '#171A14'), cLine = cssVar('--ink', '#0E100D');
    var fade = state.layer === 'places' ? 0.92 : 0.3;
    var freeN = {};
    ZS.forEach(function (z) { freeN[z.id] = freeEst(z, t); });
    items.forEach(function (it) {
      var isFree = it.z.rank[it.k] < freeN[it.z.id];
      var on = it.z.id === state.sel && state.layer === 'places';
      it.pg.setStyle({ fillColor: isFree ? cFree : cBusy, fillOpacity: fade,
        color: cLine, opacity: on ? 1 : 0.35, weight: on ? 2 : 0.6 });
      if (on) it.pg.bringToFront();
    });

    markLayer.clearLayers();
    if (state.layer === 'parkings') {
      DISTRICT.zones.forEach(function (z) {
        if (z.type === 'garage') dot(z.c, cLine, 13, z.name + ': ' + z.freeDemo + ' своб. из ' + z.spots,
          function () { state.sel = z.id; render(); });
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

  function locate() {
    if (!navigator.geolocation) { toast('Геолокация недоступна в этом браузере'); return; }
    navigator.geolocation.getCurrentPosition(function (p) {
      var lat = p.coords.latitude, lng = p.coords.longitude;
      state.gps = { lat: lat, lng: lng, acc: Math.round(p.coords.accuracy) };
      var best = null, bd = 60;
      ZS.forEach(function (z) { z.bc.forEach(function (c) {
        var d = Math.hypot((c[0] - lng) * MX, (c[1] - lat) * MY);
        if (d < bd) { bd = d; best = z; } }); });
      if (best) state.sel = best.id;
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
  MAP.onLayer = draw;

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-a]');
    if (!t || !map) return;
    var a = t.getAttribute('data-a');
    if (a === 'fitall') fitAll(true);
    else if (a === 'locate') locate();
    else if (a === 'theme') setTimeout(draw, 0);
  });
})();