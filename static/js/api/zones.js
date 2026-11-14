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

  function sendSpot(m, occupied){
    if(!m.spotId || m.spotId.indexOf('local:') === 0){
      say(new Error('Эта разметка ещё не сопоставлена с сервером')); return;
    }
    return API.post('/api/spots/' + encodeURIComponent(m.spotId) + '/status/', {is_occupied:occupied});
  }
  ev('mark', function(d){
    var m = d.mark;
    if(!m || !m.sp || !on('spots')) return;
    var request = sendSpot(m, m.kind === 'busy');
    if(!request) request = Promise.reject(new Error('Отметка не отправлена'));
    request.catch(function(e){
      ZS.forEach(function(z){ z.bays.forEach(function(b, k){ if(b.id === m.spotId) SPOTS.setBay(z, k, m.prevBusy, 'user'); }); });
      if(state.last === m) state.last = null;
      if(typeof BONUS !== 'undefined') BONUS.revoke(m);
      state.helped = Math.max(0, state.helped - 1); repaint(); say(e);
    });
  });
  ev('unmark', function(d){
    var m = d.mark; if(!m || !m.sp || !on('spots')) return;
    var request = sendSpot(m, m.prevBusy); if(request) request.catch(say);
  });
  ev('ready', function(){
    if(on('spots')) API.get('/api/spots/').then(function(data){
      var by = {}; data.features.forEach(function(f){ by[f.properties.id] = f.properties; });
      ZS.forEach(function(z){ z.bays.forEach(function(b, k){
        var p = by[b.id]; if(p && typeof p.is_occupied === 'boolean') SPOTS.setBay(z, k, p.is_occupied, 'server');
      }); }); repaint();
    }).catch(soft);
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
