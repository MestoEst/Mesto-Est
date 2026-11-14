/* Место есть: сервер, разделы «аренда» и «брони» (флаги listings и bookings).
   Адреса и поля: docs/API.md, разделы «Аренда» и «Брони». */
(function(){
  var on = API.on, ev = API.ev, soft = API.soft, say = API.say, repaint = API.repaint, n2 = API.n2;

  function mapListing(j){
    return {id:String(j.id), title:j.title, spotId:j.spot_id, zone:j.zone, owner:j.owner, rating:j.rating || '', rev:j.reviews || 0, hour:j.hour_price || undefined, day:j.day_price || undefined, month:j.month_price || undefined,
      free:!!j.free, whenText:j.when_text || '', avail:j.avail || [], walk:j.walk || 3, cov:j.covered !== false, ev:!!j.ev, mine:!!j.mine, verified:!!j.verified};
  }
  function mapBooking(j){
    return {id:String(j.id), listing:String(j.listing), fmt:j.fmt, qty:j.qty, qtyText:j.qty_text, when:j.when_text, total:j.total || 0, status:j.status, createdAt:j.created_at || '', acceptedAt:j.accepted_at || ''};
  }

  function loadListings(){
    API.get('/api/listings/').then(function(list){
      var all = (list || []).map(mapListing);
      DISTRICT.listings = all.filter(function(l){ return !l.mine; }); state.mine = all.filter(function(l){ return l.mine; }); repaint();
    }).catch(soft);
  }
  function loadBookings(){
    if(!state.user) return;
    API.get('/api/bookings/').then(function(j){
      state.bookings = ((j && j.mine) || []).map(mapBooking); state.incoming = ((j && j.incoming) || []).map(mapBooking); repaint();
    }).catch(soft);
  }

  /* человек вошёл или страница открылась: подгружаем объявления и его брони */
  ev('session', function(){ if(on('listings')) loadListings(); if(on('bookings')) loadBookings(); });
  ev('logout', function(){ state.incoming = []; });

  ev('publish', function(d){
    if(!on('listings')) return;
    var l = d.listing, o = d.offer;
    API.post('/api/listings/', {spot_id:o.spotId, zone:o.zone, date_from:o.from, date_to:o.to || o.from, all_day:!!o.allDay, time_from:o.allDay ? null : o.t1, time_to:o.allDay ? null : o.t2,
      free:!!o.free, hour_price:o.hour ? n2(o.hp) : null, day_price:o.day ? n2(o.dp) : null, month_price:o.month ? n2(o.mp) : null, ev:!!o.ev, place_no:o.num, when_text:l.whenText}).then(function(j){
      var s = mapListing(j), i = state.mine.indexOf(l); if(i >= 0) state.mine[i] = s; repaint();
    }).catch(function(e){ var i = state.mine.indexOf(l); if(i >= 0) state.mine.splice(i, 1); repaint(); say(e); });
  });
  ev('book', function(d){
    if(!on('bookings')) return;
    var b = d.booking;
    API.post('/api/bookings/', {listing:b.listing, fmt:d.fmt, qty:d.qty, date:d.date, time:d.time, accepted_terms:true}).then(function(j){
      var s = mapBooking(j), i = state.bookings.indexOf(b); if(i >= 0) state.bookings[i] = s; repaint();
    }).catch(function(e){ var i = state.bookings.indexOf(b); if(i >= 0) state.bookings.splice(i, 1); repaint(); say(e); });
  });
  ev('answer', function(d){
    if(!on('bookings')) return;
    API.post('/api/bookings/' + encodeURIComponent(d.id) + '/answer/', {accept:!!d.ok}).then(function(j){
      var s = mapBooking(j); state.incoming = (state.incoming || []).map(function(x){ return x.id === s.id ? s : x; }); repaint();
    }).catch(function(e){ say(e); loadBookings(); });
  });
})();
