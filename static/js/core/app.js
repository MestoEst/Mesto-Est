/* Место есть: ядро интерфейса. Вкладки, отрисовка, события, модальное окно, подсказка (toast).
   Остальное лежит в модулях и подключается к ядру тремя способами:
     VIEWS.<вкладка> = функция              какую страницу показывать
     act('имя', fn)                         что делать при клике на [data-a="имя"]; fn(значение data-v, элемент)
     onChange('id', fn) / onInput('id', fn) что делать, когда поле с этим id изменилось
   Подключается после core/util.js и core/state.js, до модулей из features/ и auth/. */
var main = $('#main');
var VIEWS = {};
var TABS = [['map','Карта','pin'],['rent','Аренда','cal'],['offer','Сдать','plus'],['account','Аккаунт','user']];

/* реестры обработчиков: модули добавляют свои, ядро только вызывает */
var ACT = {}, CHG = {}, INP = {};
function act(name, fn){ ACT[name] = fn; }
function onChange(id, fn){ CHG[id] = fn; }
function onInput(id, fn){ INP[id] = fn; }

function render(top, route){
  var sc = main.scrollTop;
  main.className = state.tab === 'map' ? 'mapmain' : '';
  main.innerHTML = state.tab === 'map' ? VIEWS.map() : '<div class="narrow' + ((state.tab === 'offer' || state.tab === 'account') ? ' cols' : '') + '">' + VIEWS[state.tab]() + '</div>';
  main.scrollTop = top ? 0 : sc;
  if(state.tab === 'map') mapAttachOrPlaceholder();
  $('#nav').innerHTML = TABS.map(function(t){ return '<button type="button" role="tab"'+A('tab',t[0])+' aria-selected="'+(state.tab===t[0])+'" aria-label="'+t[1]+'">'+ic(t[2])+'<span>'+t[1]+'</span></button>'; }).join('');
  syncUrl(route);
}

/* ---------- адреса страниц (History API) ----------
   Каждый раздел живёт на своём адресе: /map, /rent, /offer, /account, /login, /register, /docs/<документ>.
   Приложение по-прежнему одно (состояние: брони, места, пользователь хранится в памяти страницы), поэтому переходы
   между разделами идут без перезагрузки, а адрес в строке меняется. Прямые ссылки и кнопки «назад/вперёд» работают.
   Django отдаёт ту же страницу на все эти адреса (main/urls.py). Работает по умолчанию при открытии через http(s); отключается флагом router: false;
   при открытии index.html без Django (Live Server, file://) адреса не трогаются. */
var ROUTER = {on:false, tab:null, ready:false, navigated:false};
var PAGE_TITLES = {map:'Карта', rent:'Аренда', offer:'Сдать место', account:'Аккаунт', login:'Вход', register:'Регистрация'};
function routerOn(){ return (window.MESTO_CONFIG || {}).router !== false && /^https?:$/.test(location.protocol) && !!(window.history && history.pushState); }
function pathFor(){
  if(state.tab === 'account') return state.user ? '/account' : (state.authMode === 'login' ? '/login' : '/register');
  if(state.tab === 'docs') return '/docs/' + state.doc;
  return '/' + state.tab;
}
function titleFor(){
  var t;
  if(state.tab === 'docs') t = (typeof DOCS !== 'undefined' && DOCS[state.doc]) ? DOCS[state.doc][0] : 'Документ';
  else if(state.tab === 'account') t = state.user ? 'Аккаунт' : (state.authMode === 'login' ? PAGE_TITLES.login : PAGE_TITLES.register);
  else t = PAGE_TITLES[state.tab];
  return t ? t + ' · Место есть' : 'Место есть';
}
/* адрес в строке → состояние приложения */
function readPath(){
  var p = location.pathname.replace(/\/+$/, '') || '/', m;
  state.gate = ''; state.zoneFilter = '';
  if(p === '/login'){ state.tab = 'account'; state.authMode = 'login'; }
  else if(p === '/register'){ state.tab = 'account'; state.authMode = 'new'; }
  else if(p === '/account'){ state.tab = 'account'; if(!state.user) state.authMode = 'login'; }
  else if(p === '/rent' || p === '/offer'){ state.tab = p.slice(1); }
  else if((m = p.match(/^\/docs\/([a-z]+)$/)) && typeof DOCS !== 'undefined' && DOCS[m[1]]){ state.tab = 'docs'; state.doc = m[1]; }
  else state.tab = 'map';
}
/* состояние приложения → адрес в строке */
function syncUrl(fromRoute){
  if(!ROUTER.on) return;
  document.title = titleFor();
  if(state.tab === 'account' && !ROUTER.ready) return;      /* пока не узнали, вошёл ли человек, адрес аккаунта не меняем */
  var want = pathFor(), cur = location.pathname.replace(/\/+$/, '') || '/';
  if(cur !== want){
    if(!fromRoute && ROUTER.tab !== state.tab){ history.pushState(null, '', want + location.search); ROUTER.navigated = true; }
    else history.replaceState(null, '', want + location.search);
  }
  ROUTER.tab = state.tab;
}
window.addEventListener('popstate', function(){
  if(!ROUTER.on) return;
  readPath(); ROUTER.tab = state.tab;
  closeModal(); render(true, true);
});
document.addEventListener('mesto:session', function(){ ROUTER.ready = true; syncUrl(); });
function themeSeg(){ $('#themeseg').innerHTML = [['light','Светлый'],['dark','Тёмный']].map(function(t){ return '<button type="button"'+A('theme',t[0])+' aria-pressed="'+(state.theme===t[0])+'">'+t[1]+'</button>'; }).join(''); }

/* ---------- модальное окно и подсказка ---------- */
function openModal(html){ $('#msheet').innerHTML = html; $('#modal').hidden = false; var f = $('#msheet').querySelector('button,select,input'); if(f) f.focus(); }
function closeModal(){ $('#modal').hidden = true; }
var toastT;
function toast(m){ var t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function(){ t.classList.remove('on'); }, 2800); }

act('tab', function(v){ state.tab = v; if(v !== 'account') state.gate = ''; if(v !== 'rent') state.zoneFilter = ''; render(true); });
act('theme', function(v){ state.theme = v; document.documentElement.setAttribute('data-theme', v); themeSeg(); });
act('close', closeModal);

/* ---------- события: ядро только находит обработчик ---------- */
document.addEventListener('click', function(e){
  var t = e.target.closest('[data-a]');
  if(!t || t.disabled) return;
  var f = ACT[t.getAttribute('data-a')];
  if(f) f(t.getAttribute('data-v'), t);
});
document.addEventListener('change', function(e){ var f = CHG[e.target.id]; if(f) f(e.target, e); });
document.addEventListener('input', function(e){ var f = INP[e.target.id]; if(f) f(e.target.value, e); });
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && !$('#modal').hidden){ closeModal(); return; }
  if((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('zone')){ e.preventDefault(); var id = e.target.getAttribute('data-v'); state.sel = id; render(); }
});
$('#modal').addEventListener('click', function(e){ if(e.target.id === 'modal') closeModal(); });

document.addEventListener('DOMContentLoaded', function(){
  document.documentElement.setAttribute('data-theme', state.theme); themeSeg();
  ROUTER.on = routerOn();
  if(ROUTER.on){ readPath(); ROUTER.tab = state.tab; }
  render(true);
  emit('ready');          /* после первой отрисовки: api/ и auth/ начинают говорить с сервером */
});
