/* Место есть: сервер, раздел «зоны и отметки» (флаги zones и marks): прогноз «обычно свободно» и отметки жителей.
   Адреса и поля: docs/API.md, раздел «Зоны и отметки». */
(function(){
  var on = API.on, ev = API.ev, soft = API.soft, say = API.say, repaint = API.repaint;

  function mapMark(j){
    var d = new Date(j.at), w = d.getDay();
    return {sid:j.id, srv:true, zone:j.zone, kind:j.kind, hour:d.getHours(), day:(w === 0 || w === 6) ? 'we' : 'wd', time:pad(d.getHours()) + ':' + pad(d.getMinutes())};
  }

  function loadZones(){
    API.get('/api/zones/').then(function(list){
      var by = {}; (list || []).forEach(function(z){ by[z.id] = z; });
      ZS.forEach(function(z){ var s = by[z.id]; z.usual = (s && s.usual) || null; });
      repaint();
    }).catch(soft);
  }
  function pollMarks(){
    API.get('/api/marks/?minutes=180').then(function(list){
      var srv = (list || []).map(mapMark), have = {}; srv.forEach(function(m){ have[m.sid] = m; });
      var keep = state.marks.filter(function(m){ return !m.sid && !m.srv; });          /* ещё не отправленные */
      if(state.last && state.last.sid && have[state.last.sid]) state.last = have[state.last.sid];
      state.marks = keep.concat(srv); repaint();
    }).catch(soft);
  }

  function findBay(id){
    var found=null;ZS.forEach(function(z){z.bays.forEach(function(b,k){if(b.id===id)found={z:z,b:b,k:k};});});return found;
  }
  API.spotPending=false;
  function sendSpot(m,occupied){
    if(typeof occupied!=='boolean')return Promise.reject(new Error('Неизвестный прежний статус нельзя восстановить этой командой'));
    if(!findBay(m.spotId))return Promise.reject(new Error('Место отсутствует в текущем наборе'));
    API.spotPending=true;
    return API.post('/api/spots/'+encodeURIComponent(m.spotId)+'/status/',{is_occupied:occupied}).finally(function(){API.spotPending=false;});
  }
  API.loadSpots=function(){
    if(API.spotPending)return Promise.resolve();
    SPOT_DATA.status='loading';SPOT_DATA.error='';render();
    return API.get('/api/spots/').then(function(data){
      applyCanonical(data);
      state.over={};state.spot=null;
      if(!ZS.some(function(z){return z.id===state.sel;}))state.sel=defSel();
      if(MAP.reset)MAP.reset();
      SPOT_DATA.status='ready';render();
    }).catch(function(e){SPOT_DATA.status='error';SPOT_DATA.error=e.message||'Ошибка связи с сервером';render();});
  };
  ev('mark',function(d){
    var m=d.mark;if(!m || !m.sp)return;
    sendSpot(m,m.kind==='busy').then(function(){
      var it=findBay(m.spotId);if(it)it.b.isOccupied=m.kind==='busy';
      toast('Отметка сохранена');repaint();
    }).catch(function(e){
      var it=findBay(m.spotId);if(it)SPOTS.setBay(it.z,it.k,m.prevBusy,'server');
      if(state.last===m)state.last=null;
      if(typeof BONUS!=='undefined')BONUS.revoke(m);
      state.helped=Math.max(0,state.helped-1);repaint();say(e);
    });
  });
  ev('unmark',function(d){
    var m=d.mark;if(!m || !m.sp)return;
    sendSpot(m,m.prevBusy).then(function(){var it=findBay(m.spotId);if(it)it.b.isOccupied=m.prevBusy;repaint();}).catch(function(e){
      var it=findBay(m.spotId);if(it)SPOTS.setBay(it.z,it.k,m.kind==='busy','server');repaint();say(e);
    });
  });
  ev('ready',function(){
    API.loadSpots();
    if(on('zones')) loadZones();
    if(on('marks')){ pollMarks(); setInterval(function(){ if(!document.hidden && state.tab === 'map') pollMarks(); }, 30000); }
  });

  ev('mark', function(d){
    if(d.mark && d.mark.sp) return;
    if(!on('marks')) return;
    var m = d.mark, g = d.gps || {};
    API.post('/api/zones/' + encodeURIComponent(m.zone) + '/marks/', {kind:m.kind, lat:g.lat, lng:g.lng, accuracy:g.acc}).then(function(r){ m.sid = r.id; }).catch(function(e){
      var i = state.marks.indexOf(m); if(i >= 0) state.marks.splice(i, 1);
      state.helped = Math.max(0, state.helped - 1); if(state.last === m) state.last = null; repaint(); say(e);
    });
  });
  ev('unmark', function(d){
    var m = d.mark; if(!on('marks') || !m || m.sp) return;
    var go = function(){ if(m.sid) API.del('/api/zones/' + encodeURIComponent(m.zone) + '/marks/' + m.sid + '/').catch(soft); };
    if(m.sid) go(); else setTimeout(go, 800);
  });
})();
