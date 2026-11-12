/* Место есть: юридические тексты (соглашение, оферта, политика данных, шаблон договора).
   Сейчас это демонстрационные тексты, юридическую проверку они пройдут на втором этапе. */

var DOCS = {
  terms:['Пользовательское соглашение', ['Сервис помогает найти и сдать машино-место, платформа информационный посредник и не является стороной сделки.', 'Пользователь отвечает за достоверность данных и за право распоряжаться местом, которое сдаёт.', 'Нельзя сдавать чужие места, публиковать ложные отметки и использовать сервис за рулём.', 'За нарушения аккаунт может быть ограничен.']],
  offer:['Оферта сервиса', ['Принятие условий в приложении (нажатие «Принимаю») считается акцептом оферты.', 'Договор между владельцем и пользователем формируется автоматически из данных объявления и брони.', 'Условия, срок и цена фиксируются в приложении и доступны обеим сторонам.', 'Платежи в первой версии не проходят через сервис, стороны рассчитываются между собой.']],
  privacy:['Политика данных', ['Какие данные: имя, фамилия, телефон, идентификационный номер, геопозиция в момент отметки.', 'Зачем: заключение договора, защита от мошенничества, расчёт свободных мест.', 'Кому видны: другой стороне сделки только имя. Идентификационный номер никому не показывается.', 'Хранение: в зашифрованном виде, в соответствии с требованиями закона о защите персональных данных.']],
  contract:['Шаблон договора', ['Стороны: владелец места и пользователь, данные подставляются из аккаунтов.', 'Предмет: машино-место, адрес и номер, срок, цена и порядок расчётов.', 'Права и обязанности: один автомобиль, соблюдение правил паркинга, освобождение места в срок.', 'Ответственность: каждая сторона отвечает за причинённый вред. Фото состояния места при въезде и выезде.']]
};
var docBack = null;      /* если документ открыли из окна брони, «Закрыть» возвращает в это окно */
function docHtml(k){
  var d = DOCS[k];
  return '<div class="l-title" style="font-size:22px;margin-bottom:12px">'+d[0]+'</div><div class="doc">'+d[1].map(function(p){ return '<p>'+p+'</p>'; }).join('')+'</div>' +
    '<button type="button" class="cta" style="margin-top:12px"'+A('docclose')+'>'+(docBack ? 'Назад к брони' : 'Закрыть')+'</button>';
}

act('doc', function(v){
  var inBooking = !$('#modal').hidden && !!$('#msheet').querySelector('[data-a="send"]');
  if(inBooking && typeof bookingHtml === 'function') docBack = function(){ openModal(bookingHtml()); };
  else if($('#modal').hidden) docBack = null;
  openModal(docHtml(v));
});
/* отдельная страница документа: /docs/terms, /docs/offer, /docs/privacy, /docs/contract */
VIEWS.docs = function(){
  var d = DOCS[state.doc];
  if(!d) return '<h1 class="h1">Документ не найден</h1>';
  return '<h1 class="h1">'+d[0]+'</h1><section class="card"><div class="doc">'+d[1].map(function(p){ return '<p>'+p+'</p>'; }).join('')+'</div></section>' +
    '<button type="button" class="cta"'+A('docback')+'>Назад</button>';
};
act('docback', function(){
  if(ROUTER.navigated) history.back();
  else { state.tab = 'account'; render(true); }
});
act('docclose', function(){ var b = docBack; docBack = null; if(b) b(); else closeModal(); });

/* ---------- галочки на документы ----------
   consentHtml('форма', ['terms','offer']) рисует отдельную галочку на каждый документ со ссылкой «прочитать».
   consentCheck('форма', [...]) возвращает текст подсказки, если что-то не отмечено, иначе пустую строку. */
var CONS = {terms:'пользовательское соглашение', offer:'оферту сервиса', privacy:'политику данных', contract:'шаблон договора'};
state.cons = {};          /* что отметил человек: {форма: {документ: true}} */
state.accepted = {};      /* когда человек принял документ хотя бы раз: {документ: «3 нояб., 14:05»} */
function consentHtml(form, kinds){
  return '<div class="cons" role="group" aria-label="Согласие с документами">' + kinds.map(function(k){
    var on = !!(state.cons[form] && state.cons[form][k]);
    return '<label class="opt cons-row"><input type="checkbox" class="ck" data-cons="'+form+'" data-ck="'+k+'"'+(on ? ' checked' : '')+'><span>Принимаю <button type="button" class="linkbtn"'+A('doc', k)+'>'+CONS[k]+'</button></span></label>';
  }).join('') + '</div>';
}
function consentCheck(form, kinds){
  var c = state.cons[form] || {}, miss = kinds.filter(function(k){ return !c[k]; });
  return miss.length ? 'Отметьте галочками: ' + miss.map(function(k){ return CONS[k]; }).join(', ') : '';
}
function consentReset(form){ state.cons[form] = {}; }
document.addEventListener('change', function(e){
  var t = e.target, f = t.getAttribute && t.getAttribute('data-cons');
  if(!f) return;
  var k = t.getAttribute('data-ck');
  (state.cons[f] = state.cons[f] || {})[k] = t.checked;
  if(t.checked && !state.accepted[k]) state.accepted[k] = stamp();
});
