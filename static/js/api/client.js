/* Место есть: клиент для связи с сервером (Django). Общая часть для api/*.js и auth/auth.js.
   Для парковочных мест API обязателен, без подмены демо-набором. Остальные разделы включаются отдельными флагами
   в window.MESTO_CONFIG.api (см. templates/mesto_prototype.html). Остальные выключенные разделы живут локально.
   Приложение сообщает о действиях событиями «mesto:...», модули api/ и auth/ отправляют их на сервер
   и кладут ответы в state. Описание адресов и полей: docs/API.md. Подключается ДО остальных файлов api/ и auth/. */
var API = (function(){
  var cfg = (window.MESTO_CONFIG || {}).api, base = (window.MESTO_CONFIG || {}).base || '';
  function on(area){ return !!(cfg === true || (cfg && cfg[area])); }
  function csrf(){ var m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/); return m ? decodeURIComponent(m[1]) : ''; }
  function req(method, path, body, form){
    var o = {method:method, credentials:'same-origin', headers:{'Accept':'application/json'}};
    if(method !== 'GET') o.headers['X-CSRFToken'] = csrf();
    if(body !== undefined){ if(form) o.body = body; else { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); } }
    return fetch(base + path, o).then(function(r){
      return r.text().then(function(t){
        var j = null; try { j = t ? JSON.parse(t) : null; } catch(err){}
        if(!r.ok){ var e = new Error((j && (j.error || j.detail)) || ('Ошибка сервера ' + r.status)); e.status = r.status; e.data = j; throw e; }
        return j;
      });
    }, function(){ var e = new Error('Нет связи с сервером'); e.status = 0; throw e; });
  }

  /* помощники для файлов api/ и auth/ */
  function ev(name, fn){ document.addEventListener('mesto:' + name, function(e){ fn(e.detail || {}); }); }   /* слушать действие приложения */
  function say(e){ toast(e && e.message ? e.message : 'Ошибка связи с сервером'); }                          /* показать ошибку человеку */
  function soft(e){ if(window.console) console.warn('[mesto-api]', e && e.message); }                        /* тихая ошибка: только в консоль */
  function repaint(){ if(state.tab === 'map' && !state.edit){ refreshMap(); } else if(state.tab !== 'map'){ render(); } }
  function n2(v){ return v === '' || v == null ? null : Number(String(v).replace(',', '.')); }

  return {
    on:on, req:req, ev:ev, say:say, soft:soft, repaint:repaint, n2:n2,
    map:{},               /* сюда файлы api/ кладут функции «ответ сервера → интерфейс», например API.map.owner */
    get:function(p){ return req('GET', p); },
    post:function(p, b){ return req('POST', p, b === undefined ? {} : b); },
    put:function(p, b){ return req('PUT', p, b); },
    del:function(p){ return req('DELETE', p); },
    upload:function(p, fd){ return req('POST', p, fd, true); }
  };
})();
