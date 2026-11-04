/* Место есть: состояние приложения и расчёты по зонам (сколько мест свободно, шанс найти место).
   Подключается после core/util.js. Единый объект state: вкладка, выбранная зона, пользователь, брони, отметки. */

/* демо-профиль загрузки по часам: используется, пока сервер не прислал настоящее «обычно свободно» (флаг zones) */
var PROFILE = {
  home:function(d,h){ return d==='wd' ? 0.35+bump(h,21,3.5,0.55)+bump(h,6.5,2,0.15)-bump(h,13,3,0.2) : 0.55+bump(h,15,6,0.15)+bump(h,22,3,0.2); },
  park:function(d,h){ return d==='wd' ? 0.25+bump(h,18,3,0.4) : 0.3+bump(h,14,4,0.55); },
  edge:function(d,h){ return d==='wd' ? 0.2+bump(h,9,2.5,0.45)+bump(h,17.5,2,0.25) : 0.2+bump(h,14,5,0.15); }
};

var n0 = realNow(), today0 = new Date();
var state = {tab:'map', fc:{day:n0.day, hour:n0.hour}, mapFc:false, layer:'places', sel:defSel(), theme:'light', sheetMore:false, look:'bands', edit:false, tool:'row', kind:'perp', snap:true, draft:null, gps:null, here:false, marks:[], last:null, user:null, bookings:[], mine:[], when:'all', fCov:false, fEv:false, fFree:false, zoneFilter:'', helped:0, nextId:100, gate:'', sheetMin:false};
function T(){ if(state.mapFc) return state.fc; var n = realNow(); return {day:n.day, hour:n.hour}; }

function zone(id){ return DISTRICT.zones.filter(function(z){ return z.id === id; })[0]; }
function load(z,t){ return clamp(PROFILE[z.profile](t.day, t.hour) + (z.j || 0), 0, 0.97); }
function shift(z,t){
  var s = 0;
  state.marks.forEach(function(m){ if(m.zone !== z.id || m.day !== t.day) return; s += Math.exp(-Math.abs(t.hour - m.hour) * 60 / 30) * (m.kind === 'busy' ? -0.2 : 0.2); });
  return s;
}
function frac(z,t){
  t = t || T();
  var u = z.usual && z.usual[t.day] && z.usual[t.day][t.hour], base = (u != null) ? u/100 : 1 - load(z,t);   /* z.usual приходит из /api/zones/ */
  return clamp(base + shift(z,t), 0.02, 0.98);
}
function freeEst(z,t){ return Math.max(0, Math.round(z.spots * frac(z,t))); }
function pct(z,t){ return Math.round(frac(z,t)*100); }
function level(z){ var c = frac(z); return c >= 0.6 ? 'hi' : (c >= 0.35 ? 'mid' : 'lo'); }
function lvlText(z){ var l = level(z); return l==='hi' ? 'Места есть' : (l==='mid' ? 'Придётся поискать' : 'Почти нет мест'); }
function perim(){ return DISTRICT.zones.filter(function(z){ return z.type === 'perimeter'; }); }
function allListings(){ return state.mine.concat(DISTRICT.listings); }
function listing(id){ return allListings().filter(function(l){ return l.id === id; })[0]; }
function parkName(l){ var z = zone(l.zone); return z ? z.name : 'Парковка'; }
