/* Место есть: вкладка «Сдать». Форма объявления: где место, даты, цена, предпросмотр, публикация.
   Блок «Я владелец места» подключается из features/owner/owner.js (через ownCall). */

/* формат аренды выбирается один: бесплатно, почасово, посуточно или помесячно */
var LIMITS = {hour:[1, 25]};      /* лимит цены, белорусских руб. (BYN): час от 1 до 25. Диапазон задаёт платформа */
var PUB_DOCS = ['terms', 'offer', 'privacy'];
var offer = (function(){ var z = zone(defSel()) || {street:'',id:''}; return {street:z.street, zone:z.id, spotId:null, spot:1, from:null, to:null, cm:{y:today0.getFullYear(), m:today0.getMonth()}, allDay:true, t1:'09:00', t2:'18:00', fmt:'hour', hp:'3', dp:'15', mp:'180', ev:false, own:false}; })();
function selectOfferBay(z,id){
  if(!z || !z.bays.length)return;
  var b=z.bays.find(function(b){return b.id===id;})||z.bays[0];
  offer.zone=z.id;offer.street=z.street;offer.spotId=b.id;offer.spot=b.num;
}
function syncOfferBay(){
  var found=false;ZS.forEach(function(z){if(z.bays.some(function(b){return b.id===offer.spotId;})){selectOfferBay(z,offer.spotId);found=true;}});
  if(!found)selectOfferBay(zone(offer.zone)||ZS[0],null);
}
function rangeText(){
  var o = offer;
  if(!o.from) return '';
  var f = pdate(o.from), t = pdate(o.to || o.from), txt;
  if(o.to && o.to !== o.from){ txt = (f.getMonth() === t.getMonth()) ? f.getDate()+'–'+t.getDate()+' '+MS[t.getMonth()] : f.getDate()+' '+MS[f.getMonth()]+' – '+t.getDate()+' '+MS[t.getMonth()]; }
  else txt = f.getDate()+' '+MS[f.getMonth()];
  return txt + ', ' + (o.allDay ? 'весь день' : o.t1 + '–' + o.t2);
}
function calHtml(){
  var cm = offer.cm, first = new Date(cm.y, cm.m, 1), start = (first.getDay()+6)%7, dim = new Date(cm.y, cm.m+1, 0).getDate(), tdy = ymd(new Date()), i;
  var h = '<div class="cal"><div class="cal-h"><button type="button"'+A('cal','-1')+' aria-label="Предыдущий месяц">‹</button><b>'+MON[cm.m]+' '+cm.y+'</b><button type="button"'+A('cal','1')+' aria-label="Следующий месяц">›</button></div><div class="cal-g">' +
    ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(function(d){ return '<span class="dw">'+d+'</span>'; }).join('');
  for(i = 0; i < start; i++) h += '<span></span>';
  for(i = 1; i <= dim; i++){
    var s = ymd(new Date(cm.y, cm.m, i)), end = offer.to || offer.from;
    var inr = offer.from && s >= offer.from && s <= end, edge = s === offer.from || s === end;
    h += '<button type="button" class="day'+(edge?' edge':(inr?' in':''))+(s===tdy?' today':'')+'"'+A('cd',s)+(s < tdy?' disabled':'')+' aria-pressed="'+(!!edge)+'" aria-label="'+i+' '+MON[cm.m]+'">'+i+'</button>';
  }
  return h + '</div></div>';
}
function priceErr(){
  var o = offer, lim = LIMITS[o.fmt];
  if(o.fmt === 'free' || !lim) return '';
  var v = parseP(o[{hour:'hp', day:'dp', month:'mp'}[o.fmt]]);
  if(isNaN(v)) return 'Введите цену';
  if(v < lim[0] || v > lim[1]) return 'Цена за час от '+lim[0]+' до '+lim[1]+' руб.';
  return '';
}
function priceField(key, label, id, hint){
  var err = (offer.fmt === 'hour' && key === 'hp') ? priceErr() : '';
  return '<div class="field" style="margin-bottom:12px"><label class="lbl" for="'+id+'" style="font-weight:500;font-size:14px">'+label+'</label><div class="inp'+(err ? ' bad' : '')+'"><input id="'+id+'" type="text" inputmode="decimal" autocomplete="off" value="'+esc(offer[key])+'" placeholder="0,00"'+(err ? ' aria-invalid="true"' : '')+'><span>руб.</span></div>' +
    (hint ? '<div class="limit'+(err ? ' bad' : '')+'" id="'+id+'-h" data-hint="'+esc(hint)+'">'+esc(err || hint)+'</div>' : '') + '</div>';
}
function previewListing(){
  if(SPOT_DATA.status!=='ready')return null;syncOfferBay();
  var o = offer, z = zone(o.zone), l = {id:'prev', title:o.ev ? 'Место с зарядкой' : 'Место во дворе', zone:o.zone, spotId:o.spotId, bay:z ? z.bays.findIndex(function(b){return b.id===o.spotId;}) : -1, num:o.spot, street:o.street, owner:state.user ? state.user.name : 'Вы', rating:'', whenText:rangeText() || 'выберите даты', avail:[], walk:3, cov:false, ev:o.ev, mine:true}, v;
  if(!z) return null;
  if(o.fmt === 'free') l.free = true;
  else { v = parseP(o[{hour:'hp', day:'dp', month:'mp'}[o.fmt]]); if(isNaN(v)) return null; l[o.fmt] = v; }
  return l;
}
function previewHtml(){ var l = previewListing(); return l ? card(l, true) : '<p class="muted sm" style="margin:0 4px 12px">Введите цену, здесь появится карточка.</p>'; }
function whereHtml(){
  var o = offer, st = street(o.street), z = zone(o.zone);
  var h = '<div class="two"><div><label class="sm muted" for="of-st">Улица</label><select id="of-st">' + STREETS.map(function(s){ return '<option value="'+s.id+'"'+(s.id === o.street ? ' selected' : '')+'>'+esc(s.name)+'</option>'; }).join('') + '</select></div>' +
    '<div><label class="sm muted" for="of-zn">Зона</label><select id="of-zn">' + st.zones.map(function(id){ var q = zone(id); return '<option value="'+id+'"'+(id === o.zone ? ' selected' : '')+'>'+esc(q.name)+' · '+q.spots+' '+plural(q.spots, 'место', 'места', 'мест')+'</option>'; }).join('') + '</select></div></div>' +
    '<div class="sm muted" style="margin:12px 0 6px">Номер места: нажмите на своё</div>' + SPOTS.strip(z, {act:'opick', sel:o.spotId, id:'ostrip', rent:false}) +
    '<div class="spotrow"><div class="sn">№'+o.spot+'</div><div class="sb"><b>Ваше место</b><span>'+esc(z.label)+'</span></div></div>';
  return h;
}
function offerView(){
  if(SPOT_DATA.status!=='ready')return '<section class="card">Дождитесь загрузки мест на вкладке «Карта».</section>';syncOfferBay();
  var o = offer, fmt = function(k, name){ return '<button type="button" class="chip"'+A('fmt',k)+' aria-pressed="'+(o.fmt === k)+'">'+name+'</button>'; };
  var pf = o.fmt === 'hour' ? priceField('hp', 'Цена за час', 'of-hp', 'От '+LIMITS.hour[0]+' до '+LIMITS.hour[1]+' руб. в час. Диапазон задаёт платформа, чтобы цены оставались честными.')
    : o.fmt === 'day' ? priceField('dp', 'Цена за сутки', 'of-dp') : o.fmt === 'month' ? priceField('mp', 'Цена за месяц', 'of-mp') : '<p class="muted sm">Место отдаёте бесплатно, например соседям.</p>';
  return '<h1 class="h1">Сдать своё место</h1>' +
    '<section class="card">' +
    '<div class="field"><div class="lbl">1. Где место</div>'+whereHtml()+'</div>' +
    '<div class="field"><div class="lbl">2. Когда свободно</div><p class="sm muted">Нажмите первый день, затем последний. Один день: нажмите его дважды.</p>' + calHtml() +
    '<div class="range">'+(o.from ? rangeText() : 'Даты не выбраны')+'</div>' +
    '<label class="opt"><input type="checkbox" class="sw" id="of-all"'+(o.allDay?' checked':'')+'><span>Весь день</span></label>' +
    (o.allDay ? '' : '<div class="two"><div><label class="sm muted" for="of-t1">С</label><input id="of-t1" type="time" value="'+o.t1+'"></div><div><label class="sm muted" for="of-t2">До</label><input id="of-t2" type="time" value="'+o.t2+'"></div></div>') + '</div>' +
    '<div class="field"><div class="lbl">3. Как сдаёте <span class="muted sm" style="font-weight:400">(выберите один вариант)</span></div><div class="chips wrap" role="radiogroup" aria-label="Формат аренды">'+fmt('hour','Почасово')+fmt('day','Посуточно')+fmt('month','Помесячно')+fmt('free','Бесплатно')+'</div>' + pf + '</div>' +
    '<div class="field" style="margin-bottom:0"><div class="lbl">4. Детали</div><label class="opt"><input type="checkbox" class="sw" id="of-ev"'+(o.ev?' checked':'')+'><span>Есть зарядка для электромобиля</span></label><p class="hint" style="margin-top:0">Номер, улица и зона видны всем в объявлении: так гость точно знает, куда ехать.</p></div></section>' +
    '<div class="lbl" style="margin:4px 4px 8px">Так увидят ваше место</div><div id="prev">'+previewHtml()+'</div>' +
    '<section class="card"><div class="lbl" style="margin-bottom:10px">Как оформляется сделка</div><ol class="steps"><li>Гость отправляет запрос и принимает условия.</li><li>Вы подтверждаете запрос в приложении.</li><li>Договор формируется сам из данных обеих сторон и принимается онлайн. Бумаги не нужны.</li></ol></section>' +
    ownCall('gate','') +
    consentHtml('publish', PUB_DOCS) +
    '<button type="button" class="cta" style="margin-top:6px"'+A('publish')+'>Опубликовать</button>';
}

function syncText(){}

VIEWS.offer = offerView;

act('fmt', function(v){ offer.fmt = v; render(); });
act('opick', function(v){selectOfferBay(zone(offer.zone),v);render();});
act('cal', function(v){
  syncText(); offer.cm.m += Number(v);
  if(offer.cm.m > 11){ offer.cm.m = 0; offer.cm.y++; }
  if(offer.cm.m < 0){ offer.cm.m = 11; offer.cm.y--; }
  render();
});
act('cd', function(v){
  syncText();
  if(!offer.from || offer.to){ offer.from = v; offer.to = null; }
  else if(v < offer.from){ offer.from = v; }
  else { offer.to = v; }
  render();
});
act('publish', function(){
  var pv = previewListing();
  if(!state.user){ AUTH.needAccount('Чтобы сдать место, войдите в аккаунт'); return; }
  if(!state.user.pid){ AUTH.needPassport('Чтобы сдавать место, добавьте паспортные данные: они нужны для договора'); return; }
  if(!ownCall('canPublish', true)){ toast('Сначала подтвердите, что вы владелец места'); ownCall('go'); return; }
  if(!offer.from){ toast('Выберите даты, когда место свободно'); return; }
  var pe = priceErr(); if(pe){ toast(pe); return; }
  if(!pv){ toast('Введите цену'); return; }
  if(allListings().some(function(l){ return l.spotId === offer.spotId; })){ toast('Это место уже сдаётся. Выберите другое'); return; }
  var ce = consentCheck('publish', PUB_DOCS); if(ce){ toast(ce); return; }
  var l = {id:'m'+(state.nextId++), mine:true, title:pv.title, zone:offer.zone, spotId:offer.spotId, bay:pv.bay, num:offer.spot, street:offer.street, owner:state.user.name, rating:'', whenText:rangeText(), avail:[], walk:3, cov:false, ev:offer.ev};
  ['free', 'hour', 'day', 'month'].forEach(function(k){ if(pv[k]) l[k] = pv[k]; });
  state.mine.unshift(l);
  emit('publish', {listing:l, offer:{spotId:offer.spotId, zone:offer.zone, street:offer.street, spot:offer.spot, from:offer.from, to:offer.to, allDay:offer.allDay, t1:offer.t1, t2:offer.t2, free:offer.fmt === 'free', hour:offer.fmt === 'hour', day:offer.fmt === 'day', month:offer.fmt === 'month', hp:offer.hp, dp:offer.dp, mp:offer.mp, ev:offer.ev, num:String(offer.spot)}});
  consentReset('publish'); offer.own = false; offer.from = null; offer.to = null;
  state.tab = 'rent'; render(true); toast('Место опубликовано');
});

onChange('of-st', function(el){ var st = street(el.value); if(!st) return; offer.street = st.id; selectOfferBay(zone(st.zones[0]),null); render(); });
onChange('of-zn', function(el){ if(!zone(el.value)) return; selectOfferBay(zone(el.value),null); render(); });
onChange('of-ev', function(el){ offer.ev = el.checked; render(); });
onChange('of-all', function(el){ offer.allDay = el.checked; render(); });
onChange('of-own', function(el){ offer.own = el.checked; });
['of-hp', 'of-dp', 'of-mp'].forEach(function(id){ onInput(id, function(val){
  offer[id.slice(3)] = val; $('#prev').innerHTML = previewHtml();
  var h = $('#'+id+'-h'), err = priceErr(); if(h){ h.textContent = err || h.getAttribute('data-hint') || h.textContent; h.classList.toggle('bad', !!err); }
  var box = $('#'+id) && $('#'+id).parentNode; if(box) box.classList.toggle('bad', !!err);
}); });
['of-t1', 'of-t2'].forEach(function(id){ onInput(id, function(val){ offer[id.slice(3)] = val; }); });
