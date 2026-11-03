/* Место есть: сервер, раздел «владелец места» (флаг owner): статус, документы, отправка на проверку.
   Интерфейс блока лежит в features/owner/owner.js. Адреса и поля: docs/API.md, раздел «Владелец места». */
(function(){
  var on = API.on, ev = API.ev, soft = API.soft, say = API.say;

  function mapOwner(o){
    o = o || {};
    return {on:!!o.is_owner, parking:o.parking || 'gA', addr:o.addr || '', place:o.place || '', status:o.status || (o.is_owner ? 'draft' : 'none'), sentAt:o.submitted_at || '', reason:o.reject_reason || '',
      docs:(o.documents || []).map(function(d){ return {id:'s' + d.id, sid:d.id, kind:d.kind, name:d.name, size:d.size}; })};
  }
  API.map.owner = mapOwner;                 /* auth/auth.js использует это при разборе ответа /api/me/ */

  function ownerBody(o){ return {is_owner:!!o.on, parking:o.parking, addr:o.addr, place:o.place}; }
  function uploadDoc(d){
    var fd = new FormData(); fd.append('kind', d.kind); fd.append('file', d.file, d.name);
    return API.upload('/api/me/owner/documents/', fd).then(function(r){ d.sid = r.id; return r; });
  }
  function syncOwnerAll(o, submit){                                     /* при регистрации: поля, файлы, отправка на проверку */
    return API.put('/api/me/owner/', ownerBody(o)).then(function(){
      return (o.docs || []).reduce(function(p, d){ return p.then(function(){ return d.file ? uploadDoc(d) : null; }); }, Promise.resolve());
    }).then(function(){ return submit ? API.post('/api/me/owner/submit/') : API.get('/api/me/owner/'); });
  }
  ev('owner-toggle', function(d){ if(!on('owner') || !state.user) return; API.put('/api/me/owner/', ownerBody(d.owner)).catch(say); });
  ev('owner-doc', function(d){
    if(!on('owner') || !state.user) return;
    API.put('/api/me/owner/', ownerBody(d.owner)).then(function(){ return uploadDoc(d.doc); }).catch(function(e){
      var o = d.owner; o.docs = o.docs.filter(function(x){ return x !== d.doc; }); say(e); if(document.getElementById('own')) render();
    });
  });
  ev('owner-doc-remove', function(d){ if(on('owner') && state.user && d.doc && d.doc.sid) API.del('/api/me/owner/documents/' + d.doc.sid + '/').catch(soft); });
  ev('owner-submit', function(d){
    if(!on('owner') || !state.user) return;
    API.put('/api/me/owner/', ownerBody(d.owner)).then(function(){ return API.post('/api/me/owner/submit/'); }).then(function(j){ if(j && state.user){ state.user.owner.status = (j.status || 'pending'); state.user.owner.sentAt = j.submitted_at || state.user.owner.sentAt; } })
      .catch(function(e){ if(state.user) state.user.owner.status = 'draft'; render(); say(e); });
  });

  /* человек только что зарегистрировался и указал, что он владелец: отправляем поля, файлы и заявку на проверку */
  ev('registered', function(d){
    var o = d.owner, u = state.user;
    if(!on('owner') || !o || !u) return;
    function show(oj){ if(state.user === u){ u.owner = mapOwner(oj); render(); } }
    syncOwnerAll(o, o.status === 'pending').then(show, function(e){
      toast('Аккаунт создан, но документы не отправились: ' + e.message + '. Добавьте их в аккаунте');
      API.get('/api/me/owner/').then(show).catch(soft);
    });
  });
})();
