/* Место есть: баллы за отметки и купоны партнёров.
   Подключается после features/docs/docs.js и до map-view.js. Что делает:
     +10 баллов за каждую отметку «свободно / занято» (за одно и то же место не чаще раза в 30 минут, чтобы не накручивали);
     100 баллов можно обменять на купон. Купон выдаётся только вошедшему в аккаунт.
   ПАРТНЁРЫ ЗДЕСЬ ПРИМЕРНЫЕ: это показ механики. Настоящих партнёров (кафе, пиццерии, мойки) подключим при масштабировании проекта.
   Баллы и купоны пока хранятся в браузере (localStorage). В боевой версии их считает сервер. */
var BONUS = (function(){
  var PER_MARK = 10, COOL_MIN = 30, STORE = 'me_bonus_v1';
  var PARTNERS = [
    {id:'pizza', name:'Пиццерия', offer:'Скидка 20% на заказ', cost:100},
    {id:'wash',  name:'Автомойка', offer:'Скидка 15% на мойку', cost:150}
  ];
  var d = load();

  function load(){
    try { var r = JSON.parse(localStorage.getItem(STORE) || 'null'); if(r && typeof r.pts === 'number') return {pts:r.pts, coupons:r.coupons || [], seen:r.seen || {}}; } catch(err){}
    return {pts:0, coupons:[], seen:{}};
  }
  function save(){ try { localStorage.setItem(STORE, JSON.stringify(d)); } catch(err){} }
  function target(){ return PARTNERS.reduce(function(m, p){ return Math.min(m, p.cost); }, 1e9); }
  function code(){ var s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', o = ''; for(var i = 0; i < 4; i++) o += s.charAt(Math.floor(Math.random()*s.length)); return 'ME-' + o + '-' + Math.floor(1000 + Math.random()*9000); }

  /* начислить за отметку. m: отметка, k: номер места или null (вся зона) */
  function award(m, k){
    var id = m.zone + ':' + (k == null ? 'zone' : k), now = Date.now();
    if(d.seen[id] && now - d.seen[id] < COOL_MIN*60000) return {pts:0, cool:true};
    d.seen[id] = now; m.bonusKey = id; d.pts += PER_MARK; save();
    emit('bonus', {pts:PER_MARK, total:d.pts});
    return {pts:PER_MARK};
  }
  function revoke(m){
    if(m && m.award > 0){ d.pts = Math.max(0, d.pts - m.award); if(m.bonusKey) delete d.seen[m.bonusKey]; save(); }
  }

  function bar(p){ return '<div class="bbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(p)+'"><i style="width:'+p.toFixed(0)+'%"></i></div>'; }

  /* строка под кнопками «Свободно / Занято» на карте */
  function line(){
    var t = target(), ready = d.pts >= t;
    return '<div class="bline"><div class="bl1"><span>'+(ready ? 'Купон готов' : 'Баллы за отметки')+'</span><b>'+d.pts+(ready ? '' : ' / '+t)+'</b></div>' + bar(Math.min(100, d.pts/t*100)) +
      '<button type="button" class="linkbtn"'+A('tab', 'account')+'>'+(ready ? 'Получить купон' : 'Что за баллы')+'</button></div>';
  }

  /* карточка на вкладке «Аккаунт» */
  function card(){
    var t = target(), h = '<section class="card bonus" id="bonus"><div class="lbl" style="margin-bottom:2px">Бонусы за отметки</div>' +
      '<div class="muted sm">+'+PER_MARK+' баллов за каждую отметку «свободно / занято». За одно место баллы начисляются не чаще, чем раз в '+COOL_MIN+' минут.</div>' +
      '<div class="bpts"><b>'+d.pts+'</b><span>баллов</span></div>' + bar(Math.min(100, d.pts/t*100)) +
      '<ul class="zl partners">' + PARTNERS.map(function(p){
        var ok = d.pts >= p.cost;
        return '<li><div class="prow"><div class="pi"><b>'+esc(p.name)+'</b><span class="muted sm">'+esc(p.offer)+' · '+p.cost+' баллов</span><span class="tag">пример партнёра</span></div>' +
          '<button type="button" class="chip'+(ok ? ' lime' : '')+'"'+A('coupon', p.id)+(ok ? '' : ' aria-disabled="true"')+'>'+(ok ? 'Получить' : 'Нужно '+p.cost)+'</button></div></li>';
      }).join('') + '</ul>';
    if(d.coupons.length){
      h += '<div class="lbl" style="margin:14px 0 8px">Мои купоны</div>' + d.coupons.map(function(c){
        return '<div class="coupon"><div><b>'+esc(c.partner)+'</b><span class="muted sm">'+esc(c.offer)+' · '+esc(c.at)+'</span></div><code>'+esc(c.code)+'</code></div>';
      }).join('');
    }
    return h + '<p class="hint" style="margin-top:12px">Купон нужно показать при заказе.</p></section>';
  }

  act('coupon', function(v){
    var p = PARTNERS.filter(function(x){ return x.id === v; })[0];
    if(!p) return;
    if(d.pts < p.cost){ toast('Нужно ещё ' + (p.cost - d.pts) + ' баллов'); return; }
    if(!state.user){ AUTH.needAccount('Чтобы получить купон, войдите в аккаунт'); return; }
    d.pts -= p.cost;
    var c = {id:'c' + Date.now(), partner:p.name + ' (пример)', offer:p.offer, code:code(), at:stamp()};
    d.coupons.unshift(c); save(); emit('coupon', {coupon:c, total:d.pts});
    render(); toast('Купон получен: ' + c.code);
  });

  return {award:award, revoke:revoke, line:line, card:card, points:function(){ return d.pts; }, partners:PARTNERS};
})();
