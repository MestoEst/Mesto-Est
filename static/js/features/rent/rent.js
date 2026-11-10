/* Место есть: вкладка «Аренда». Список мест, фильтры, бронь, договор, ответ владельца на запрос. */

function mainPrice(l){
  if(l.free && !l.hour && !l.day && !l.month) return ['Бесплатно',''];
  if(l.hour) return [fmtP(l.hour), 'руб. в час'];
  if(l.day) return [fmtP(l.day), 'руб. в сутки'];
  return [fmtP(l.month), 'руб. в месяц'];
}
function altPrice(l){
  var a = [];
  if(l.free && (l.hour||l.day||l.month)) a.push('можно бесплатно');
  if(l.hour && l.day) a.push(fmtP(l.day)+' руб./сутки');
  if(l.month && (l.hour||l.day)) a.push(fmtP(l.month)+' руб./мес');
  return a.join(' · ');
}
function lname(l){ return (l.num ? '№'+l.num+' · ' : '') + l.title; }
function card(l, preview){
  var p = mainPrice(l), alt = altPrice(l);
  return '<article class="l-card"><div class="l-head"><div><div class="l-title">'+(l.num ? '<span class="nn">№'+l.num+'</span>' : '')+l.title+'</div><div class="muted sm">'+esc(parkName(l))+' · '+l.walk+' мин пешком</div></div>' +
    (preview ? '' : '<div class="l-act"><button type="button" class="round soft"'+A('onmap',l.id)+' aria-label="Показать на карте: '+esc(lname(l))+'">'+ic('pin')+'</button><button type="button" class="round"'+A('book',l.id)+' aria-label="Забронировать: '+esc(lname(l))+'">'+ic('arrow')+'</button></div>') + '</div>' +
    '<div><div class="price">'+p[0]+(p[1]?'<small>'+p[1]+'</small>':'')+'</div>'+(alt?'<div class="alt">'+alt+'</div>':'')+'</div>' +
    '<div class="facts"><span class="fact">'+ic('cal')+l.whenText+'</span><span class="fact">'+ic('user')+esc(l.owner)+(l.rating?' · '+l.rating:'')+'</span>' +
    (l.ev?'<span class="fact lime">'+ic('bolt')+'Зарядка</span>':'')+(l.mine&&!preview?'<span class="fact lime">Ваше</span>':'')+ownCall('badge','',l)+'</div></article>';
}
function rentView(){
  var items = allListings().filter(function(l){
    if(state.when !== 'all' && l.avail.indexOf(state.when) < 0 && !l.mine) return false;
    if(state.fCov && !l.cov) return false; if(state.fEv && !l.ev) return false; if(state.fFree && !l.free) return false;
    if(state.zoneFilter && l.zone !== state.zoneFilter) return false; return true;
  });
  var whens = [['all','Любое время'],['today','Сегодня'],['tomorrow','Завтра'],['weekend','Выходные']];
  var mine = state.bookings.length ? '<section class="card"><div class="lbl" style="margin-bottom:10px">Мои брони</div>' + state.bookings.map(function(b){
    var l = listing(b.listing);
    return '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--line)"><div><b>'+l.title+'</b><div class="muted sm">'+b.when+', '+b.qtyText+' · '+(b.total?money(b.total):'бесплатно')+'</div></div><span class="st '+b.status+'">'+({request:'Запрос',confirmed:'Подтверждено',declined:'Отказ'})[b.status]+'</span></div>';
  }).join('') + '</section>' : '';
  return '<h1 class="h1">Места в аренде</h1>' +
    '<div class="chips" role="group" aria-label="Когда нужно">' + whens.map(function(w){ return '<button type="button" class="chip"'+A('when',w[0])+' aria-pressed="'+(state.when===w[0])+'">'+w[1]+'</button>'; }).join('') + '</div>' +
    '<div class="chips" role="group" aria-label="Фильтры"><button type="button" class="chip lime"'+A('flt','fFree')+' aria-pressed="'+state.fFree+'">Бесплатно</button><button type="button" class="chip lime"'+A('flt','fEv')+' aria-pressed="'+state.fEv+'">С зарядкой</button>' +
    (state.zoneFilter ? '<button type="button" class="chip"'+A('zf')+'>'+zone(state.zoneFilter).name+' ×</button>' : '') + '</div>' +
    mine + (items.length ? '<div class="lgrid">' + items.map(function(l){ return card(l); }).join('') + '</div>' : '<p class="muted">Ничего не нашлось. Попробуйте другое время или уберите фильтры.</p>') +
    '<p class="hint">Номер места, улица и зона указаны в каждом объявлении, их видно сразу.</p>';
}

/* ---------- бронь и договор (окно поверх страницы) ---------- */
var bk = null, BOOK_DOCS = ['offer', 'contract', 'privacy'];
function bookingHtml(){
  var l = listing(bk.id), fm = [];
  if(l.free) fm.push(['free','Бесплатно']); if(l.hour) fm.push(['hour','Час']); if(l.day) fm.push(['day','Сутки']); if(l.month) fm.push(['month','Месяц']);
  if(!bk.fmt || !fm.some(function(f){ return f[0] === bk.fmt; })) bk.fmt = fm[0][0];
  var maxq = bk.fmt==='hour' ? 12 : (bk.fmt==='month' ? 1 : 14);
  bk.qty = clamp(bk.qty, 1, maxq);
  var total = bk.fmt==='free' ? 0 : bk.fmt==='hour' ? l.hour*bk.qty : bk.fmt==='day' ? l.day*bk.qty : l.month*bk.qty;
  bk.total = total;
  return '<div class="l-title" style="font-size:22px">'+(l.num ? '<span class="nn">№'+l.num+'</span>' : '')+l.title+'</div><p class="muted sm" style="margin:2px 0 14px">'+esc(parkName(l))+' · '+esc(l.owner)+' · доступно: '+l.whenText+'</p>' +
    '<div class="chips wrap" style="margin-bottom:12px">'+fm.map(function(f){ return '<button type="button" class="chip"'+A('bf',f[0])+' aria-pressed="'+(bk.fmt===f[0])+'">'+f[1]+'</button>'; }).join('')+'</div>' +
    '<div class="two" style="margin-bottom:12px"><div><label class="sm muted" for="bk-d">Дата</label><input id="bk-d" type="date" min="'+ymd(new Date())+'" value="'+bk.date+'"></div><div><label class="sm muted" for="bk-t">Начало</label><input id="bk-t" type="time" value="'+bk.time+'"></div></div>' +
    (bk.fmt==='month' ? '' : '<div class="num" style="margin-bottom:6px"><span class="nm">'+(bk.fmt==='hour'?'Сколько часов':'Сколько суток')+'</span><div class="step"><button type="button"'+A('bq','-1')+' aria-label="Меньше">−</button><b>'+bk.qty+'</b><button type="button"'+A('bq','1')+' aria-label="Больше">+</button></div></div>') +
    '<div class="sum"><span class="muted">Итого</span><b>'+(total?money(total):'бесплатно')+'</b></div>' +
    '<div class="doc"><p><b>Договор сформируется автоматически</b></p><p>Из ваших данных и данных владельца. Вы принимаете его в приложении, владелец подтверждает запрос, и договор вступает в силу. Подписывать бумаги не нужно.</p><p><button type="button" class="linkbtn"'+A('doc','contract')+'>Посмотреть шаблон договора</button></p></div>' +
    consentHtml('book', BOOK_DOCS) +
    '<div class="two"><button type="button" class="cta ghost"'+A('close')+'>Отмена</button><button type="button" class="cta"'+A('send')+'>Отправить запрос</button></div>';
}
function agreementHtml(b){
  var l = listing(b.listing), u = state.user;
  return '<div class="l-title" style="font-size:22px;margin-bottom:12px">Договор</div><div class="doc">' +
    '<p><b>Стороны.</b> Владелец: '+esc(l.owner)+'. Пользователь: '+fullName(u)+', ИН '+maskId(u.pid)+'.</p>' +
    '<p><b>Предмет.</b> Предоставление машино-места: '+(l.num ? '№'+l.num+', ' : '')+l.title+', '+esc(parkName(l))+'.</p>' +
    '<p><b>Срок.</b> '+b.when+', '+b.qtyText+'. <b>Цена.</b> '+(b.total?money(b.total):'бесплатно')+'</p>' +
    '<p><b>Правила.</b> Один автомобиль, правила паркинга и ТС, фото состояния места при въезде и выезде.</p>' +
    '<p><b>Принят в приложении.</b> Пользователь: '+b.createdAt+'. Владелец: '+(b.acceptedAt||'ожидается')+'.</p>' +
    '</div>' +
    '<button type="button" class="cta" style="margin-top:12px"'+A('close')+'>Закрыть</button>';
}

VIEWS.rent = rentView;

act('when', function(v){ state.when = v; render(); });
act('flt', function(v){ state[v] = !state[v]; render(); });
act('zf', function(){ state.zoneFilter = ''; render(); });
act('book', function(v){
  if(!$('#modal').hidden) closeModal();
  if(!state.user){ AUTH.needAccount('Чтобы бронировать, войдите в аккаунт'); return; }
  if(listing(v).mine){ toast('Это ваше место'); return; }
  if(!state.user.pid){ AUTH.needPassport('Чтобы бронировать, добавьте паспортные данные: они нужны для договора'); return; }
  bk = {id:v, fmt:'', qty:1, date:ymd(new Date()), time:'19:00'}; openModal(bookingHtml());
});
act('bf', function(v){ bk.fmt = v; bk.qty = 1; openModal(bookingHtml()); });
act('bq', function(v){ bk.qty += Number(v); openModal(bookingHtml()); });
act('send', function(){
  var ce = consentCheck('book', BOOK_DOCS); if(ce){ toast(ce); return; }
  if(!bk.date){ toast('Выберите дату'); return; }
  var qt = bk.fmt==='month' ? '1 мес.' : bk.qty+' '+(bk.fmt==='hour'?'ч':'сут.');
  var nb = {id:'b'+(state.nextId++), listing:bk.id, fmt:bk.fmt, qty:bk.qty, qtyText:qt, when:fmtD(bk.date)+', с '+bk.time, total:bk.total, status:'request', createdAt:stamp()};
  state.bookings.unshift(nb); emit('book', {booking:nb, fmt:bk.fmt, qty:bk.qty, date:bk.date, time:bk.time});
  consentReset('book'); closeModal(); state.tab = 'rent'; render(true); toast('Запрос отправлен владельцу');
});
act('ans', function(v){
  var p = v.split(':');
  emit('answer', {id:p[1], ok:p[0] === 'ok'});
  state.bookings.concat(state.incoming || []).forEach(function(b){ if(b.id === p[1]){ b.status = p[0] === 'ok' ? 'confirmed' : 'declined'; if(p[0] === 'ok') b.acceptedAt = stamp(); } });
  render(); toast(p[0]==='ok' ? 'Подтверждено. Договор принят обеими сторонами' : 'Запрос отклонён');
});
act('agree', function(v){ openModal(agreementHtml(state.bookings.filter(function(x){ return x.id === v; })[0])); });
onInput('bk-d', function(val){ bk.date = val; });
onInput('bk-t', function(val){ bk.time = val; });
