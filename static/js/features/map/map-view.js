/* Место есть: вкладка «Карта». Панель под картой, слои, прогноз, кнопки «Свободно / Занято».
   Сама карта (Leaflet) лежит в features/map/mesto-map.js и подключается через объект MAP:
   он даёт MAP.attach, MAP.draw, MAP.focusZone, MAP.onLayer. Без неё вместо карты будет заглушка. */

function mapAttachOrPlaceholder(){
if(MAP.attach){ try { MAP.attach(); return; } catch(err){ if(window.console) console.warn('[map]', err); } }   /* карта не загрузилась: показываем заглушку, остальное работает */
var slot = $('#mapslot');
if(slot) slot.innerHTML = '<div class="mapph"><div><b>Здесь будет карта района</b><span>Карту подключаем отдельным файлом. Остальное работает</span></div></div>';
}

function mapPart(){ return '<div id="legendwrap">' + legend() + '</div>'; }
function legend(){
  if(state.layer !== 'places') return '';
  return '<div class="legend"><span><i style="background:#C9F54E"></i>Свободно</span><span><i class="lg-car"></i>Занято, на месте машина</span><span>≈ число свободных это оценка по зоне</span><span>Номер места и машинки видны при приближении</span></div>';
}

var DEMO = true;   /* демо: отмечать можно без GPS. В боевой версии поставить false */
function canMark(z){ return z.type === 'perimeter' && (DEMO || !!state.gps); }
function whenLabel(t){ return (t.day === 'wd' ? 'будни' : 'выходные') + ', ' + hh(t.hour); }
function dock(){
  if(state.edit && MAP.editHtml) return MAP.editHtml();
  var L = state.layer, z = zone(state.sel), live = !state.mapFc, n = realNow();
  var tag = live ? '<span class="nowtag">Сейчас · '+n.dow+', '+n.time+'</span>' : '<button type="button" class="fctag"'+A('gonow')+'>Прогноз: '+whenLabel(state.fc)+' · вернуться к «сейчас»</button>';
  if(L === 'access'){
    return '<section class="dock"><div class="nm">Места для людей с инвалидностью</div><div class="sub">Статус обновляют жители</div><ul class="zl" style="margin-top:12px">' +
      DISTRICT.accessible.map(function(a){ return '<li><div class="irow"><span>'+a.name+'</span><span class="st '+a.status+'">'+(a.status==='free'?'Свободно':'Занято')+'</span></div></li>'; }).join('') +
      '</ul></section>';
  }
  if(L === 'ev'){
    return '<section class="dock"><div class="nm">Места с зарядкой</div><div class="sub">Электричество по договорённости с владельцем</div><ul class="zl" style="margin-top:12px">' +
      DISTRICT.chargers.map(function(c){ return '<li><div class="irow"><span>'+c.name+'</span><span class="st '+c.status+'">'+(c.status==='free'?'Свободно':'Занято')+'</span></div></li>'; }).join('') +
      '</ul><button type="button" class="dbtn"'+A('evrent')+'>Смотреть места с зарядкой</button></section>';
  }
  if(L === 'streets'){
    var ss = STREETS.map(function(st){ var f = 0; st.zones.forEach(function(zid){ var q = zone(zid); if(q) f += freeEst(q); }); return {s:st, f:f}; }).sort(function(x, y){ return y.f - x.f; });
    return '<section class="dock"><div class="nm">Улицы района</div><div class="sub">Где сейчас больше свободных мест. Нажмите на улицу, чтобы увидеть её зоны</div><ul class="zl" style="margin-top:12px">' +
      ss.map(function(r){ return '<li><button type="button"'+A('street', r.s.id)+'><span>'+esc(r.s.name)+'<small class="muted"> · '+r.s.zones.length+' '+plural(r.s.zones.length, 'зона', 'зоны', 'зон')+'</small></span><span class="ct">≈'+r.f+' из '+r.s.spots+'</span></button></li>'; }).join('') +
      '</ul></section>';
  }
  var last = state.marks.filter(function(m){ return m.zone === z.id; }).slice(-1)[0];
  var can = live && canMark(z), st = street(z.street), k = state.spot;
  var h = '<section class="dock"><div class="rowi"><span class="ico">'+ic('pin')+'</span><div class="rt"><small>'+esc(st ? st.name : 'Район')+'</small><b>'+esc(z.name)+'</b></div><span class="pill">шанс '+pct(z)+'%</span></div>' +
    '<div class="stat"><div class="big">≈'+freeEst(z)+'</div><div class="bt"><b>из '+z.spots+' мест свободно</b><span>'+lvlText(z)+'</span></div></div><div class="tagrow'+(live ? ' live' : '')+'" style="margin:2px 2px 0">'+tag+'</div>' +
    SPOTS.strip(z) + SPOTS.spotRow(z);
  if(can){
    h += '<div class="markfor">Отметить: <b>'+(k != null ? 'место №'+(k + 1) : 'всю зону')+'</b></div>' +
      '<div class="btns"><button type="button" class="bigbtn free"'+A('mark','free')+'>'+ic('check',22)+'Свободно</button><button type="button" class="bigbtn busy"'+A('mark','busy')+'>'+ic('x',22)+'Занято</button></div>';
    if(state.last && state.last.zone === z.id) h += '<div class="stamp"><span>Ваша отметка: <b>'+(state.last.spot ? 'место №'+state.last.spot+', ' : '')+(state.last.kind==='free'?'свободно':'занято')+'</b> в '+state.last.time+'</span><button type="button"'+A('undo')+'>Отменить</button></div>';
    else h += '<div class="dockhint h-mob" style="margin-top:8px">'+(state.gps ? 'Зона определена по GPS. Один тап, без подтверждений.' : 'Один тап, без подтверждений. Можно отметить зону целиком или конкретное место.')+'</div>';
    h += (typeof BONUS !== 'undefined' ? BONUS.line() : '');
  } else if(live){
    h += '<div class="dockhint">Чтобы отметить место, нужно находиться на парковке. Нажмите «Где я» справа на карте.</div>';
    if(last) h += '<div class="stamp"><span>Последняя отметка: <b>'+(last.kind==='free'?'свободно':'занято')+'</b> в '+last.time+'</span></div>';
  } else {
    h += '<div class="dockhint">Отметки «свободно / занято» доступны только для текущего момента.</div>';
  }
  return h + '</section>';
}
function fcResults(){
  var t = state.fc, list = perim().slice().sort(function(a,b){ return frac(b,t) - frac(a,t); }).slice(0,3);
  return '<div class="sm muted" style="margin-top:12px">Лучше всего приехать сюда ('+whenLabel(t)+'):</div><ul class="zl">' + list.map(function(z){
    return '<li><button type="button"'+A('zlist',z.id)+'><span>'+esc(z.label)+'</span><span class="ct">≈'+freeEst(z,t)+' · '+pct(z,t)+'%</span></button></li>'; }).join('') + '</ul>';
}

function moreHtml(){
  var t = state.fc, list = perim().slice().sort(function(a,b){ return frac(b) - frac(a); }).slice(0,6);
  return '<div class="card"><div class="lbl" style="margin-bottom:10px">Прогноз на другое время</div><div class="timecard"><div class="seg" role="group" aria-label="Тип дня"><button type="button"'+A('fcday','wd')+' aria-pressed="'+(t.day==='wd')+'">Будни</button><button type="button"'+A('fcday','we')+' aria-pressed="'+(t.day==='we')+'">Выходные</button></div>' +
    '<input id="hour" type="range" min="0" max="23" step="1" value="'+t.hour+'" aria-label="Время"><output id="fcout" for="hour">'+hh(t.hour)+'</output></div>' +
    '<div id="fcres">'+fcResults()+'</div>' +
    (state.mapFc ? '<button type="button" class="cta ghost" style="margin-top:12px;min-height:48px;font-size:15px"'+A('gonow')+'>Вернуться к «сейчас»</button>' : '<button type="button" class="cta" style="margin-top:12px;min-height:48px;font-size:15px"'+A('fcmap')+'>Показать на карте</button>') + '</div>' +
    '<div class="card"><div class="lbl">Свободнее всего сейчас</div><ul class="zl">' +
    list.map(function(z){ return '<li><button type="button"'+A('zlist',z.id)+'><span>'+esc(z.label)+'</span><span class="ct">≈'+freeEst(z)+' · '+pct(z)+'%</span></button></li>'; }).join('') + '</ul></div>' + mapPart();
}
function mapView(){
  var layers = [['places','Места','pin'],['streets','Улицы','park'],['access','Спецместа','wheel'],['ev','Зарядки','bolt']];
  return '<div class="stage"><div id="mapslot"></div>' +
    '<div class="topbar"><div class="chips" role="group" aria-label="Слои карты">' + (state.edit ? '<span class="chip" style="background:var(--lime);color:#0E100D;border:0">Режим разметки</span>' : layers.map(function(l){ return '<button type="button" class="chip"'+A('layer',l[0])+' aria-pressed="'+(state.layer===l[0])+'">'+ic(l[2])+l[1]+'</button>'; }).join('')) + '</div></div>' +
    (MAP.attach ? '<button type="button" class="locbtn"'+A('locate')+' aria-label="Где я">'+ic('loc',22)+'</button><button type="button" class="locbtn two"'+A('fitall')+' aria-label="Весь район">'+ic('all',22)+'</button>' : '') +
    '<aside class="sheet'+(state.sheetMin ? ' min' : '')+'" aria-label="Панель парковок">' + (state.edit ? '' : '<button type="button" class="grab"'+A('peek')+' aria-label="'+(state.sheetMin ? 'Развернуть панель' : 'Свернуть панель')+'" aria-expanded="'+(!state.sheetMin)+'"><i></i></button>') + '<div id="dockwrap">'+dock()+'</div>' +
    (state.edit ? '' : '<button type="button" class="moreb"'+A('more')+' aria-expanded="'+state.sheetMore+'">'+(state.sheetMore?'Скрыть':'Прогноз и список зон')+'<svg class="i" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>' +
    (state.sheetMore ? '<div id="morewrap">'+moreHtml()+'</div>' : '')) + '</aside></div>';
}

function refreshMap(){
  var sc = $('#strip'), left = sc ? sc.scrollLeft : 0, d = $('#dockwrap');
  if(d) d.innerHTML = dock();
  sc = $('#strip'); if(sc) sc.scrollLeft = left;
  var lg = $('#legendwrap'); if(lg) lg.innerHTML = legend();
  mapCall('draw');
}
function plural(n, a, b, c){ var m = n % 100, d = n % 10; return (m > 10 && m < 20) ? c : (d === 1 ? a : (d > 1 && d < 5 ? b : c)); }

VIEWS.map = mapView;

act('zone', function(v){ state.sel = v; state.spot = null; render(); });
act('zlist', function(v){ state.sel = v; state.spot = null; state.layer = 'places'; render(); mapCall('focusZone', v); });
act('street', function(v){ var st = street(v); if(!st) return; state.sel = st.zones[0]; state.spot = null; state.layer = 'places'; render(); mapCall('focusStreet', v); });
act('spot', function(v){
  var k = Number(v); state.spot = state.spot === k ? null : k; refreshMap();
  var sc = $('#strip'), t = sc && sc.querySelector('.sel'); if(t) sc.scrollLeft = t.offsetLeft - sc.clientWidth/2 + t.offsetWidth/2;
  if(state.spot != null) mapCall('focusSpot', state.sel, state.spot);
});
/* из объявления: показать это место на карте */
act('onmap', function(v){ var l = listing(v); if(!l) return; state.sel = l.zone; state.spot = l.bay; state.layer = 'places'; state.tab = 'map'; render(true); mapCall('focusSpot', l.zone, l.bay); });
act('fcday', function(v){ state.fc.day = v; render(); });
act('fcmap', function(){ state.mapFc = true; render(true); });
act('gonow', function(){ state.mapFc = false; var nn = realNow(); state.fc = {day:nn.day, hour:nn.hour}; render(true); });
act('layer', function(v){ state.layer = v; render(); mapCall('onLayer', v); });
act('peek', function(){ state.sheetMin = !state.sheetMin; render(); });
act('more', function(){ state.sheetMore = !state.sheetMore; render(); });
act('mark', function(v){
  var nw = realNow(), z = zone(state.sel), k = state.spot, m = {zone:state.sel, kind:v, hour:nw.hour, day:nw.day, time:nw.time};
  var award = (typeof BONUS !== 'undefined') ? BONUS.award(m, k) : null;
  if(k != null){   /* отметка конкретного места: машинка приезжает или уезжает, оценку всей зоны не двигаем */
    m.spot = k + 1; m.prevBusy = !SPOTS.isFree(z, k); m.sp = true;
    SPOTS.setBay(z, k, v === 'busy', 'user');
  } else state.marks.push(m);
  state.last = m; state.helped += 1; m.award = award ? award.pts : 0;
  emit('mark', {mark:m, gps:state.gps, spot:k != null ? k + 1 : null});
  toast('Отмечено в '+m.time + (award && award.pts ? '. +'+award.pts+' баллов' : '. '+({cool:'Баллы за это место уже начислены', fast:'Баллы можно получать раз в 2 минуты', cap:'На сегодня баллы за отметки закончились', far:'Баллы начисляются, когда вы рядом с зоной'}[award && award.why] || 'Увидят соседи')));
  refreshMap();
});
act('undo', function(){
  var m = state.last; emit('unmark', {mark:m});
  if(m && m.sp){ var z = zone(m.zone); if(z && state.over[z.id]) SPOTS.setBay(z, m.spot - 1, m.prevBusy, 'user'); }
  var i = state.marks.indexOf(m);
  if(i >= 0) state.marks.splice(i,1);
  state.helped = Math.max(0, state.helped-1);
  if(m && typeof BONUS !== 'undefined') BONUS.revoke(m);
  state.last = null; toast('Отметка отменена'); refreshMap();
});
act('evrent', function(){ state.fEv = true; state.zoneFilter = ''; state.tab = 'rent'; render(true); });
onInput('hour', function(val){
  state.fc.hour = Number(val); $('#fcout').textContent = hh(state.fc.hour); $('#fcres').innerHTML = fcResults(); if(state.mapFc) refreshMap();
});
