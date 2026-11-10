/* Место есть: владелец парковочного места (статус + документы).
   Подключается ПОСЛЕ mesto-app.js. Работает и при регистрации, и позже, из вкладки «Аккаунт».
   Файлы в прототипе хранятся только в памяти страницы. В боевой версии они уходят на сервер
   (см. API.md: POST /api/me/owner/documents/). Приложение узнаёт о событиях через CustomEvent «mesto:...». */
var OWN = (function(){
  var DOC_KINDS = [
    {k:'title', name:'Документ на место', hint:'Свидетельство о госрегистрации, договор или выписка из реестра недвижимости', need:true},
    {k:'tp',    name:'Технический паспорт', hint:'Страница с планом и номером машино-места', need:true},
    {k:'other', name:'Другое (по желанию)', hint:'Например, доверенность, если сдаёте место за собственника', need:false}
  ];
  var MAX_MB = 10, OK_EXT = /\.(pdf|jpe?g|png|heic|webp)$/i;
  var STATUS = {
    none:    ['Не указано', 'request'],
    draft:   ['Нужны документы', 'request'],
    pending: ['На проверке', 'request'],
    verified:['Подтверждено', 'confirmed'],
    rejected:['Отклонено', 'declined']
  };
  var draft = fresh(), seq = 1;
  function fresh(){ return {on:false, parking:(typeof STREETS !== 'undefined' && STREETS[0] ? STREETS[0].id : 'other'), addr:'', place:'', docs:[], status:'none', sentAt:'', reason:''}; }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function get(){ if(state.user){ if(!state.user.owner) state.user.owner = fresh(); return state.user.owner; } return draft; }
  function has(o, k){ return o.docs.some(function(d){ return d.kind === k; }); }
  function complete(o){ return DOC_KINDS.every(function(d){ return !d.need || has(o, d.k); }) && !!String(o.place).trim() && (o.parking !== 'other' || !!String(o.addr).trim()); }
  function size(n){ return n >= 1048576 ? (n/1048576).toFixed(1).replace('.', ',') + ' МБ' : Math.max(1, Math.round(n/1024)) + ' КБ'; }
  function emit(name, detail){ try { document.dispatchEvent(new CustomEvent('mesto:' + name, {detail:detail})); } catch(err){} }
  /* статус пересчитывается из того, что заполнено; «pending / verified / rejected» ставятся только отправкой и проверкой */
  function touch(o){ if(!o.on){ o.status = 'none'; return; } if(o.status === 'none' || o.status === 'pending' || o.status === 'verified' || o.status === 'rejected') o.status = 'draft'; }

  IC.doc = '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>';
  IC.up = '<path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M5 19h14"/>';
  IC.shield = '<path d="M12 3l7 3v5.5c0 4.3-2.9 7.6-7 9.5-4.1-1.9-7-5.2-7-9.5V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>';

  function slot(o, d){
    var f = o.docs.filter(function(x){ return x.kind === d.k; })[0];
    if(f) return '<div class="slot has"><span class="sico">'+ic('doc')+'</span><div class="sbody"><b>'+esc(d.name)+'</b><span class="muted sm">'+esc(f.name)+' · '+size(f.size)+'</span></div>' +
      '<label class="filebtn sm2"><input type="file" data-own-file="'+d.k+'" accept="image/*,.pdf,.heic" aria-label="Заменить: '+esc(d.name)+'"><span>Заменить</span></label>' +
      '<button type="button" class="chip sm2" data-oa="rm" data-ov="'+f.id+'" aria-label="Убрать файл: '+esc(d.name)+'">'+ic('x', 16)+'</button></div>';
    return '<div class="slot"><span class="sico">'+ic('doc')+'</span><div class="sbody"><b>'+esc(d.name)+(d.need ? '' : '')+'</b><span class="muted sm">'+esc(d.hint)+'</span></div>' +
      '<label class="filebtn"><input type="file" data-own-file="'+d.k+'" accept="image/*,.pdf,.heic" aria-label="Выбрать файл: '+esc(d.name)+'">'+ic('up', 16)+'<span>Файл</span></label></div>';
  }

  /* карточка владельца. ctx: signup | account */
  function card(ctx){
    var o = get(), st = STATUS[o.status] || STATUS.none, h, lock = (o.status === 'pending' || o.status === 'verified'), dis = lock ? ' disabled' : '';
    h = '<section class="card owncard" id="own" data-ctx="'+ctx+'"><div class="ownhd"><div style="min-width:0"><div class="lbl">'+ic('shield', 18)+' Я владелец парковочного места</div>' +
      '<div class="muted sm">Нужно, чтобы сдавать место. '+(ctx === 'signup' ? 'Можно указать сейчас или позже в аккаунте.' : 'Можно указать в любой момент.')+'</div></div>' +
      '<input type="checkbox" class="sw" data-own="on" aria-label="Я владелец парковочного места"'+(o.on ? ' checked' : '')+'></div>';
    if(!o.on) return h + '</section>';
    h += '<div class="ownst"><span class="st '+st[1]+'">'+st[0]+'</span>' +
      (o.status === 'pending' ? '<span class="muted sm">отправлено: '+esc(o.sentAt)+'. Проверяем, обычно до двух рабочих дней.</span>' : '') +
      (o.status === 'verified' ? '<span class="muted sm">можно публиковать места</span>' : '') +
      (o.status === 'rejected' ? '<span class="muted sm">'+esc(o.reason || 'Документы не подошли.')+' Исправьте и отправьте снова.</span>' : '') + '</div>';
    h += '<div class="two ownloc"><div><label class="sm muted" for="own-pk">Улица</label><select id="own-pk" data-own="parking"'+dis+'>'+(typeof STREETS !== 'undefined' ? STREETS : []).map(function(st){ return '<option value="'+st.id+'"'+(o.parking===st.id?' selected':'')+'>'+esc(st.name)+'</option>'; }).join('')+'<option value="other"'+(o.parking==='other'?' selected':'')+'>Другой адрес</option></select></div>' +
      '<div><label class="sm muted" for="own-pl">Номер места</label><input id="own-pl" type="text" inputmode="text" data-own="place" placeholder="например, 128" value="'+esc(o.place)+'" autocomplete="off"'+dis+'></div></div>' + (lock ? '<button type="button" class="linkbtn" style="margin-top:8px" data-oa="edit">Изменить данные</button>' : '');
    if(o.parking === 'other') h += '<div style="margin-top:8px"><label class="sm muted" for="own-ad">Адрес</label><input id="own-ad" type="text" data-own="addr" placeholder="улица, дом" value="'+esc(o.addr)+'" autocomplete="off"'+dis+'></div>';
    h += '<div class="slots">' + DOC_KINDS.map(function(d){ return slot(o, d); }).join('') + '</div>' +
      '<p class="hint" style="margin-top:8px">Фото или PDF, до '+MAX_MB+' МБ. Документы видим только мы, другим пользователям они не показываются.</p>';
    if(ctx === 'account'){
      if(o.status === 'draft' || o.status === 'rejected' || o.status === 'none')
        h += '<div style="margin-top:12px">'+consentHtml('owner', ['privacy'])+'</div><button type="button" class="cta" style="margin-top:4px" data-oa="submit">Отправить на проверку</button>' + (complete(o) ? '' : '<p class="hint">Нужно: номер места, документ на место и технический паспорт.</p>');
      if(o.status === 'pending' && /[?&]demo\b/.test(location.search))
        h += '<div class="demobox"><span class="muted sm">Демо: админки пока нет, исход проверки можно сыграть самой.</span><div class="two"><button type="button" class="chip" data-oa="ok">Подтвердить</button><button type="button" class="chip" data-oa="no">Отклонить</button></div></div>';
    } else if(complete(o)) h += '<p class="hint">Документы уйдут на проверку сразу после создания аккаунта.</p>';
    return h + '</section>';
  }
  function redraw(){ var el = document.getElementById('own'); if(!el) return; var t = document.createElement('div'); t.innerHTML = card(el.getAttribute('data-ctx')); el.replaceWith(t.firstChild); }

  /* блок на вкладке «Сдать» */
  function gate(){
    if(!state.user) return '<div class="note"><b>Опубликовать можно после регистрации.</b> Если вы владелец места, это можно указать сразу при регистрации или позже в аккаунте.</div>';
    var o = get();
    if(o.on && o.status === 'verified') return '<div class="note" style="display:flex;gap:10px;align-items:center">'+ic('shield', 20)+'<span><b>Вы подтверждённый владелец.</b> Место появится в аренде без пометок.</span></div>';
    if(o.on && o.status === 'pending') return '<div class="note"><b>Документы на проверке.</b> Место можно опубликовать, пока идёт проверка оно будет с пометкой «Проверка документов».</div>';
    return '<div class="note"><b>Чтобы сдавать место, подтвердите, что вы владелец.</b> Отметьте это в аккаунте и приложите документы на место и технический паспорт.' +
      '<button type="button" class="cta dark" style="margin-top:10px;min-height:48px;font-size:15px" data-oa="go">Указать и приложить документы</button></div>';
  }
  function canPublish(){ var o = get(); return !!(state.user && o.on && (o.status === 'pending' || o.status === 'verified')); }
  function listingBadge(l){
    if(l.mine){ var o = get(); if(o.status === 'verified') return '<span class="fact lime">'+ic('shield')+'Владелец подтверждён</span>'; if(o.status === 'pending') return '<span class="fact">'+ic('doc')+'Проверка документов</span>'; return ''; }
    return '<span class="fact">'+ic('shield')+'Документы проверены</span>';
  }
  /* при регистрации забираем то, что гость успел заполнить */
  function take(){ var o = draft; draft = fresh(); if(o.on){ if(complete(o)){ o.status = 'pending'; o.sentAt = stamp(); } else o.status = 'draft'; } return o; }
  function go(){ state.tab = 'account'; state.gate = ''; render(true); var el = document.getElementById('own'); if(el && el.scrollIntoView) el.scrollIntoView({block:'center'}); }

  function addFile(kind, file){
    var o = get();
    if(!OK_EXT.test(file.name) && !/^image\//.test(file.type) && file.type !== 'application/pdf'){ toast('Подходят фото и PDF'); return false; }
    if(file.size > MAX_MB*1048576){ toast('Файл больше '+MAX_MB+' МБ'); return false; }
    if(kind !== 'other') o.docs = o.docs.filter(function(d){ return d.kind !== kind; });
    var d = {id:'f'+(seq++), kind:kind, name:file.name, size:file.size, file:file};
    o.docs.push(d); touch(o); emit('owner-doc', {doc:d, owner:o}); return true;
  }

  document.addEventListener('click', function(e){
    var t = e.target.closest('[data-oa]'); if(!t || t.disabled) return;
    var a = t.getAttribute('data-oa'), v = t.getAttribute('data-ov'), o = get();
    if(a === 'go'){ go(); }
    else if(a === 'edit'){ o.status = 'draft'; redraw(); }
    else if(a === 'rm'){ var gone = o.docs.filter(function(d){ return d.id === v; })[0]; o.docs = o.docs.filter(function(d){ return d.id !== v; }); touch(o); emit('owner-doc-remove', {id:v, doc:gone, owner:o}); redraw(); }
    else if(a === 'submit'){
      if(!complete(o)){ toast(!String(o.place).trim() ? 'Укажите номер места' : (o.parking === 'other' && !String(o.addr).trim() ? 'Укажите адрес' : 'Приложите документ на место и технический паспорт')); return; }
      var ce = consentCheck('owner', ['privacy']); if(ce){ toast(ce); return; }
      o.status = 'pending'; o.sentAt = stamp(); o.reason = ''; emit('owner-submit', {owner:o}); consentReset('owner'); redraw(); toast('Отправили на проверку');
    }
    else if(a === 'ok'){ o.status = 'verified'; emit('owner-demo', {status:'verified'}); render(); toast('Подтверждено. Можно сдавать место'); }
    else if(a === 'no'){ o.status = 'rejected'; o.reason = 'Не виден номер места на документе.'; emit('owner-demo', {status:'rejected'}); render(); }
  });
  document.addEventListener('change', function(e){
    var t = e.target, o;
    if(t.getAttribute && t.getAttribute('data-own-file')){
      var f = t.files && t.files[0]; if(!f) return;
      if(addFile(t.getAttribute('data-own-file'), f)) redraw();
      t.value = '';
    } else if(t.getAttribute && t.getAttribute('data-own') === 'on'){
      o = get(); o.on = t.checked; touch(o); emit('owner-toggle', {owner:o}); redraw();
    } else if(t.getAttribute && t.getAttribute('data-own') === 'parking'){
      o = get(); o.parking = t.value; touch(o); redraw();
    }
  });
  document.addEventListener('input', function(e){
    var t = e.target, k = t.getAttribute && t.getAttribute('data-own');
    if(k === 'place' || k === 'addr') get()[k] = t.value;
  });

  return {card:card, gate:gate, canPublish:canPublish, badge:listingBadge, take:take, go:go, get:get, esc:esc, complete:complete, kinds:DOC_KINDS};
})();
