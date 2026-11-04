/* Место есть: вкладка «Сдать». Форма объявления: где место, даты, цена, предпросмотр, публикация.
   Блок «Я владелец места» подключается из features/owner/owner.js (через ownCall). */

var offer = {zone:'gA', from:null, to:null, cm:{y:today0.getFullYear(), m:today0.getMonth()}, allDay:true, t1:'09:00', t2:'18:00', free:false, hour:true, day:false, month:false, hp:'3', dp:'15', mp:'180', ev:false, num:'', own:false, terms:false};
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
function priceField(key, label, id){
  return '<div class="field" style="margin-bottom:12px"><label class="lbl" for="'+id+'" style="font-weight:500;font-size:14px">'+label+'</label><div class="inp"><input id="'+id+'" type="text" inputmode="decimal" autocomplete="off" value="'+esc(offer[key])+'" placeholder="0,00"><span>руб.</span></div></div>';
}
function previewListing(){
  var o = offer, l = {id:'prev', title:o.ev?'Место с зарядкой':'Крытое место', zone:o.zone, owner:state.user?state.user.name:'Вы', rating:'', whenText:rangeText() || 'выберите даты', avail:[], walk:3, cov:true, ev:o.ev, mine:true}, ok = false, v;
  if(o.free){ l.free = true; ok = true; }
  if(o.hour && !isNaN(v = parseP(o.hp))){ l.hour = v; ok = true; }
  if(o.day && !isNaN(v = parseP(o.dp))){ l.day = v; ok = true; }
  if(o.month && !isNaN(v = parseP(o.mp))){ l.month = v; ok = true; }
  return ok ? l : null;
}
function previewHtml(){ var l = previewListing(); return l ? card(l, true) : '<p class="muted sm" style="margin:0 4px 12px">Выберите формат и введите цену, здесь появится карточка.</p>'; }
function offerView(){
  var o = offer, fmt = function(k, name){ return '<button type="button" class="chip"'+A('fmt',k)+' aria-pressed="'+o[k]+'">'+name+'</button>'; };
  return '<h1 class="h1">Сдать своё место</h1>' +
    '<section class="card">' +
    '<div class="field"><div class="lbl">1. Где место</div><div class="chips wrap"><button type="button" class="chip"'+A('ozone','gA')+' aria-pressed="'+(o.zone==='gA')+'">Паркинг A</button><button type="button" class="chip"'+A('ozone','gB')+' aria-pressed="'+(o.zone==='gB')+'">Паркинг B</button></div></div>' +
    '<div class="field"><div class="lbl">2. Когда свободно</div><p class="sm muted">Нажмите первый день, затем последний. Один день: нажмите его дважды.</p>' + calHtml() +
    '<div class="range">'+(o.from ? rangeText() : 'Даты не выбраны')+'</div>' +
    '<label class="opt"><input type="checkbox" class="sw" id="of-all"'+(o.allDay?' checked':'')+'><span>Весь день</span></label>' +
    (o.allDay ? '' : '<div class="two"><div><label class="sm muted" for="of-t1">С</label><input id="of-t1" type="time" value="'+o.t1+'"></div><div><label class="sm muted" for="of-t2">До</label><input id="of-t2" type="time" value="'+o.t2+'"></div></div>') + '</div>' +
    '<div class="field"><div class="lbl">3. Как сдаёте</div><div class="chips wrap">'+fmt('free','Бесплатно')+fmt('hour','Почасово')+fmt('day','Посуточно')+fmt('month','Помесячно')+'</div>' +
    (o.hour?priceField('hp','Цена за час','of-hp'):'') + (o.day?priceField('dp','Цена за сутки','of-dp'):'') + (o.month?priceField('mp','Цена за месяц','of-mp'):'') +
    '</div>' +
    '<div class="field" style="margin-bottom:0"><div class="lbl">4. Детали</div><input id="of-num" type="text" inputmode="numeric" placeholder="Номер места, виден только после брони" value="'+esc(o.num)+'" aria-label="Номер места"><label class="opt"><input type="checkbox" class="sw" id="of-ev"'+(o.ev?' checked':'')+'><span>Есть зарядка для электромобиля</span></label></div></section>' +
    '<div class="lbl" style="margin:4px 4px 8px">Так увидят ваше место</div><div id="prev">'+previewHtml()+'</div>' +
    '<section class="card"><div class="lbl" style="margin-bottom:10px">Как оформляется сделка</div><ol class="steps"><li>Гость отправляет запрос и принимает условия.</li><li>Вы подтверждаете запрос в приложении.</li><li>Договор формируется сам из данных обеих сторон и принимается онлайн. Бумаги не нужны.</li></ol></section>' +
    ownCall('gate','') +
    '<label class="opt" style="margin-bottom:12px"><input type="checkbox" class="ck" id="of-terms"'+(o.terms?' checked':'')+'><span>Принимаю <button type="button" class="linkbtn"'+A('doc','terms')+'>соглашение</button> и <button type="button" class="linkbtn"'+A('doc','offer')+'>оферту</button> сервиса</span></label>' +
    '<button type="button" class="cta"'+A('publish')+'>Опубликовать</button>';
}

function syncText(){ var v = $('#of-num'); if(v) offer.num = v.value; }

VIEWS.offer = offerView;

act('fmt', function(v){ syncText(); offer[v] = !offer[v]; render(); });
act('ozone', function(v){ syncText(); offer.zone = v; render(); });
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
  syncText();
  var pv = previewListing();
  if(!state.user){ AUTH.needAccount('Чтобы сдать место, войдите в аккаунт'); return; }
  if(!state.user.pid){ AUTH.needPassport('Чтобы сдавать место, добавьте паспортные данные: они нужны для договора'); return; }
  if(!ownCall('canPublish', true)){ toast('Сначала подтвердите, что вы владелец места'); ownCall('go'); return; }
  if(!offer.from){ toast('Выберите даты, когда место свободно'); return; }
  if(!pv){ toast('Выберите формат и введите цену'); return; }
  if(!offer.num.trim()){ toast('Укажите номер места'); return; }
  if(!offer.terms){ toast('Примите соглашение и оферту'); return; }
  var l = {id:'m'+(state.nextId++), mine:true, title:pv.title, zone:offer.zone, owner:state.user.name, rating:'', whenText:rangeText(), avail:[], walk:3, cov:true, ev:offer.ev};
  if(pv.free) l.free = true; if(pv.hour) l.hour = pv.hour; if(pv.day) l.day = pv.day; if(pv.month) l.month = pv.month;
  state.mine.unshift(l);
  emit('publish', {listing:l, offer:{zone:offer.zone, from:offer.from, to:offer.to, allDay:offer.allDay, t1:offer.t1, t2:offer.t2, free:offer.free, hour:offer.hour, day:offer.day, month:offer.month, hp:offer.hp, dp:offer.dp, mp:offer.mp, ev:offer.ev, num:offer.num}});
  offer.num = ''; offer.own = false; offer.terms = false; offer.from = null; offer.to = null;
  state.tab = 'rent'; render(true); toast('Место опубликовано');
});

onChange('of-ev', function(el){ syncText(); offer.ev = el.checked; render(); });
onChange('of-all', function(el){ syncText(); offer.allDay = el.checked; render(); });
onChange('of-own', function(el){ offer.own = el.checked; });
onChange('of-terms', function(el){ offer.terms = el.checked; });
onInput('of-num', function(val){ offer.num = val; });
['of-hp', 'of-dp', 'of-mp'].forEach(function(id){ onInput(id, function(val){ offer[id.slice(3)] = val; $('#prev').innerHTML = previewHtml(); }); });
['of-t1', 'of-t2'].forEach(function(id){ onInput(id, function(val){ offer[id.slice(3)] = val; }); });
