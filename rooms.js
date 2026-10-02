/* rooms.js -- room layouts for one unit level, in metres, built from the standard test fits in fits.js and the
   adjacencies of the CMHC Housing Design Catalogue plans (BC: Fourplex 01 and 02, Rowhouse, Duplex, Courtyard
   Sixplex, ADU 02, read 2026-10-01) and of ordinary townhouse and apartment practice:
     - the entry opens into a vestibule with a coat closet, and from there into the living space; the stair of a
       townhouse starts at the entry, along the party wall, and lands in a hall;
     - living, dining and kitchen are one open space: the kitchen has no door and stands against the back or a side
       wall, open along its whole front;
     - bedrooms and bathrooms open off a hall (a short hall off the living room, a cross hall, or the upper landing),
       never off the kitchen or another bedroom; a powder room may open off the entry hall or the dining area;
       the primary bedroom gets the ensuite and a walk-in closet off itself;
     - laundry and mechanical are closets off a hall, beside the bathroom; no leftover "storage rooms": spare depth
       goes to the bedrooms, the bath row, a study or a patio;
     - a bedroom turns its back on an open walkway when its wing has windows on the far side;
     - a unit entered above grade from an exterior stair has its bedrooms on the entry level and its living level on
       top (Fourplex 01, the Sixplex's U3 and U4); one entered at grade has the living level below (cmhc.js decides).
   Every layout is a list of rectangles {name, x, y, w, h} in the unit's own frame: x across from its left party
   or exterior wall, y from the face it is entered on (cmhc.js flips or transposes the frame onto the right face,
   the rear face or a side face). The sizes: entry 1.3 x 1.5; halls 1.0 (BCBC 9.5.3 minimum 0.86); bath 2.2 x 1.8
   (one wall, dimensions.com 2.13-2.74 x 1.52-1.83 m), powder room 1.45 x 1.5; kitchen band 1.8-3.4 deep (0.6 m
   counter, 1.2 m aisle, an island when 3 m or deeper), run 2.4 m or more; living 3.2 m or wider, dining 2.7 m;
   bedrooms sized to the bed they hold with 0.76 m clear (queen 1.52 x 2.03, double 1.37 x 1.91, twin 0.97 x 1.91);
   laundry closet 0.95-1.2 m; no closet over 4.5 m2. Stairs are sized on a 3.1 m floor-to-floor at most (BCBC 9.8:
   rise <= 200, run 260): a U-stair core 2.0 x 3.0 m, or a straight run 1.0 x 4.9 m along the party wall, or, in a
   shallow unit, the U-stair across the back wall. R1Plans.check() reports whatever a small unit still cannot meet. */
var R1Rooms = (function () {
  "use strict";
  var F = R1Fits, ST = F.STAIR;
  var MIN = { hall: 0.9, bath_w: 1.5, wc_w: 1.35, bed_w: 2.5, bed_area: 7.5, kitchen: 1.7, kitchen_run: 2.1, living_w: 3.2, dining_w: 2.6, stair_w: 0.86, stair_l: 3.0, door: 0.86, entry: 1.2, service_m2: 4.5, bed_max_m2: 22 };
  var HALL = 1.0, ENTRY_D = 1.5, ENTRY_W = 1.3, WET = 1.8, BATH_W = 2.2, BATH_D = 1.8, WC_W = 1.45, WC_D = 1.5, LDRY = 1.0, MECH = 0.9, CLOSET = 1.2, SLIVER = 0.95, FH_MAX = 3.1, SERVICE_M2 = 4.5;
  function r2(v) { return Math.round(v * 100) / 100; }
  function R(name, x, y, w, h, extra) { var r = { name: name, x: r2(x), y: r2(y), w: r2(w), h: r2(h), area_m2: r2(w * h) }; if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; }); return r; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function grow(r, dw, dh) { r.w = r2(r.w + (dw || 0)); r.h = r2(r.h + (dh || 0)); r.area_m2 = r2(r.w * r.h); }

  // the stair of a unit, sized on a realistic floor-to-floor (the by-law height is a maximum, not a storey height):
  // across the back wall of a shallow unit, a U-stair core when the unit is wide enough for it plus a hall and a
  // bedroom, else a straight run along the party wall
  function stairModule(fh, w, d) {
    fh = Math.min(fh || 3.0, FH_MAX);
    var risers = Math.ceil(fh / ST.rise_max), per = Math.ceil(risers / 2), uL = r2(Math.max(3.0, (per - 1) * ST.run + ST.landing)), sL = r2((risers - 1) * ST.run + 1.0);
    if (d >= 7.0 && d < 8.4 && d - ENTRY_D - sL < 2.9 && w >= uL + 1.5 && w < 8.6) return { kind: "u_back", w: uL, l: 2.0, risers: risers, fh: r2(fh) };   // no room for a bedroom behind a straight run: bedrooms across the front, the stair across the back
    if (w >= 6.1 && d >= 7.0) return { kind: "u", w: 2.0, l: uL, risers: risers, fh: r2(fh) };
    return { kind: "straight", w: 1.0, l: sL, risers: risers, fh: r2(fh) };
  }
  /* unitCtx(w, d, opts): what all the levels of a unit share: the stair module (from the floor-to-floor height),
     which faces of the unit are exterior in its own frame (opts.win = {front, back, left, right}), whether its
     entry face is an open walkway (opts.walk), this level's index and the level count, and how many bedrooms
     this level should hold (opts.beds). */
  function unitCtx(w, d, opts) {
    opts = opts || {};
    var fh = opts.fh || 3.0;
    return { stair: stairModule(fh, w, d), fh: Math.min(fh, FH_MAX), win: opts.win || { front: true, back: false, left: false, right: false }, walk: !!opts.walk, entry: opts.entry || "front", level: opts.level || 0, levels: opts.levels || 1, beds: opts.beds };
  }
  // the living room (or the studio) is drawn as one L-shaped area made of two rectangles; the largest carries the name
  function mergeParts(rooms, name) {
    var parts = rooms.filter(function (r) { return r.name === name; });
    if (parts.length < 2) return rooms;
    var main = parts.reduce(function (a, b) { return b.area_m2 > a.area_m2 ? b : a; }, parts[0]);
    parts.forEach(function (r) { if (r !== main) r.part = true; });
    return rooms;
  }
  // a stack of service rooms down a strip x..x+w from y, h deep: the bath first (2.2 deep), then laundry and
  // mechanical closets, then closets no bigger than a closet; a sliver at the end goes to the last of them
  function serviceStack(out, x, y, w, h, spec) {
    var cy = y, rest = h, first = out.length;
    function put(name, dd) { out.push(R(name, x, cy, w, dd)); cy += dd; rest -= dd; }
    if (spec.bath && rest >= 2.0 && w >= MIN.bath_w) put(spec.bath, Math.min(BATH_W, rest));
    if (spec.laundry && rest >= LDRY) put("Laundry", Math.min(1.2, rest));
    if (spec.mech && rest >= MECH) put("Mechanical", Math.min(1.0, rest));
    var rooms = ["Study", "Office"], k = 0;
    while (rest >= 2.4 && w >= 2.0 && k < rooms.length) { put(rooms[k], Math.min(rest, 3.6)); k++; }   // a long strip holds a study off the hall before more closets
    var names = ["Closet", "Linen", "Storage"], cap = Math.max(0.9, SERVICE_M2 / w - 0.05);
    if (rest >= 0.9) {   // closets of equal depth, at least 0.9 m (their doors) and none bigger than a closet
      var n = Math.max(1, Math.ceil(rest / cap)); if (rest / n < 0.9) n = Math.max(1, Math.floor(rest / 0.9));
      var each = rest / n; for (var i = 0; i < n; i++) put(names[Math.min(i, names.length - 1)], i === n - 1 ? rest : each);
    } else if (rest > 0.02 && out.length > first) { grow(out[first], 0, rest); for (var j = first + 1; j < out.length; j++) out[j].y = r2(out[j].y + rest); }   // the sliver goes to the first of them
    else if (rest > 0.02) out.push(R("Closet", x, cy, w, rest));
  }
  // a row of service rooms across x..x+w, h deep (the entry level's bath and closets)
  function serviceRow(out, x, y, w, h, opts) {
    var cx = x, rest = w, first = out.length;
    function put(name, ww) { out.push(R(name, cx, y, ww, h)); cx += ww; rest -= ww; }
    if (opts.bath && rest >= BATH_W + 0.3) put(opts.bath, BATH_W); else if (opts.bath && rest >= MIN.bath_w) { put(opts.bath, rest); return; }
    if (opts.laundry && rest >= LDRY) {   // a laundry closet; a sliver beside it widens it (never past a closet's size) or the bath
      var lw = LDRY, over = rest - LDRY;
      if (over > 0.02 && over < 0.9) { if (lw + over <= SERVICE_M2 / h) lw += over; else if (out.length > first) { grow(out[out.length - 1], over, 0); cx += over; rest -= over; } else lw += over; }
      put("Laundry", lw);
    }
    var cap = Math.max(0.9, SERVICE_M2 / h - 0.05), names = [opts.closet || "Closet", "Linen", "Storage"];
    if (rest >= 0.9) {   // closets of equal width, each at least 0.9 m (its door) and none bigger than a closet
      var n = Math.max(1, Math.ceil(rest / cap)); if (rest / n < 0.9) n = Math.max(1, Math.floor(rest / 0.9));
      var each = rest / n; for (var i = 0; i < n; i++) put(names[Math.min(i, names.length - 1)], i === n - 1 ? rest : each);
    } else if (rest > 0.02 && out.length > first) grow(out[out.length - 1], rest, 0);
    else if (rest > 0.02) put(opts.closet || "Closet", rest);
  }
  /* a private column beside the living space: the bedroom on the window wall (or at the back, turned from a
     walkway), a 1.0 m hall running along the living space's edge, and the service stack beside the hall.
     hallSide "R": the living stands to the right of the column; "L": to its left. */
  function privateColumn(out, x0, ww, d, hallSide, bedName, bedBack, spec, livingD) {
    var hw = HALL, hx = hallSide === "R" ? x0 + ww - hw : x0, rx = hallSide === "R" ? x0 : x0 + hw, rw = ww - hw;
    var bedD = clamp(d - 4.1, 3.2, 4.4);
    if (!bedBack && livingD) bedD = Math.max(3.0, Math.min(bedD, livingD - 1.2));   // the hall opens off the living room over 1.2 m at least, not off the kitchen
    if (!bedBack) {
      out.push(R(bedName, x0, 0, ww, bedD), R("Hall", hx, bedD, hw, d - bedD));
      serviceStack(out, rx, bedD, rw, d - bedD, spec);
    } else {
      out.push(R("Hall", hx, 0, hw, d - bedD), R(bedName, x0, d - bedD, ww, bedD));
      serviceStack(out, rx, 0, rw, d - bedD, spec);
    }
  }

  // ------------------------------------------------------------------ single-level flats
  // a studio: entry in the corner, one room for living and sleeping, bath (off the room) and open kitchen across the back
  function studio(u, w, d, ctx) {
    var out = [], kd = clamp(d - 4.6, 1.8, 2.4), fd = d - kd, bathW = Math.max(MIN.bath_w, Math.min(BATH_W, w - 2.4)), ldry = w - bathW - LDRY >= 2.4 ? LDRY : 0;
    out.push(R("Entry", 0, 0, ENTRY_W, ENTRY_D), R("Studio", ENTRY_W, 0, w - ENTRY_W, ENTRY_D), R("Studio", 0, ENTRY_D, w, fd - ENTRY_D));
    out.push(R("Bath", 0, fd, bathW, kd), R("Kitchen", bathW, fd, w - bathW - ldry, kd));
    if (ldry) out.push(R("Laundry", w - ldry, fd, ldry, kd));
    return mergeParts(out, "Studio");
  }
  /* flat(unit, w, d, ctx): the one-level flat for the cell's proportions:
       - wide (9.6 m or more across): the living space in the middle bay between bedroom wings at the ends;
       - deep (8 m or more): a hall along the blind party wall, living in front, wet band, bedrooms behind;
       - otherwise: a living column beside a private column (bedroom, short hall, bath and closets). */
  function flat(u, w, d, ctx) {
    var beds = u ? u.beds : 1;
    if (beds === 0) return studio(u, w, d, ctx);
    if (w >= 9.6 && d >= 6.2) return flatWide(u, w, d, ctx);
    if (d >= 8.0 && (beds >= 2 || w < 6.2 || d >= 9.0)) return flatDeep(u, w, d, ctx);
    if (w >= 6.2 && d >= 6.6) return flatColumns(u, w, d, ctx);
    return flatDeep(u, w, d, ctx);
  }
  // the wide flat: entry and living (dining and kitchen behind them, open) in the middle bay; a wing at each end with a
  // bedroom on the window wall, a short hall along the living room, and the bath, laundry and closets beside the hall.
  // A one-bedroom flat gets one bedroom wing and, when the width allows, a den wing with the closets behind it.
  // Entered from a side face (the rear cell of two stacked flats, reached by the side path), the wing on that side
  // carries the entry: a vestibule at the face, a cross hall to the living room, the bath and closets behind the hall.
  function flatWide(u, w, d, ctx) {
    var beds = Math.max(1, u ? u.beds : 1), baths = u ? u.baths : 1, out = [], side = ctx.entry === "left" || ctx.entry === "right" ? ctx.entry : null;
    var wb = beds >= 2 || side ? clamp((w - 3.6) / 2, 3.2, 4.0) : clamp(w * 0.3, 3.2, 4.0);
    var twoWings = beds >= 2 || side, denW = !twoWings && w - wb - 4.2 >= 2.6 ? clamp(w - wb - 4.6, 2.6, 3.2) : 0;
    var xL = twoWings ? wb : denW, xR = w - wb, mid = xR - xL;
    var kd = clamp(d - 4.6, 2.4, 3.4), dl = d - kd;
    // the middle bay: the entry at its front corner (unless a wing carries it), the living room, dining and kitchen across the back
    if (side) out.push(R("Living", xL, 0, mid, dl));
    else out.push(R("Entry", xL, 0, ENTRY_W, ENTRY_D), R("Living", xL + ENTRY_W, 0, mid - ENTRY_W, ENTRY_D), R("Living", xL, ENTRY_D, mid, dl - ENTRY_D));
    if (mid >= 6.0 && kd >= 2.9) out.push(R("Dining", xL, dl, 2.9, kd), R("Kitchen", xL + 2.9, dl, mid - 2.9, kd));
    else out.push(R("Kitchen", xL, dl, mid, kd));
    var backR = ctx.walk && ctx.win.right, backL = ctx.walk && ctx.win.left;
    // the entry wing: bedroom in front, the cross hall with the vestibule at the face, the bath row behind
    function entryWing(x0, atLeft, name, spec) {
      var db = Math.max(3.0, Math.min(clamp(d - 4.4, 3.2, 4.2), dl - 1.2)), hh = 1.1, ex = atLeft ? x0 : x0 + wb - ENTRY_W;
      out.push(R(name, x0, 0, wb, db), R("Entry", ex, db, ENTRY_W, hh), R("Hall", atLeft ? x0 + ENTRY_W : x0, db, wb - ENTRY_W, hh));
      serviceRow(out, x0, db + hh, wb, d - db - hh, spec);
    }
    if (side === "left") { entryWing(0, true, beds >= 2 ? "Bedroom 2" : "Bedroom", { bath: "Bath", laundry: true, closet: "Closet" }); }
    else if (side === "right") { entryWing(xR, false, "Bedroom 1", { bath: "Bath", laundry: true, closet: "Closet" }); }
    if (side !== "right") {
      if (beds >= 2 || side === "left") privateColumn(out, xR, wb, d, "L", beds >= 2 ? "Bedroom 1" : "Study", backR, side ? (baths >= 2 ? { bath: "Bath", mech: true } : { mech: true }) : { bath: "Bath", laundry: true }, dl);
      else privateColumn(out, xR, wb, d, "L", "Bedroom", backR, { bath: "Bath", laundry: true }, dl);
    }
    if (side !== "left") {
      if (beds >= 2) privateColumn(out, 0, wb, d, "R", side === "right" ? "Bedroom 2" : "Bedroom 2", backL, side ? (baths >= 2 ? { bath: "Bath", mech: true } : { mech: true }) : (baths >= 2 ? { bath: "Bath", mech: true } : { mech: true }), dl);
      else if (side === "right") privateColumn(out, 0, wb, d, "R", "Study", backL, { mech: true }, dl);
      else if (denW) { out.push(R("Den", 0, 0, denW, dl)); serviceStack(out, 0, dl, denW, kd, { mech: true }); }   // the closets behind the den open off the kitchen
    }
    return mergeParts(out, "Living");
  }
  // the deep flat: entry and hall along the blind party wall, living (and dining) at the entry face, the wet band
  // across the middle (bath beside the hall, laundry, kitchen open to the living), bedrooms at the back off the hall
  function flatDeep(u, w, d, ctx) {
    var beds = u ? u.beds : 1, out = [], mirror = ctx.win.left && !ctx.win.right, hw = w < 5.5 ? 0.9 : HALL;   // the hall takes the blind side
    var twoBack = beds >= 2 && w - hw >= 6.0 && d >= 9.4;
    var db = clamp(d - WET - 3.4 - (twoBack ? HALL : 0), 3.0, beds === 1 && w - CLOSET >= 5.0 ? 3.4 : 3.8), dl = d - WET - db - (twoBack ? HALL : 0), yWet = dl, yBack = yWet + WET + (twoBack ? HALL : 0);   // a wide single bedroom stays a bedroom, not a hall of its own
    out.push(R("Entry", 0, 0, hw, ENTRY_D), R("Hall", 0, ENTRY_D, hw, yWet + WET - ENTRY_D));
    var lx = hw, lw = w - hw;
    if (dl >= 6.2) out.push(R("Living", lx, 0, lw, dl - 2.9), R("Dining", lx, dl - 2.9, lw, 2.9));
    else if (lw >= 6.3) out.push(R("Living", lx, 0, lw - 2.7, dl), R("Dining", lx + lw - 2.7, 0, 2.7, dl));
    else out.push(R("Living / dining", lx, 0, lw, dl));
    var x = hw, bw = Math.min(BATH_W, Math.max(MIN.bath_w, w - hw - MIN.kitchen_run));
    out.push(R("Bath", x, yWet, bw, WET)); x += bw;
    if (w - x - LDRY >= 2.4) { out.push(R("Laundry", x, yWet, LDRY, WET)); x += LDRY; }
    out.push(R("Kitchen", x, yWet, w - x, WET));
    if (twoBack) {
      out.push(R("Hall", 0, yWet + WET, w, HALL));
      var w1 = clamp(0.55 * w, 3.0, w - 3.0);
      out.push(R("Bedroom 1", 0, yBack, w1, db), R("Bedroom 2", w1, yBack, w - w1, db));
    } else {
      out.push(R(beds >= 2 ? "Bedroom 1" : "Bedroom", 0, yBack, w - CLOSET, db), R("Closet", w - CLOSET, yBack, CLOSET, db));
    }
    if (mirror) out.forEach(function (r) { r.x = r2(w - r.x - r.w); });
    return out;
  }
  // the shallow flat: a living column (entry, living, open kitchen across the back) beside a private column
  function flatColumns(u, w, d, ctx) {
    var out = [], wl = clamp(w - 3.2, 3.2, 4.4); if (w - wl < 3.0) wl = w - 3.0;
    var wp = w - wl, kd = clamp(d - 4.8, 2.4, 3.2), dl = d - kd;
    out.push(R("Entry", 0, 0, ENTRY_W, ENTRY_D), R("Living / dining", ENTRY_W, 0, wl - ENTRY_W, ENTRY_D), R("Living / dining", 0, ENTRY_D, wl, dl - ENTRY_D), R("Kitchen", 0, dl, wl, kd));
    privateColumn(out, wl, wp, d, "L", "Bedroom", ctx.walk && ctx.win.right, { bath: "Bath", laundry: true, mech: true }, dl);
    return mergeParts(out, "Living / dining");
  }

  // ------------------------------------------------------------------ multi-level units: the stair column along the party wall
  // the living level: entry (or the landing, when the unit is entered on its bedroom level), the stair and, behind it,
  // the powder room and the laundry and mechanical closets (an office when the column runs on); living, dining and
  // kitchen beside it, open, the kitchen at the back. In a narrow unit the powder room stands beside the kitchen.
  function living(u, w, d, ctx) {
    var st = ctx.stair, sw = st.w, L = st.l, out = [], yA = ENTRY_D + L, entry = ctx.level === 0, wb = w - sw, x = sw;
    out.push(R(entry ? "Entry" : "Landing", 0, 0, sw, ENTRY_D), R("Stair", 0, ENTRY_D, sw, L, { stair: st, upper: !entry }));
    var dl = 3.2, dd = 2.7, dk = WET, need = dl + dd + dk, extra = d - need;
    if (extra >= 0) { dl += extra * 0.45; dd += extra * 0.3; dk += extra * 0.25; if (dk > 3.0) { var over = dk - 3.0; dk = 3.0; dl += over * 0.6; dd += over * 0.4; } }
    var wcInColumn = sw >= WC_W && d - yA >= WC_D, wcBeside = !wcInColumn && wb - WC_W >= MIN.kitchen_run + 0.3, y = yA;
    if (wcInColumn) {
      if (extra >= 0 && dl > y + 0.4) { var shift = Math.min(dl - y - 0.4, dl - 3.2); dl -= shift; dd += shift; }   // the dining reaches the powder room's door
      out.push(R("WC", 0, y, sw, WC_D)); y += WC_D;
    }
    var rest = d - y;
    if (rest >= 2.6 && sw >= 1.8) out.push(R("Office", 0, y, sw, rest));
    else if (rest >= 0.6) serviceStack(out, 0, y, sw, rest, { laundry: true, mech: true });
    else if (rest > 0.02) grow(out[out.length - 1], 0, rest);
    if (extra >= 0) {
      if (wb >= 8.0) out.push(R("Living", x, 0, wb - 3.4, dl), R("Den", x + wb - 3.4, 0, 3.4, dl)); else out.push(R("Living", x, 0, wb, dl));
      out.push(R("Dining", x, dl, wb, dd));
      var yk = dl + dd, kw = wb - (wcBeside ? WC_W : 0);
      if (kw >= 8.0) { out.push(R("Kitchen", x, yk, kw - 1.4, dk), R("Storage", x + kw - 1.4, yk, 1.4, Math.min(dk, SERVICE_M2 / 1.4))); if (dk > SERVICE_M2 / 1.4) grow(out[out.length - 2], 0, 0); }
      else out.push(R("Kitchen", x, yk, kw, dk));
      if (wcBeside) out.push(R("WC", x + kw, yk, WC_W, dk));
    } else {   // too short for two rooms: one open room with the table by the window
      dk = WET; var kw2 = wb - (wcBeside ? WC_W : 0);
      out.push(R("Living / dining", x, 0, wb, d - dk), R("Kitchen", x, d - dk, kw2, dk));
      if (wcBeside) out.push(R("WC", x + kw2, d - dk, WC_W, dk));
    }
    return out;
  }
  // the bedroom level of a narrow unit: the landing (or the entry, when the unit is entered here) and the stair in
  // the column with a laundry closet behind them; a hall beside the column; the primary bedroom at the front with
  // its ensuite and walk-in closet when the width allows; the bath row behind it; the other bedrooms across the
  // back off the hall (a cross hall when two stand side by side); spare depth goes to the rooms, never to a store
  function bedroomLevel(u, w, d, ctx, opts) {
    opts = opts || {};
    var st = ctx.stair, sw = st.w, L = st.l, core = st.kind === "u", beds = opts.beds !== undefined ? opts.beds : (ctx.beds !== undefined ? ctx.beds : (u ? u.beds : 2)), baths = u ? u.baths : 1, out = [], entry = ctx.level === 0 && !opts.attic;
    if (core && w - sw - HALL >= 5.6) return bedroomWide(u, w, d, ctx, opts, beds, baths, entry);
    if (entry) out.push(R("Entry", 0, 0, sw, ENTRY_D), R("Stair", 0, ENTRY_D, sw, L, { stair: st }));
    else if (core) out.push(R("Landing", 0, 0, sw, ENTRY_D), R("Stair", 0, ENTRY_D, sw, L, { stair: st, upper: true }));
    else out.push(R("Closet", 0, 0, sw, ENTRY_D), R("Stair", 0, ENTRY_D, sw, L - 1.0, { stair: st, upper: true }), R("Landing", 0, ENTRY_D + L - 1.0, sw, 1.0));
    var yA = ENTRY_D + L, hx = sw, bx = sw + HALL, wb = w - bx, primary = opts.primary || "Primary bedroom", bd = 2.2;
    var dp = clamp(0.36 * d, 3.2, 4.0);
    if (yA - bd > dp && yA - bd <= 4.6) dp = yA - bd;   // the bath row meets the end of the stair column: no leftover between them
    if (beds >= 3 && w >= 6.0 && d - Math.max(yA, dp + bd) < 3.0 + HALL && d - Math.max(yA, 3.2 + bd) >= 3.0 + HALL) dp = 3.2;   // room for two bedrooms across the back
    var ens = baths >= 2 && wb >= 5.4 && !opts.attic, ensD = Math.min(BATH_D + 0.4, dp - 1.0);
    if (ens) out.push(R(primary, bx, 0, wb - BATH_W, dp), R("Ensuite", bx + wb - BATH_W, 0, BATH_W, ensD), R("Closet", bx + wb - BATH_W, ensD, BATH_W, dp - ensD));
    else out.push(R(primary, bx, 0, wb, dp));
    var yBack = Math.max(yA, dp + bd), rowD = yBack - dp;
    if (rowD > 2.8) {   // the primary bedroom grows rather than the bath row
      var g = rowD - 2.8; rowD = 2.8; dp += g;
      out.filter(function (r) { return r.name === primary; }).forEach(function (r) { grow(r, 0, g); });
      if (ens) out.filter(function (r) { return r.name === "Closet" && Math.abs(r.x - (bx + wb - BATH_W)) < 0.01; }).forEach(function (r) { grow(r, 0, g); });
    }
    serviceRow(out, bx, dp, wb, rowD, { bath: "Bath", closet: "Closet" });
    var la = yBack - yA;
    if (la >= 0.6) serviceStack(out, 0, yA, sw, la, { laundry: true, mech: true });
    else if (la > 0.02) { var lastCol = out.filter(function (r) { return r.x === 0 && Math.abs(r.w - sw) < 0.01; }).pop(); grow(lastCol, 0, la); }
    var back = d - yBack, twoBack = beds >= 3 && back >= 3.0 + HALL && back <= 5.4 && w >= 6.0, deep = (back > 5.4 || (beds >= 2 && back >= 2.9 && (w - CLOSET) * back > MIN.bed_max_m2)) && !opts.attic && !twoBack;
    out.push(R("Hall", hx, 0, HALL, deep ? d : yBack));
    if (opts.attic) {
      if (back >= 2.4) { var tw = Math.max(2.4, w * 0.45); out.push(R(opts.den ? "Den" : "Study", 0, yBack, w - tw, back), R("Terrace", w - tw, yBack, tw, back)); }
      else if (back > 0.05) out.push(R("Terrace", 0, yBack, w, back));
    } else if (deep) {
      // a deep unit: the hall runs on and the rooms stand in a row beside it, bedrooms first, each at most 4.4 m deep;
      // the strip beside the column holds closets
      var need = Math.max(0, beds - 1), queue = [];
      for (var k = 2; k <= beds; k++) queue.push("Bedroom " + k);
      queue = queue.concat(["Study", "Office", "Flex room", "Den"]);
      var n = Math.max(1, Math.min(queue.length, Math.floor(back / 2.9))), each = back / n;
      if (each > 4.4) { n = Math.min(queue.length, Math.ceil(back / 4.4)); each = back / n; }
      var yy = yBack;
      for (var q = 0; q < n; q++) { var dq = q === n - 1 ? d - yy : each; out.push(R(queue[q] || "Flex room", bx, yy, wb, dq)); yy += dq; }
      if (back >= 0.6) serviceStack(out, 0, yBack, sw, back, { laundry: !out.some(function (r) { return r.name === "Laundry"; }), mech: true });
    } else if (twoBack) {
      out.push(R("Hall", hx, yBack, w - hx, HALL));
      var yS = yBack + HALL, w2 = clamp(0.5 * w, 3.0, w - 3.0);
      out.push(R("Bedroom 2", 0, yS, w2, d - yS), R("Bedroom 3", w2, yS, w - w2, d - yS));
    } else if (beds >= 2 && back >= 2.9) {
      out.push(R("Bedroom 2", 0, yBack, w - CLOSET, back), R("Closet", w - CLOSET, yBack, CLOSET, back));
    } else if (back >= 1.7) out.push(R("Study", 0, yBack, w, back));
    else if (back > 0.05) out.forEach(function (r) { if (Math.abs(r.y + r.h - yBack) < 0.03) grow(r, 0, back); });   // the row above takes the sliver
    return out;
  }
  // the bedroom level of a wide unit (a U-stair and 5.6 m or more of rooms beside the hall): a hall along the column
  // the whole depth with cross halls off it; the primary suite in front (ensuite, walk-in closet, a second room when
  // the width allows); behind each cross hall a row with the bath and laundry, then bedrooms, then a study, an office,
  // a flex room; in a deep level a second cross hall and row; the attic's last row is the terrace
  function bedroomWide(u, w, d, ctx, opts, beds, baths, entry) {
    var st = ctx.stair, sw = st.w, L = st.l, out = [], yA = ENTRY_D + L, bx = sw + HALL, wb = w - bx;
    if (entry) out.push(R("Entry", 0, 0, sw, ENTRY_D), R("Stair", 0, ENTRY_D, sw, L, { stair: st }));
    else out.push(R("Landing", 0, 0, sw, ENTRY_D), R("Stair", 0, ENTRY_D, sw, L, { stair: st, upper: true }));
    out.push(R("Hall", sw, 0, HALL, d));
    if (d - yA >= 0.6) serviceStack(out, 0, yA, sw, d - yA, { laundry: true, mech: true }); else if (d - yA > 0.02) grow(out[1], 0, d - yA);
    var queue = [], k;
    for (k = 2; k <= beds; k++) queue.push("Bedroom " + k);
    queue = queue.concat(["Study", "Office", "Flex room", "Den", "Play room", "Family room", "Hobby room", "Guest room"]);
    var dp = clamp(0.4 * d, 3.4, 4.4);
    if (opts.attic ? false : (beds >= 2 && d - dp - 1.0 < 2.9)) dp = Math.max(3.2, d - 1.0 - 2.9);
    // the front row: the primary suite (the walk-in closet beside the bedroom, then the ensuite) and, when the width
    // allows, the next room off the cross hall; spare width widens the closet, then the ensuite, then the bedroom
    // the suite column beside the bedroom holds the ensuite over the walk-in closet (or the closet alone), both off the
    // bedroom; the rest of the row takes the next rooms of the queue, 3.0-4.8 m wide each, then a linen closet
    var ens = baths >= 2 && wb >= 7.0 && !opts.attic, sc = ens ? BATH_W : (wb >= 5.4 ? 1.4 : 0), avail = wb - sc, x = bx, primary = opts.primary || "Primary bedroom", PW = Math.min(4.8, MIN.bed_max_m2 / dp);
    var pw = Math.min(avail, PW), left = avail - pw, extra = [];
    if (left > 1.0 && left < 3.0 && pw - (3.0 - left) >= 3.4 && queue.length) { pw -= 3.0 - left; left = 3.0; }   // the bedroom gives up a little so a second room fits
    while (left >= 3.0 && queue.length) { var ew2 = Math.min(left, 4.8); if (left - ew2 > 0.02 && left - ew2 < 3.0) ew2 = left - 1.0 >= 3.0 ? left - 1.0 : left; extra.push([queue.shift(), ew2]); left -= ew2; }
    if (left > 0.02 && left < 1.0 && extra.length) { extra[extra.length - 1][1] += left; left = 0; }
    out.push(R(primary, x, 0, pw, dp)); x += pw;
    if (ens) { var ensD = clamp(dp - 6.3 / sc, 2.0, dp - 1.0); out.push(R("Ensuite", x, 0, sc, ensD), R("Closet", x, ensD, sc, dp - ensD)); x += sc; }
    else if (sc) { out.push(R("Closet", x, 0, sc, dp)); x += sc; }
    extra.forEach(function (e) { out.push(R(e[0], x, 0, e[1], dp)); x += e[1]; });
    var lw = w - x, lastRoom = extra.length ? out[out.length - 1] : out.filter(function (r) { return r.name === primary; })[0];
    if (lw >= 0.9) { var cw2 = Math.min(lw, Math.max(0.9, SERVICE_M2 / dp)); out.push(R("Linen", x, 0, cw2, dp)); lw -= cw2; }   // one linen closet off the cross hall; the rest widens the last room
    if (lw > 0.02) { grow(lastRoom, lw, 0); out.forEach(function (r) { if (r.y === 0 && r.x > lastRoom.x + 0.01 && r !== lastRoom) r.x = r2(r.x + lw); }); }
    // the rows behind: depths of up to 4.4 m between cross halls
    var rows = [], rem = d - dp - HALL;
    while (rem > 0.05) { if (rem <= 5.8) { rows.push(rem); rem = 0; } else { rows.push(4.4); rem -= 5.4; } }
    var y = dp, bathDone = false;
    rows.forEach(function (rd, ri) {
      out.push(R("Hall", bx, y, wb, HALL)); y += HALL;
      if (opts.attic && ri === rows.length - 1) { out.push(R("Terrace", bx, y, wb, rd)); y += rd; return; }
      var cx = bx, left = wb;
      if (!bathDone && left >= BATH_W + 3.0) {   // the bath heads the row, closets below it in its column
        var bd = Math.min(rd, 2.4); out.push(R("Bath", cx, y, BATH_W, bd));
        if (rd - bd >= 0.9) serviceStack(out, cx, y + bd, BATH_W, rd - bd, {}); else if (rd - bd > 0.02) grow(out[out.length - 1], 0, rd - bd);
        cx += BATH_W; left -= BATH_W; bathDone = true;
      }
      var n = Math.max(1, Math.min(queue.length, Math.floor(left / 3.2))), rw = left / n;
      if (rw > 5.0 && queue.length <= n) { var cl = Math.min(1.6, left - n * 5.0); if (cl >= 0.6) { out.push(R("Closet", cx + left - cl, y, cl, Math.min(rd, SERVICE_M2 / cl))); left -= cl; rw = left / n; } }
      for (var i = 0; i < n; i++) { out.push(R(queue.length ? queue.shift() : "Flex room", cx, y, rw, rd)); cx += rw; }
      y += rd;
    });
    return out;
  }
  // an entry level under a living level (a townhouse entered below its living floor): entry and stair in the
  // column, a short hall to the bath and a closet on the street side, a flex room or third bedroom behind, the patio at the back
  function entryLevel(u, w, d, ctx) {
    var st = ctx.stair, sw = st.w, L = st.l, out = [], yA = ENTRY_D + L, den = !!(u && u.den), wb = w - sw;
    var beds = u ? u.beds : 0, bedHere = beds >= 3 && (ctx.beds !== undefined ? ctx.beds > 0 : false);
    out.push(R("Entry", 0, 0, sw, ENTRY_D), R("Stair", 0, ENTRY_D, sw, L, { stair: st }));
    var roomD = clamp(d - BATH_D - 1.5, 3.0, 4.2), yP = BATH_D + roomD, pd = d - yP;
    if (pd < 1.5) { yP = Math.max(BATH_D + 3.0, d - 1.5); roomD = yP - BATH_D; pd = d - yP; }
    out.push(R("Hall", sw, 0, HALL, BATH_D));
    serviceRow(out, sw + HALL, 0, wb - HALL, BATH_D, { bath: "Bath", closet: "Closet" });
    out.push(R(bedHere ? "Bedroom " + beds : (den ? "Den" : "Flex room"), sw, BATH_D, wb, roomD));
    if (yP - yA >= 0.6) serviceStack(out, 0, yA, sw, yP - yA, { mech: true }); else if (yP - yA > 0.02) grow(out[1], 0, yP - yA);
    if (pd > 0.05) out.push(R("Patio", 0, yP, w, pd));
    return out;
  }
  // attic level (the third level within the roof): the last bedroom in front, bath row, den or study and a terrace behind
  function attic(u, w, d, ctx) {
    var beds = u ? u.beds : 3, o = { attic: true, den: !!(u && u.den), primary: "Bedroom " + Math.max(2, beds), beds: 1 };
    return ctx.stair && ctx.stair.kind === "u_back" ? bedroomBack(u, w, d, ctx, o) : bedroomLevel(u, w, d, ctx, o);
  }

  // ------------------------------------------------------------------ narrow, shallow two-level units: the stair across the back
  // the entry level (as CMHC's ADU 02): entry in the corner with the kitchen along the front wall beside it, the living
  // and dining behind, then a 2 m band along the back holding the U-stair and the powder room beside it
  function livingBack(u, w, d, ctx) {
    var st = ctx.stair, L = st.w, band = st.l, yB = d - band, out = [], kd = clamp(yB - 4.0, 1.8, 2.4), entry = ctx.level === 0;
    out.push(R(entry ? "Entry" : "Landing", 0, 0, 1.0, kd), R("Kitchen", 1.0, 0, w - 1.0, kd), R("Living / dining", 0, kd, w, yB - kd));
    out.push(R("Stair", 0, yB, L, band, { stair: st, upper: !entry }));
    var x = L;
    if (w - x >= WC_W) { out.push(R("WC", x, yB, WC_W, band)); x += WC_W; }
    if (w - x >= SLIVER) serviceRow(out, x, yB, w - x, band, { laundry: true, closet: "Linen" }); else if (w - x > 0.02) grow(out[out.length - 1], w - x, 0);
    return out;
  }
  // the bedroom level: the stair band at the back with the bath and laundry beside it, a cross hall in front of it, the
  // bedrooms (two across when the width allows) with their closets as furniture; the attic puts a den or study beside its bedroom
  function bedroomBack(u, w, d, ctx, opts) {
    opts = opts || {};
    var st = ctx.stair, L = st.w, band = st.l, yB = d - band, hy = yB - HALL, beds = opts.beds !== undefined ? opts.beds : (ctx.beds !== undefined ? ctx.beds : (u ? u.beds : 2)), out = [];
    var n = w >= 5.6 ? 2 : 1, names = opts.attic ? [opts.primary || "Bedroom 3", opts.den ? "Den" : "Study"] : ["Primary bedroom", beds >= 2 ? "Bedroom 2" : "Study"];
    var bw1 = n === 2 ? (names[1] === "Study" ? clamp(w - 2.6, 3.4, w - 2.6) : w / 2) : w;   // a study beside the only bedroom takes what the bedroom spares
    for (var i = 0; i < n; i++) out.push(R(names[i], i === 0 ? 0 : bw1, 0, i === 0 ? bw1 : w - bw1, hy));
    out.push(R("Hall", 0, hy, w, HALL), R("Stair", 0, yB, L, band, { stair: st, upper: true }));
    if (w - L >= MIN.bath_w) serviceRow(out, L, yB, w - L, band, { bath: "Bath", laundry: true, closet: "Linen" }); else if (w - L >= SLIVER) out.push(R("Laundry", L, yB, w - L, band)); else out[out.length - 1].w = r2(w);
    return out;
  }
  // the entry level of a three-level narrow unit: entry, hall and bath in front, the den behind, the stair band at the back
  function entryBack(u, w, d, ctx) {
    var st = ctx.stair, L = st.w, band = st.l, yB = d - band, den = !!(u && u.den), out = [];
    out.push(R("Entry", 0, 0, 1.0, ENTRY_D), R("Hall", 1.0, 0, HALL, BATH_D));
    serviceRow(out, 1.0 + HALL, 0, w - 1.0 - HALL, BATH_D, { bath: "Bath", closet: "Closet" });
    out.push(R("Linen", 0, ENTRY_D, 1.0, BATH_D - ENTRY_D > 0.05 ? BATH_D - ENTRY_D : 0.3));
    out.push(R(den ? "Den" : "Flex room", 0, BATH_D, w, yB - BATH_D), R("Stair", 0, yB, L, band, { stair: st }));
    if (w - L >= SLIVER) out.push(R("Mechanical", L, yB, w - L, band)); else out[out.length - 1].w = r2(w);
    return out.filter(function (r) { return r.h > 0.2; });
  }

  // ------------------------------------------------------------------ the shared single exit stair core
  // a 2.4 m band across the depth: a 1.1 m straight stair beside a 1.3 m corridor; the vestibule on the street at
  // the ground floor (a landing above), a bike or storage room behind the stair
  function core(u, w, d, ctx) {
    var fh = Math.min(ctx.fh || 3.0, FH_MAX), L = r2((Math.ceil(fh / ST.rise_max) - 1) * ST.run + 1.0), sw = Math.min(1.1, w - 1.2), cw = w - sw, out = [], ground = !ctx.level;
    L = Math.min(L, d - 1.8 - 0.3);
    var st = { kind: "straight", w: sw, l: L, risers: Math.ceil(fh / ST.rise_max), fh: r2(fh) };
    if (ground) out.push(R("Vestibule", 0, 0, w, 1.8), R("Stair", 0, 1.8, sw, L, { stair: st }), R("Corridor", sw, 1.8, cw, d - 1.8));
    else out.push(R("Landing", 0, 0, sw, 1.8), R("Stair", 0, 1.8, sw, L, { stair: st, upper: true }), R("Corridor", sw, 0, cw, d));
    var rest = d - 1.8 - L;
    if (rest >= SLIVER) out.push(R(ground ? "Bike room" : "Storage", 0, 1.8 + L, sw, rest));
    else if (rest > 0.05) out[1].h = r2(out[1].h + rest);
    return out;
  }

  // ------------------------------------------------------------------ non-dwelling ground cells
  function common(u, w, d) {
    var ew = 1.5, ed = Math.min(2.0, 0.28 * d), out = [R("Entry", 0, 0, ew, ed), R("Lobby, mail", ew, 0, w - ew, ed)];
    var kw = Math.max(2.4, 0.28 * w), rd = d - ed;
    out.push(R("Common room", 0, ed, w - kw - WC_W, rd), R("Kitchenette", w - kw - WC_W, ed, kw, rd), R("WC", w - WC_W, ed, WC_W, Math.min(WC_D + 0.3, rd)));
    if (rd - WC_D - 0.3 >= 0.6) out.push(R("Storage", w - WC_W, ed + WC_D + 0.3, WC_W, rd - WC_D - 0.3));
    return out;
  }
  function shop(u, w, d) {
    var sd = Math.max(3.0, 0.62 * d), boh = w - WC_W - 1.2;
    return [R("Shop floor", 0, 0, w, sd), R("Back of house", 0, sd, boh, d - sd), R("WC", boh, sd, WC_W, d - sd), R("Storage", boh + WC_W, sd, 1.2, d - sd)];
  }
  function daycare(u, w, d) {
    var ew = 1.5, ed = Math.min(1.8, 0.25 * d), pd = Math.max(3.0, 0.55 * d) - ed;
    var out = [R("Entry", 0, 0, ew, ed), R("Play room", ew, 0, w - ew, ed), R("Play room", 0, ed, w, pd)];
    var y = ed + pd, rd = d - y, nw = Math.max(2.4, 0.38 * w), kw = Math.max(2.4, 0.24 * w), ow = w - nw - kw - WC_W;
    out.push(R("Nap room", 0, y, nw, rd), R("Kitchen", nw, y, kw, rd), R("WC", nw + kw, y, WC_W, rd), R("Office", nw + kw + WC_W, y, ow, rd));
    return mergeParts(out, "Play room");
  }

  /* layout(role, unit, w, d, ctx): rooms for one level. ctx from unitCtx (the stair shared by all the levels of a unit,
     the exterior faces, the walkway, this level's index; ctx.beds: how many bedrooms this level should hold). */
  function layout(role, u, w, d, ctx) {
    ctx = ctx || unitCtx(w, d);
    var rooms;
    var back = ctx.stair && ctx.stair.kind === "u_back";
    if (role === "flat") rooms = flat(u, w, d, ctx);
    else if (role === "living") rooms = back ? livingBack(u, w, d, ctx) : living(u, w, d, ctx);
    else if (role === "entry") rooms = back ? entryBack(u, w, d, ctx) : entryLevel(u, w, d, ctx);
    else if (role === "bedroom") rooms = back ? bedroomBack(u, w, d, ctx) : bedroomLevel(u, w, d, ctx);
    else if (role === "attic") rooms = attic(u, w, d, ctx);
    else if (role === "core") rooms = core(u, w, d, ctx);
    else if (role === "common") rooms = common(u, w, d);
    else if (role === "shop") rooms = shop(u, w, d);
    else if (role === "daycare") rooms = daycare(u, w, d);
    else rooms = [R("Unit", 0, 0, w, d)];
    return rooms.filter(function (r) { return r.w > 0.05 && r.h > 0.05; });
  }
  return { MIN: MIN, layout: layout, unitCtx: unitCtx, stairModule: stairModule, LANDING: ENTRY_D, HALL: HALL, WET: WET, BATH_W: BATH_W, BATH_D: BATH_D, WC_W: WC_W, WC_D: WC_D, FH_MAX: FH_MAX };
})();
