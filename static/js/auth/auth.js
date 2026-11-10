/* Место есть: РЕГИСТРАЦИЯ, ВХОД, ВЫХОД, ПАСПОРТ. Весь аккаунт-доступ в одном файле, чтобы подключать его к базе данных.
   Для Насти. Подробная памятка: docs/AUTH.md, формат запросов и ответов: docs/API.md (раздел «Аккаунт»).

   Файл состоит из четырёх частей:
     1. ФОРМЫ     какие поля видит человек (HTML)                 → менять, если нужно другое поле
     2. ПРОВЕРКИ  правила: что считается правильной почтой, паролем, паспортом
     3. ДЕЙСТВИЯ  что происходит по клику «Создать аккаунт», «Войти», «Выйти», «Сохранить»
     4. СЕРВЕР    запросы к Django; работают, когда в шаблоне включён флаг  auth: true
   Пока флаг выключен, аккаунт живёт только в памяти страницы (демо). Подключается после api/client.js. */
var AUTH = (function(){
  var ev = API.ev, on = API.on, say = API.say, soft = API.soft, SIGNUP_DOCS = ['terms', 'privacy'];

  /* ================= 1. ФОРМЫ ================= */
  function authSwitch(){
    var m = state.authMode === 'login' ? 'login' : 'new';
    return '<div class="chips" role="group" aria-label="Вход или регистрация"><button type="button" class="chip"'+A('authmode','new')+' aria-pressed="'+(m==='new')+'">Новый аккаунт</button><button type="button" class="chip"'+A('authmode','login')+' aria-pressed="'+(m==='login')+'">Уже есть аккаунт</button></div>';
  }
  function loginCard(){
    return '<section class="card"><div class="field"><label class="lbl" for="lg-e">Электронная почта</label><input id="lg-e" type="text" inputmode="email" placeholder="name@mail.by" autocomplete="username"></div>' +
      '<div class="field"><label class="lbl" for="lg-w">Пароль</label><input id="lg-w" type="password" autocomplete="current-password"></div>' +
      '<button type="button" class="cta"'+A('login')+'>Войти</button>'  + '</section>';
  }
  function signupCard(){
    return '<section class="card"><div class="field"><label class="lbl" for="ac-s">Фамилия</label><input id="ac-s" type="text" autocomplete="family-name"></div>' +
      '<div class="two"><div class="field"><label class="lbl" for="ac-n">Имя</label><input id="ac-n" type="text" autocomplete="given-name"></div><div class="field"><label class="lbl" for="ac-o">Отчество</label><input id="ac-o" type="text" autocomplete="additional-name"></div></div>' +
      '<div class="field"><label class="lbl" for="ac-p">Телефон</label><input id="ac-p" type="tel" placeholder="+375" autocomplete="tel"></div>' +
      '<div class="field"><label class="lbl" for="ac-e">Электронная почта</label><input id="ac-e" type="text" inputmode="email" placeholder="name@mail.by" autocomplete="email"></div>' +
      '<div class="field"><label class="lbl" for="ac-w">Пароль</label><input id="ac-w" type="password" placeholder="От 6 знаков" autocomplete="new-password"></div>' +
      ownCall('card','','signup') + '<div class="note"><b>Код из SMS или письма пока не отправляем.</b> Рассылка кодов платная, поэтому на первом этапе вход без подтверждения. Подтверждение номера и почты подключим на втором этапе, когда будет бюджет.</div>' +
      consentHtml('signup', SIGNUP_DOCS) + '<button type="button" class="cta" style="margin-top:6px"'+A('signup')+'>Создать аккаунт</button><p class="hint">Паспортные данные попросим позже, перед первой бронью или сдачей места. </p></section>';
  }
  function passportCard(){
    return '<section class="card"><div class="lbl">Добавьте паспортные данные</div><p class="muted sm" style="margin:6px 0 12px">Нужно один раз, перед первой бронью или публикацией места. Они подставляются в договор. Другая сторона видит только ваше имя.</p>' +
      '<div class="field"><label class="lbl" for="pp-i">Идентификационный номер</label><input id="pp-i" type="text" placeholder="3010190A001PB1" maxlength="14" autocapitalize="characters" autocomplete="off"></div>' +
      '<div class="field"><label class="lbl" for="pp-n">Серия и номер паспорта</label><input id="pp-n" type="text" placeholder="MP1234567" maxlength="9" autocapitalize="characters" autocomplete="off"></div>' +
      consentHtml('passport', ['privacy']) + '<button type="button" class="cta" style="margin-top:6px"'+A('passport')+'>Сохранить</button><p class="hint">Хранить будем в зашифрованном виде. </p></section>';
  }
  /* то, что видит гость на вкладке «Аккаунт»: переключатель «Новый аккаунт / Уже есть» и нужная форма */
  function guestHtml(){ return authSwitch() + (state.authMode === 'login' ? loginCard() : signupCard()); }

  /* ================= 2. ПРОВЕРКИ ================= */
  /* Возвращают текст ошибки или пустую строку. Сервер обязан проверять то же самое сам: фронтенду верить нельзя. */
  function checkSignup(f){
    if(!f.name || !f.surname || !f.phone) return 'Заполните фамилию, имя и телефон';
    if(!/^\S+@\S+\.\S+$/.test(f.email)) return 'Проверьте электронную почту';
    if(f.password.length < 6) return 'Пароль от 6 знаков';
    return '';
  }
  function checkPassport(pid, pn){
    if(!/^\d{7}[A-Z]\d{3}[A-Z]{2}\d$/.test(pid)) return 'Идентификационный номер: 14 символов, например 3010190A001PB1';
    if(!/^[A-Z]{2}\d{7}$/.test(pn)) return 'Паспорт: 2 буквы и 7 цифр, например MP1234567';
    return '';
  }

  /* ================= 3. ДЕЙСТВИЯ ================= */
  /* Отправить человека на вкладку «Аккаунт» с пояснением: используют вкладки «Аренда» и «Сдать» */
  function needAccount(msg){ state.gate = msg; state.tab = 'account'; render(true); toast('Сначала создайте аккаунт'); }
  function needPassport(msg){ state.gate = msg; state.tab = 'account'; render(true); toast('Добавьте паспортные данные'); }

  act('authmode', function(v){ state.authMode = v; render(); });
  act('signup', function(){
    var f = {name:$('#ac-n').value.trim(), surname:$('#ac-s').value.trim(), patr:$('#ac-o').value.trim(), phone:$('#ac-p').value.trim(), email:$('#ac-e').value.trim(), password:$('#ac-w').value};
    var err = checkSignup(f) || consentCheck('signup', SIGNUP_DOCS); if(err){ toast(err); return; }
    consentReset('signup');
    state.user = {name:f.name, surname:f.surname, patr:f.patr, phone:f.phone, email:f.email, pid:null, passport:null, owner:ownCall('take', null)};
    state.gate = '';
    emit('signup', {user:state.user, password:f.password});          /* → часть 4: POST /api/auth/register/ */
    render(true); toast('Аккаунт создан. Паспортные данные добавьте позже');
  });
  act('login', function(){
    var le = $('#lg-e').value.trim(), lw = $('#lg-w').value;
    if(!live('auth')){ toast('Аккаунт не найден. Создайте новый'); return; }
    if(!le || !lw){ toast('Введите почту и пароль'); return; }
    emit('login', {email:le, password:lw});                          /* → POST /api/auth/login/ */
  });
  act('passport', function(){
    var pid = $('#pp-i').value.trim().toUpperCase(), pn = $('#pp-n').value.trim().toUpperCase();
    var err = checkPassport(pid, pn) || consentCheck('passport', ['privacy']); if(err){ toast(err); return; }
    consentReset('passport');
    state.user.pid = pid; state.user.passport = pn.slice(0,2)+'•••'+pn.slice(-2); state.gate = '';
    emit('passport', {pid:pid, passport:pn});                        /* → PUT /api/me/passport/ */
    render(true); toast('Данные сохранены');
  });
  act('logout', function(){ emit('logout'); state.user = null; state.bookings = []; state.mine = []; render(true); });   /* → POST /api/auth/logout/ */

  /* ================= 4. СЕРВЕР (флаг auth) ================= */
  /* ответ сервера → то, что понимает интерфейс (имена полей см. docs/API.md) */
  function mapUser(j){
    return {id:j.id, name:j.name, surname:j.surname, patr:j.patronymic || '', phone:j.phone, email:j.email,
      pid:j.passport_set ? (j.pid_masked || '•••••••••••••') : null, passport:j.passport_masked || null,
      owner:API.map.owner ? API.map.owner(j.owner) : undefined};
  }
  /* человек вошёл: кладём его в state и сообщаем остальным модулям («session»), что можно грузить его данные */
  function setUser(j, owner){
    state.user = mapUser(j); if(owner) state.user.owner = owner;
    state.gate = ''; emit('session'); render(true);
  }

  /* при открытии страницы: если есть сессия Django, человек остаётся вошедшим */
  ev('ready', function(){
    if(!on('auth')){ emit('session'); return; }
    API.get('/api/me/').then(function(j){ if(j && j.id) setUser(j); else emit('session'); }).catch(function(){ emit('session'); });
  });

  ev('signup', function(d){
    if(!on('auth')) return;
    var u = d.user, own = u.owner, mine = (own && own.on) ? own : null;
    API.post('/api/auth/register/', {surname:u.surname, name:u.name, patronymic:u.patr, phone:u.phone, email:u.email, password:d.password}).then(function(j){
      if(state.user !== u) return;                                   /* пока шёл запрос, человек вышел */
      setUser(j, mine);
      if(mine) emit('registered', {owner:mine});                     /* документы владельца отправит api/owner.js */
    }).catch(function(e){
      if(state.user === u){ state.user = null; state.authMode = 'new'; state.gate = e.message; render(true); }
      say(e);
    });
  });
  ev('login', function(d){
    API.post('/api/auth/login/', {email:d.email, password:d.password}).then(function(j){ setUser(j); toast('Вы вошли'); }).catch(say);
  });
  ev('logout', function(){ if(on('auth')) API.post('/api/auth/logout/').catch(soft); });
  ev('passport', function(d){
    if(!on('auth')) return;
    API.put('/api/me/passport/', {pid:d.pid, passport:d.passport}).then(function(j){
      if(state.user){ state.user.pid = j.pid_masked || state.user.pid; state.user.passport = j.passport_masked || state.user.passport; render(); }
    }).catch(function(e){ if(state.user){ state.user.pid = null; state.user.passport = null; render(true); } say(e); });
  });

  return {guestHtml:guestHtml, passportCard:passportCard, needAccount:needAccount, needPassport:needPassport};
})();
