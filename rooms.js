/* rooms.js -- room layouts for one unit level, in metres, with circulation and clearances built in.
   Every layout is a list of rectangles {name, x, y, w, h} in the unit's own frame: x from its left party or
   exterior wall, y from its street (front) face. Rules used throughout:
     - a unit that spans several levels has one stair rectangle in the same place on every level (it stacks),
       0.95-1.2 m wide and 3.4-4.3 m long, with a landing in front of it;
     - every served room (bedroom, bath, laundry, storage, den) touches a circulation room (entry, hall,
       landing, living, dining) along at least 0.9 m, so a door can be placed;
     - halls are at least 0.95 m wide, bathrooms at least 1.5 m wide, water closets 0.9 m, bedrooms at least
       2.7 m in their short dimension and 7 m2, kitchens at least 2.1 m across a single counter run;
     - when the unit is too small for the full programme the layout drops rooms in a fixed order (laundry to
       the bath, third bedroom to a study, ensuite to a bath) rather than draw rooms below these sizes.
   R1Plans.check() reports anything the layout still cannot meet. */
var R1Rooms = (function () {
  "use strict";
  var MIN = { hall: 0.95, bath_w: 1.5, wc_w: 0.9, bed_w: 2.7, bed_area: 7.0, kitchen: 2.1, stair_w: 0.95, stair_l: 3.4, door: 0.85, entry: 1.2 };
  var STAIR_L_MAX = 4.3, LANDING = 1.2, SPINE_MAX = 1.2, HALL = 0.95, WC_D = 1.3, BATH_D = 1.7;

  function R(name, x, y, w, h) { return { name: name, x: r2(x), y: r2(y), w: r2(w), h: r2(h), area_m2: r2(w * h) }; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function spineOf(w) { return Math.max(MIN.stair_w, Math.min(SPINE_MAX, 0.18 * w)); }
  function stairLen(d) { return Math.max(Math.min(STAIR_L_MAX, 0.45 * d), Math.min(MIN.stair_l, d - LANDING - 1.0)); }

  // ------------------------------------------------------------------ single-level flat
  function flat(u, w, d) {
    var beds = u ? u.beds : 1, out = [], ew = 1.3, ed = Math.min(1.6, d * 0.2), fd = Math.max(3.0, 0.36 * d);
    if (d - fd - Math.max(2.4, 0.24 * d) - HALL < MIN.bed_w) return shallowFlat(u, w, d);
    if (beds >= 2 && w >= 5.6) {   // second bedroom beside the living room, off it
      var b2 = Math.max(MIN.bed_w, Math.min(3.2, 0.42 * w));
      out.push(R("Entry", 0, 0, ew, ed), R("Living", 0, ed, w - b2, fd - ed), R("Living", ew, 0, w - b2 - ew, ed), R("Bedroom 2", w - b2, 0, b2, fd));
      out = mergeLiving(out);
    } else {
      out.push(R("Entry", 0, 0, ew, ed), R("Living", ew, 0, w - ew, ed), R("Living", 0, ed, w, fd - ed));
      out = mergeLiving(out);
    }
    var kd = Math.max(2.4, 0.24 * d), kw = Math.max(MIN.kitchen, Math.min(3.4, 0.5 * w));
    out.push(R("Kitchen", 0, fd, kw, kd), R("Dining", kw, fd, w - kw, kd));
    var hy = fd + kd, hd = HALL, rd = d - hy - hd;
    out.push(R("Hall", 0, hy, w, hd));
    var bathW = Math.max(MIN.bath_w, Math.min(2.2, 0.28 * w)), laundryW = 0.9, bedW = w - bathW - laundryW;
    if (bedW < MIN.bed_w) { laundryW = 0; bedW = w - bathW; }
    if (bedW < MIN.bed_w) { bathW = MIN.bath_w; bedW = w - bathW; }
    out.push(R(beds >= 2 ? "Bedroom 1" : "Bedroom", 0, hy + hd, bedW, rd), R("Bath", bedW, hy + hd, bathW, rd));
    if (laundryW > 0) out.push(R("Laundry", bedW + bathW, hy + hd, laundryW, rd));
    return out;
  }
  // a flat too shallow for a hall: the bedroom beside the living room at the front, kitchen, dining and bath behind
  function shallowFlat(u, w, d) {
    var beds = u ? u.beds : 1, out = [], ew = 1.3, kd = Math.max(2.4, 0.35 * d), fd = d - kd, bw = Math.max(MIN.bed_w, Math.min(3.2, 0.42 * w));
    out.push(R("Entry", 0, 0, ew, Math.min(1.6, fd * 0.4)), R("Living", ew, 0, w - ew - bw, Math.min(1.6, fd * 0.4)), R("Living", 0, Math.min(1.6, fd * 0.4), w - bw, fd - Math.min(1.6, fd * 0.4)));
    out.push(R(beds >= 2 ? "Bedroom 1" : "Bedroom", w - bw, 0, bw, fd));
    var bathW = Math.max(MIN.bath_w, Math.min(2.0, 0.28 * w)), dw = 2.0, kw = w - bathW - dw;
    if (kw < MIN.kitchen) { dw = Math.max(1.2, w - bathW - MIN.kitchen); kw = w - bathW - dw; }
    out.push(R("Kitchen", 0, fd, kw, kd), R("Dining", kw, fd, dw, kd), R("Bath", kw + dw, fd, bathW, kd));
    return mergeLiving(out);
  }
  // the living room is drawn as one L-shaped area made of two rectangles; the largest carries the name
  function mergeLiving(rooms) {
    var parts = rooms.filter(function (r) { return r.name === "Living"; }), main = parts.reduce(function (a, b) { return b.area_m2 > a.area_m2 ? b : a; }, parts[0]);
    parts.forEach(function (r) { if (r !== main) r.part = true; });
    return rooms;
  }

  // ------------------------------------------------------------------ multi-level units: a spine on the left
  // level 0 (living): entry, stair, hall, WC in the spine; living, dining, kitchen beside it
  function living(u, w, d, ctx) {
    var s = ctx.spine, L = ctx.stairL, e = LANDING, out = [];
    out.push(R("Entry", 0, 0, s, e), R("Stair", 0, e, s, L));
    var hallD = d - e - L - WC_D;
    if (hallD >= 0.9) { out.push(R("Hall", 0, e + L, s, hallD)); out.push(R("WC", 0, d - WC_D, s, WC_D)); }
    else out.push(R("WC", 0, e + L, s, d - e - L));
    // living, dining and kitchen bands: their minimums first (3.0, 2.2 and 2.1 m), the rest of the depth shared out
    var wb = w - s, ld = 3.0, dd = 2.2, kd = MIN.kitchen, extra = d - ld - dd - kd;
    if (extra >= 0) { ld += extra * 0.5; dd += extra * 0.2; kd += extra * 0.3; } else { var f = d / (ld + dd + kd); ld *= f; dd *= f; kd *= f; }
    out.push(R("Living", s, 0, wb, ld), R("Dining", s, ld, wb, dd), R("Kitchen", s, ld + dd, wb, kd));
    return out;
  }
  // an entry level under a living level (three-level townhouse): entry, stair, den, bath, storage, patio
  function entryLevel(u, w, d, ctx) {
    var s = ctx.spine, L = ctx.stairL, e = LANDING, out = [], den = !!(u && u.den);
    out.push(R("Entry", 0, 0, s, e), R("Stair", 0, e, s, L), R("Hall", 0, e + L, s, d - e - L));
    // the den beside the stair, then a short hall across the unit so the bath and the storage both open off it
    var wb = w - s, dd = e + L, bd = BATH_D, pd = d - dd - HALL - bd;
    out.push(R(den ? "Den" : "Flex room", s, 0, wb, dd), R("Hall", s, dd, wb, HALL));
    var bathW = Math.max(MIN.bath_w, Math.min(2.0, 0.4 * wb));
    out.push(R("Bath", s, dd + HALL, bathW, bd), R("Storage", s + bathW, dd + HALL, wb - bathW, bd));
    if (pd >= 1.5) out.push(R("Patio", s, dd + HALL + bd, wb, pd)); else { out[out.length - 1].h = r2(bd + pd); out[out.length - 2].h = r2(bd + pd); }
    return out;
  }
  // bedroom level: stair in the same place, landing in front, hall beside the stair, rooms off the hall
  function bedroomLevel(u, w, d, ctx) {
    var s = ctx.spine, L = ctx.stairL, e = LANDING, beds = u ? u.beds : 2, baths = u ? u.baths : 1, out = [];
    out.push(R("Landing", 0, 0, s, e), R("Stair", 0, e, s, L));
    var hw = HALL, wb = w - s - hw, rearY = e + L + HALL, rearD = d - rearY;
    var threeAtRear = beds >= 3 && rearD >= 3.0 && w / 2 >= MIN.bed_w;
    if (threeAtRear) {
      // hall beside the stair, a short hall across the unit behind it, two bedrooms at the rear
      out.push(R("Hall", s, 0, hw, e + L), R("Hall", 0, e + L, w, HALL));
      var pd = Math.max(3.0, Math.min(3.6, (e + L) - BATH_D)), bd = (e + L) - pd;
      var ensuite = baths >= 2 && wb >= 4.2;
      if (ensuite) { var ew = Math.max(1.5, Math.min(2.0, 0.34 * wb)); out.push(R("Primary bedroom", s + hw, 0, wb - ew, pd), R("Ensuite", s + hw + wb - ew, 0, ew, pd)); }
      else out.push(R("Primary bedroom", s + hw, 0, wb, pd));
      var bathW = Math.max(MIN.bath_w, Math.min(2.2, 0.45 * wb));
      out.push(R("Bath", s + hw, pd, bathW, bd), R("Laundry", s + hw + bathW, pd, wb - bathW, bd));
      out.push(R("Bedroom 2", 0, rearY, w / 2, rearD), R("Bedroom 3", w / 2, rearY, w / 2, rearD));
      return out;
    }
    // hall the full depth beside the stair; rooms in a column; laundry in the spine behind the stair
    out.push(R("Hall", s, 0, hw, d));
    var back = d - e - L;
    if (back >= 0.9) out.push(R("Laundry", 0, e + L, s, back));
    var pd2 = Math.max(3.0, 0.4 * d), bd2 = BATH_D, b2d = d - pd2 - bd2;
    if (b2d < MIN.bed_w) { pd2 = Math.max(MIN.bed_w, d - bd2 - MIN.bed_w); b2d = d - pd2 - bd2; }
    var ens2 = baths >= 2 && wb >= 4.2;
    if (ens2) { var ew2 = Math.max(1.5, Math.min(2.0, 0.34 * wb)); out.push(R("Primary bedroom", s + hw, 0, wb - ew2, pd2), R("Ensuite", s + hw + wb - ew2, 0, ew2, pd2)); }
    else out.push(R("Primary bedroom", s + hw, 0, wb, pd2));
    out.push(R("Bath", s + hw, pd2, wb, bd2));
    if (beds >= 3 && wb >= 2 * MIN.bed_w) out.push(R("Bedroom 2", s + hw, pd2 + bd2, wb / 2, b2d), R("Bedroom 3", s + hw + wb / 2, pd2 + bd2, wb / 2, b2d));
    else if (beds >= 2) out.push(R("Bedroom 2", s + hw, pd2 + bd2, wb, b2d));
    else out.push(R("Study", s + hw, pd2 + bd2, wb, b2d));
    return out;
  }
  // attic level (the duplex's third level within the roof): stair, hall, bedroom 3, bath, den, terrace
  function attic(u, w, d, ctx) {
    var s = ctx.spine, L = ctx.stairL, e = LANDING, out = [], den = !!(u && u.den);
    out.push(R("Landing", 0, 0, s, e), R("Stair", 0, e, s, L), R("Hall", s, 0, HALL, e + L), R("Hall", 0, e + L, w, HALL));
    var wb = w - s - HALL, bd = Math.max(MIN.bed_w, (e + L) - BATH_D), bathW = Math.max(MIN.bath_w, Math.min(2.2, 0.45 * wb));
    out.push(R("Bedroom 3", s + HALL, 0, wb, bd), R("Bath", s + HALL, bd, bathW, (e + L) - bd), R("Storage", s + HALL + bathW, bd, wb - bathW, (e + L) - bd));
    var rearY = e + L + HALL, rearD = d - rearY;
    if (rearD >= 1.5) out.push(R(den ? "Den" : "Study", 0, rearY, w / 2, rearD), R("Terrace", w / 2, rearY, w / 2, rearD));
    return out;
  }

  // ------------------------------------------------------------------ non-dwelling ground cells
  function common(u, w, d) {
    var ew = 1.3, ed = Math.min(2.0, 0.28 * d), out = [R("Entry", 0, 0, ew, ed), R("Lobby, mail", ew, 0, w - ew, ed)];
    var kw = Math.max(1.8, 0.28 * w), wcW = MIN.wc_w;
    out.push(R("Common room", 0, ed, w - kw - wcW, d - ed), R("Kitchenette", w - kw - wcW, ed, kw, d - ed), R("WC", w - wcW, ed, wcW, d - ed));
    return out;
  }
  function shop(u, w, d) {
    var sd = Math.max(3.0, 0.62 * d), boh = w - MIN.wc_w - 1.2;
    return [R("Shop floor", 0, 0, w, sd), R("Back of house", 0, sd, boh, d - sd), R("WC", boh, sd, MIN.wc_w, d - sd), R("Storage", boh + MIN.wc_w, sd, 1.2, d - sd)];
  }
  function daycare(u, w, d) {
    var ew = 1.3, ed = Math.min(1.8, 0.25 * d), pd = Math.max(3.0, 0.55 * d) - ed;
    var out = [R("Entry", 0, 0, ew, ed), R("Play room", ew, 0, w - ew, ed), R("Play room", 0, ed, w, pd)];
    var y = ed + pd, rd = d - y, nw = Math.max(2.4, 0.38 * w), kw = Math.max(1.8, 0.24 * w), ow = w - nw - kw - MIN.wc_w;
    out.push(R("Nap room", 0, y, nw, rd), R("Kitchen", nw, y, kw, rd), R("WC", nw + kw, y, MIN.wc_w, rd), R("Office", nw + kw + MIN.wc_w, y, ow, rd));
    return out;
  }

  /* layout(role, unit, w, d, ctx): rooms for one level. ctx carries the stair geometry shared by all the
     levels of a unit: {spine, stairL} (computed once per unit with unitCtx). */
  function unitCtx(w, d) { return { spine: r2(spineOf(w)), stairL: r2(stairLen(d)) }; }
  function layout(role, u, w, d, ctx) {
    ctx = ctx || unitCtx(w, d);
    var rooms;
    if (role === "flat") rooms = flat(u, w, d);
    else if (role === "living") rooms = living(u, w, d, ctx);
    else if (role === "entry") rooms = entryLevel(u, w, d, ctx);
    else if (role === "bedroom") rooms = bedroomLevel(u, w, d, ctx);
    else if (role === "attic") rooms = attic(u, w, d, ctx);
    else if (role === "common") rooms = common(u, w, d);
    else if (role === "shop") rooms = shop(u, w, d);
    else if (role === "daycare") rooms = daycare(u, w, d);
    else rooms = [R("Unit", 0, 0, w, d)];
    return rooms.filter(function (r) { return r.w > 0.05 && r.h > 0.05; });
  }
  return { MIN: MIN, layout: layout, unitCtx: unitCtx, LANDING: LANDING, HALL: HALL };
})();
