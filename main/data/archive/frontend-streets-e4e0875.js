/* Место есть: улицы, зоны и номера мест.
   Подключается СРАЗУ ПОСЛЕ data/mesto-data.js. Ничего не рисует, только достраивает данные района:
     STREETS            список улиц: id, название, зоны, сколько мест
     zone.street        id улицы, к которой относится зона
     zone.name          «Зона 2» (номер внутри улицы)
     zone.label         «Восточная ул., зона 2» (полный адрес для карточек и договора)
     bay.num            номер места внутри зоны (1, 2, 3…), он виден всегда: на карте, в объявлении, в брони
   Паркингов A и B больше нет: все места и объявления привязаны к улице, зоне и номеру.

   Названия улиц настоящие (Яндекс Карты): ROADS ниже. Зоны района группируются по ближайшей улице. */

/* Улицы района по Яндекс Картам. v и u: где улица проходит внутри района (0 = север или запад, 1 = юг или восток).
   Каждая группа зон относится к ближайшей улице. Если какая-то зона попала не на ту улицу, поправьте v или u. */
var ROADS = [
  {id:'pil', name:'ул. Пилотная',          v:0},
  {id:'neb', name:'ул. Небесная',          v:0.25},
  {id:'avi', name:'ул. Авиационная',       v:0.85},
  {id:'leo', name:'ул. Леонардо да Винчи', u:0},
  {id:'mil', name:'ул. Михаила Миля',      u:1}
];

/* Если нужно переименовать улицу, впишите новое название по id: {neb:'ул. Небесная, дворы'} */
var STREET_NAMES = {};

var STREETS = [];

(function(){
  var NEAR_M = 45, ANGLE = 35, MIN_SPOTS = 10;

  function build(){
    var Z = ZS, n = Z.length, par = [], i, j;
    for(i = 0; i < n; i++) par.push(i);
    function find(a){ while(par[a] !== a){ par[a] = par[par[a]]; a = par[a]; } return a; }
    var P = Z.map(function(z){ return z.bc.map(function(c){ return [c[0]*MX, c[1]*MY]; }); });
    var A = P.map(function(p){
      if(p.length < 2) return null;
      var a = Math.atan2(p[p.length-1][1] - p[0][1], p[p.length-1][0] - p[0][0])*180/Math.PI;
      return ((a % 180) + 180) % 180;
    });
    function near(a, b){
      for(var x = 0; x < P[a].length; x++) for(var y = 0; y < P[b].length; y++)
        if(Math.hypot(P[a][x][0] - P[b][y][0], P[a][x][1] - P[b][y][1]) < NEAR_M) return true;
      return false;
    }
    for(i = 0; i < n; i++) for(j = i + 1; j < n; j++){
      if(find(i) === find(j)) continue;
      var da = (A[i] == null || A[j] == null) ? 0 : Math.abs(A[i] - A[j]); da = Math.min(da, 180 - da);
      if(da < ANGLE && near(i, j)) par[find(i)] = find(j);
    }
    var groups = {}, list = [];
    for(i = 0; i < n; i++){ var r = find(i); (groups[r] = groups[r] || []).push(i); }
    Object.keys(groups).forEach(function(k){ list.push(groups[k]); });

    /* центр группы в «выпрямленных» метрах: улицы идут вверх-вниз, как на карте */
    var th = (typeof BEARING === 'number' ? BEARING : 0)*Math.PI/180, cs = Math.cos(th), sn = Math.sin(th);
    function rot(p){ return [p[0]*cs - p[1]*sn, p[0]*sn + p[1]*cs]; }
    function cen(g){
      var sx = 0, sy = 0, m = 0;
      g.forEach(function(zi){ P[zi].forEach(function(p){ var q = rot(p); sx += q[0]; sy += q[1]; m++; }); });
      return [sx/m, sy/m];
    }
    function spots(g){ return g.reduce(function(s, zi){ return s + Z[zi].spots; }, 0); }

    /* совсем маленькие группы присоединяем к ближайшей большой */
    var big = list.filter(function(g){ return spots(g) >= MIN_SPOTS; });
    if(!big.length) big = list.slice();
    var bc = big.map(cen);
    list.forEach(function(g){
      if(big.indexOf(g) >= 0) return;
      var c = cen(g), best = 0, bd = 1e12;
      bc.forEach(function(b, k){ var d = Math.hypot(b[0] - c[0], b[1] - c[1]); if(d < bd){ bd = d; best = k; } });
      big[best] = big[best].concat(g);
    });

    /* настоящие улицы: каждая группа зон относится к ближайшей из улиц района (по положению на карте) */
    var allp = []; P.forEach(function(p){ p.forEach(function(q){ allp.push(q); }); });
    var X0 = Math.min.apply(null, allp.map(function(q){ return q[0]; })), X1 = Math.max.apply(null, allp.map(function(q){ return q[0]; }));
    var Y0 = Math.min.apply(null, allp.map(function(q){ return q[1]; })), Y1 = Math.max.apply(null, allp.map(function(q){ return q[1]; }));
    function tcen(g){ var sx = 0, sy = 0, m = 0; g.forEach(function(zi){ P[zi].forEach(function(q){ sx += q[0]; sy += q[1]; m++; }); }); return [sx/m, sy/m]; }
    function roadOf(g){
      var c = tcen(g), u = (c[0] - X0)/(X1 - X0 || 1), v = (Y1 - c[1])/(Y1 - Y0 || 1), best = 0, bd = 1e12;
      ROADS.forEach(function(r, k){
        var d = r.u != null ? Math.abs(u - r.u)*(X1 - X0) : Math.abs(v - r.v)*(Y1 - Y0);
        if(d < bd){ bd = d; best = k; }
      });
      return best;
    }
    var byRoad = {};
    big.forEach(function(g){ var k = roadOf(g); (byRoad[k] = byRoad[k] || []).push(g); });
    var order = Object.keys(byRoad).map(Number).sort(function(a, b){ return a - b; });

    STREETS = order.map(function(k, q){
      var r = ROADS[k], id = 's' + (q + 1), groups = byRoad[k], zs = [];
      groups.forEach(function(g){ zs = zs.concat(g); });
      zs.sort(function(a, b){ var ca = tcen([a]), cb = tcen([b]); return Math.abs(ca[1] - cb[1]) > 25 ? cb[1] - ca[1] : ca[0] - cb[0]; });   /* зоны с севера на юг */
      var st = {id:id, name:STREET_NAMES[r.id] || r.name, zones:[], spots:0, c:null, bc:[]};
      zs.forEach(function(zi, n){
        var z = Z[zi];
        z.street = id; z.num = n + 1; z.name = 'Зона ' + (n + 1);
        st.zones.push(z.id); st.spots += z.spots; z.bc.forEach(function(c){ st.bc.push(c); });
      });
      /* метка улицы на карте стоит на самой большой группе зон, а не в пустоте между ними */
      var main = groups.slice().sort(function(a, b){ return spots(b) - spots(a); })[0], sx = 0, sy = 0, m = 0;
      main.forEach(function(zi){ Z[zi].bc.forEach(function(c){ sx += c[0]; sy += c[1]; m++; }); });
      st.c = [sx/m, sy/m];
      return st;
    });
    var byId = {}; Z.forEach(function(q){ byId[q.id] = q; });
    STREETS.forEach(function(st){
      st.zones.forEach(function(zid){
        var z = byId[zid]; if(!z) return;
        z.label = st.name + ', ' + z.name.toLowerCase();
        z.bays.forEach(function(b, k){ b.num = k + 1; });
      });
    });
  }

  /* объявления из демо привязываем к настоящим зонам и местам, у каждого есть улица, зона и номер */
  function listings(){
    var cands = ZS.filter(function(z){ return z.spots >= 8; }).sort(function(a, b){
      var da = Math.hypot((a.c[0] - ZS[0].c[0])*MX, (a.c[1] - ZS[0].c[1])*MY), db = Math.hypot((b.c[0] - ZS[0].c[0])*MX, (b.c[1] - ZS[0].c[1])*MY);
      return da - db;
    }), seenStreet = {}, pick = [];
    cands.forEach(function(z){ if(!seenStreet[z.street] && pick.length < 5){ seenStreet[z.street] = 1; pick.push(z); } });
    while(pick.length < 5 && cands.length) pick.push(cands[pick.length % cands.length]);
    var nums = [3, 8, 2, 6, 4], titles = ['Место у подъезда', 'Место во дворе', 'Место у дома', 'Место с зарядкой', 'Место у дома'];
    DISTRICT.listings.forEach(function(l, i){
      var z = pick[i % pick.length], k = Math.min(nums[i % nums.length], z.spots) - 1;
      l.zone = z.id; l.bay = k; l.num = k + 1; l.street = z.street; l.title = titles[i % titles.length]; l.cov = false;
      if(l.ev){   /* объявление с зарядкой ставим рядом с зарядкой из данных */
        var ch = DISTRICT.chargers[0], best = z, bd = 1e12;
        if(ch) ZS.forEach(function(q){ var d = Math.hypot((q.c[0] - ch.ll[0])*MX, (q.c[1] - ch.ll[1])*MY); if(q.spots >= 3 && d < bd){ bd = d; best = q; } });
        l.zone = best.id; l.street = best.street; l.bay = Math.min(2, best.spots) - 1; l.num = l.bay + 1;
      }
    });
  }

  function enrich(){
    if(!ZS.length) return;
    build();
    DISTRICT.zones = ZS.slice();            /* паркингов A и B больше нет */
    listings();
  }

  var _apply = applyFeatures;
  applyFeatures = function(feats){ _apply(feats); enrich(); };
  enrich();
})();

/* ---------- помощники: улица, зона, номер ---------- */
function street(id){ return STREETS.filter(function(s){ return s.id === id; })[0]; }
function spotName(zid, k){ var z = zone(zid); return z ? '№' + (k + 1) + ', ' + z.label : ''; }
