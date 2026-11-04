/* Место есть: общие мелочи. Выбор элементов, форматирование, время, иконки и «швы» между модулями.
   Здесь нет состояния приложения. Подключается первым, сразу после data/mesto-data.js. */

var $ = function(s){ return document.querySelector(s); };
var clamp = function(v,a,b){ return Math.max(a, Math.min(b, v)); };
var bump = function(h,mu,s,a){ return a * Math.exp(-Math.pow((h-mu)/s, 2)); };
var pad = function(n){ return (n < 10 ? '0' : '') + n; };
var A = function(a,v){ return ' data-a="'+a+'"' + (v !== undefined ? ' data-v="'+v+'"' : ''); };
/* всё, что ввёл пользователь, перед вставкой в HTML проходит через esc() */
var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };

/* ---------- швы между модулями ---------- */
/* Карта (MAP), блок владельца (OWN) и связь с сервером (API) живут в своих файлах.
   Если файла нет или он сломался, остальное приложение продолжает работать. */
var MAP = {};
function mapCall(name){ var f = MAP[name]; return f ? f.apply(null, [].slice.call(arguments, 1)) : undefined; }
function live(a){ return typeof API !== 'undefined' && API.on(a); }
function ownCall(name, def){ return (typeof OWN !== 'undefined' && OWN[name]) ? OWN[name].apply(null, [].slice.call(arguments, 2)) : def; }
/* приложение сообщает о своих действиях событиями «mesto:...», их слушают модули из api/ и auth/ */
function emit(n, d){ try { document.dispatchEvent(new CustomEvent('mesto:' + n, {detail:d})); } catch(err){} }

/* ---------- иконки ---------- */
var IC = {
  pin:'<path d="M12 21s-6.5-5.4-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>',
  cal:'<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  plus:'<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>',
  user:'<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-5.5 7-5.5s6 1.5 7 5.5"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>', x:'<path d="M6 6l12 12M18 6L6 18"/>',
  bolt:'<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  wheel:'<circle cx="11" cy="4.5" r="1.8"/><path d="M11 8v6h5l2.5 5"/><path d="M8.2 11.6A5 5 0 1 0 15 18.6"/>',
  phone:'<path d="M6 4h3l1.5 4-2 1.3a10 10 0 0 0 4.2 4.2L14 11.5l4 1.5v3a2 2 0 0 1-2 2A12 12 0 0 1 4 6a2 2 0 0 1 2-2z"/>',
  park:'<path d="M9 18V6h4.2a3.4 3.4 0 0 1 0 6.8H9"/>',
  loc:'<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  all:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  arrow:'<path d="M7 17L17 7M9 7h8v8"/>'
};
function ic(n, s){ return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"'+(s?' style="width:'+s+'px;height:'+s+'px"':'')+'>'+IC[n]+'</svg>'; }

/* ---------- время ---------- */
var DOW = ['вс','пн','вт','ср','чт','пт','сб'];
var MON = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
var MS = ['янв.','февр.','мар.','апр.','мая','июн.','июл.','авг.','сент.','окт.','нояб.','дек.'];
function realNow(){ var d = new Date(), w = d.getDay(); return {day:(w===0||w===6)?'we':'wd', hour:d.getHours(), time:pad(d.getHours())+':'+pad(d.getMinutes()), dow:DOW[w]}; }
function ymd(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function pdate(s){ var p = s.split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
function fmtD(s){ var d = pdate(s); return d.getDate()+' '+MS[d.getMonth()]; }
function hh(h){ return pad(h)+':00'; }
function stamp(){ var d = new Date(); return d.getDate()+' '+MS[d.getMonth()]+', '+pad(d.getHours())+':'+pad(d.getMinutes()); }

/* ---------- форматирование ---------- */
function fmtP(v){ return Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ','); }
function money(v){ return fmtP(Math.round(v*100)/100) + ' руб.'; }
function parseP(s){ var v = parseFloat(String(s).replace(',', '.')); return (isFinite(v) && v > 0) ? Math.round(v*100)/100 : NaN; }
function fullName(u){ return esc(u.surname + ' ' + u.name + (u.patr ? ' ' + u.patr : '')); }
function maskId(s){ return s ? s.slice(0,3) + '•••••••••' + s.slice(-2) : 'не указан'; }
