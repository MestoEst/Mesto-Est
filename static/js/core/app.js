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

function render(top){
  var sc = main.scrollTop;
  main.className = state.tab === 'map' ? 'mapmain' : '';
  main.innerHTML = state.tab === 'map' ? VIEWS.map() : '<div class="narrow' + ((state.tab === 'offer' || state.tab === 'account') ? ' cols' : '') + '">' + VIEWS[state.tab]() + '</div>';
  main.scrollTop = top ? 0 : sc;
  if(state.tab === 'map') mapAttachOrPlaceholder();
  $('#nav').innerHTML = TABS.map(function(t){ return '<button type="button" role="tab"'+A('tab',t[0])+' aria-selected="'+(state.tab===t[0])+'" aria-label="'+t[1]+'">'+ic(t[2])+'<span>'+t[1]+'</span></button>'; }).join('');
}
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
  render(true);
  emit('ready');          /* после первой отрисовки: api/ и auth/ начинают говорить с сервером */
});
