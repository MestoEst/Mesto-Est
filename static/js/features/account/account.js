/* Место есть: вкладка «Аккаунт». Для гостя показывает формы из auth/auth.js, для вошедшего: профиль, паспорт,
   владелец места (features/owner/owner.js), мои брони, мои места, запросы мне. */

function accountView(){
  var dl = [['terms','Соглашение'],['offer','Оферта'],['privacy','Политика данных'],['contract','Шаблон договора']];
  var docs = '<section class="card"><div class="lbl" style="margin-bottom:10px">Документы</div><div class="chips wrap">' + dl.map(function(d){
    var ok = !!state.accepted[d[0]];
    return '<button type="button" class="chip'+(ok ? ' acc' : '')+'"'+A('doc',d[0])+'>'+(ok ? ic('check', 15) : '')+d[1]+'</button>';
  }).join('') + '</div></section>';
  var bonus = BONUS.card();
  if(!state.user){
    return '<h1 class="h1">Аккаунт</h1>' + (state.gate ? '<div class="card" style="background:var(--lime-tint);border-color:transparent"><b>'+state.gate+'</b></div>' : '') +
      '<section class="card"><div class="lbl">Вы гость</div><p class="muted sm" style="margin-top:6px">Смотреть карту и отмечать места можно без регистрации. Аккаунт нужен, чтобы бронировать и сдавать места: договор заключается между конкретными людьми.</p></section>' +
      AUTH.guestHtml() + bonus + docs;
  }
  var reqs = (live('bookings') ? (state.incoming || []) : state.bookings).filter(function(b){ return b.status === 'request'; }), u = state.user;
  return '<h1 class="h1">Аккаунт</h1>' +
    '<section class="card" style="display:flex;gap:14px;align-items:center"><div class="avatar">'+esc(u.name.charAt(0).toUpperCase())+'</div><div style="flex:1;min-width:0"><div class="lbl" style="font-size:18px">'+fullName(u)+'</div><div class="muted sm">'+esc(u.phone)+' · '+esc(u.email)+'</div></div><button type="button" class="chip"'+A('logout')+'>Выйти</button></section>' +
    (state.gate ? '<div class="card" style="background:var(--lime-tint);border-color:transparent"><b>'+state.gate+'</b></div>' : '') +
    (u.pid ? '<div class="note" style="margin-top:0">Личность указана: ИН '+maskId(u.pid)+', паспорт '+u.passport+'</div>' : AUTH.passportCard()) +
    ownCall('card','','account') +
    '<div class="two" style="margin-bottom:12px"><div class="tile"><b>'+state.helped+'</b><span class="muted sm">отметок вы сделали</span></div><div class="tile"><b>'+state.mine.length+'</b><span class="muted sm">мест вы сдаёте</span></div></div>' +
    bonus + '<section class="card"><div class="lbl" style="margin-bottom:8px">Мои брони</div>' + (state.bookings.length ? state.bookings.map(function(b){
      var l = listing(b.listing);
      return '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:9px 0;border-top:1px solid var(--line)"><div><b>'+esc(lname(l))+'</b><div class="muted sm">'+b.when+', '+b.qtyText+'</div></div><div style="text-align:right"><span class="st '+b.status+'">'+({request:'Запрос',confirmed:'Подтверждено',declined:'Отказ'})[b.status]+'</span>'+(b.status==='confirmed'?'<div><button type="button" class="chip" style="min-height:32px;padding:4px 10px;margin-top:6px"'+A('agree',b.id)+'>Договор</button></div>':'')+'</div></div>';
    }).join('') : '<p class="muted sm">Броней пока нет. Выберите место на вкладке «Аренда».</p>') + '</section>' +
    '<section class="card"><div class="lbl" style="margin-bottom:8px">Мои места</div>' + (state.mine.length ? state.mine.map(function(l){ return '<div style="padding:9px 0;border-top:1px solid var(--line)"><b>'+esc(lname(l))+'</b><div class="muted sm">'+esc(parkName(l))+' · '+l.whenText+'</div></div>'; }).join('') : '<p class="muted sm">Вы пока ничего не сдаёте. Вкладка «Сдать», это минута.</p>') + '</section>' +
    '<section class="card"><div class="lbl" style="margin-bottom:4px">Запросы мне</div>' + (reqs.length ? reqs.map(function(b){ var l = listing(b.listing);
      return '<div style="padding:9px 0;border-top:1px solid var(--line)"><b>'+esc(lname(l))+'</b><div class="muted sm" style="margin-bottom:8px">'+b.when+', '+b.qtyText+' · '+(b.total?money(b.total):'бесплатно')+'</div><div class="two"><button type="button" class="cta" style="min-height:46px;font-size:15px"'+A('ans','ok:'+b.id)+'>Подтвердить</button><button type="button" class="cta ghost" style="min-height:46px;font-size:15px"'+A('ans','no:'+b.id)+'>Отказать</button></div></div>'; }).join('') : '<p class="muted sm">Новых запросов нет.</p>') + '</section>' + docs;
}

VIEWS.account = accountView;
