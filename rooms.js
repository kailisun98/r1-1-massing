/* rooms.js -- room layouts for one unit level, in metres, built from the standard test fits in fits.js.
   Every layout is a list of rectangles {name, x, y, w, h} in the unit's own frame: x across from its left party
   or exterior wall, y from the face it is entered on (the street for a ground unit, the walkway for an upper one;
   cmhc.js flips the frame onto the right face). The modules:
     - stair: a U-stair core 2.0 m wide (two 0.95 m flights side by side with a 0.95 m landing), 3.3 m long for
       3.83 m floors, in the same place on every level of a unit; in a unit narrower than 6.1 m a straight run
       1.0 m wide (5.9 m for 3.83 m floors) along the party wall; BCBC 9.8 rise <= 200 mm, run 260 mm;
     - entry 1.5 m deep with a coat closet; halls 1.0 m (BCBC 9.5.3 minimum 0.86);
     - bath 2.2 x 1.7 m (toilet, sink and tub or shower on one wall: dimensions.com 2.13-2.74 x 1.52-1.83 m);
       powder room 1.45 x 1.4 m (half bath, one wall: 1.42-2.13 x 1.37-1.68 m);
     - kitchen band 1.8 m deep (0.6 m counter + 1.2 m aisle) with a run of 2.4 m or more (single row 2.1-3.8 m);
     - living 3.2 m or wider (L-shape sofa and armchair fit 3.35 x 2.74 m), dining 2.7 m or more each way
       (table 0.9 x 1.2-1.5 m with 0.91 m behind the chairs);
     - bedrooms sized to the bed they hold with 0.76 m clear on its open sides: queen 1.52 x 2.03 (room from
       9.8 m2), double 1.37 x 1.91 (from 9 m2), twin 0.97 x 1.91 (from 7.75 m2), a closet 0.6 m deep;
     - laundry 0.8 m (stacked washer and dryer 0.7 x 0.8 m).
   When a unit is too small for the full programme the layout drops rooms in a fixed order (the ensuite, the
   third bedroom to a closet, the laundry to the kitchen end) rather than draw rooms below these sizes;
   R1Plans.check() reports anything the layout still cannot meet. */
var R1Rooms = (function () {
  "use strict";
  var F = R1Fits, ST = F.STAIR;
  var MIN = { hall: 0.9, bath_w: 1.5, wc_w: 1.35, bed_w: 2.5, bed_area: 7.5, kitchen: 1.7, kitchen_run: 2.1, living_w: 3.2, dining_w: 2.6, stair_w: 0.86, stair_l: 3.0, door: 0.86, entry: 1.2 };
  var HALL = 0.9, ENTRY_D = 1.5, WET = 1.8, BATH_W = 2.2, BATH_D = 1.8, WC_W = 1.45, WC_D = 1.4, LDRY = 0.95, CLOSET = 1.2, SLIVER = 0.95;   // halls 0.9 (BCBC 9.5.3 hallways 860 mm); baths 1.8 deep so a 0.9 m door clears the tub; no room narrower than a door
  function r2(v) { return Math.round(v * 100) / 100; }
  function R(name, x, y, w, h, extra) { var r = { name: name, x: r2(x), y: r2(y), w: r2(w), h: r2(h), area_m2: r2(w * h) }; if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; }); return r; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // the stair of a unit: U-stair core when the unit is wide enough for it plus a hall and a bedroom, else a straight run
  function stairModule(fh, w, d) {
    var risers = Math.ceil(fh / ST.rise_max), per = Math.ceil(risers / 2), uL = r2(Math.max(3.0, (per - 1) * ST.run + ST.landing)), sL = r2((risers - 1) * ST.run + 1.0);
    if (w >= 6.1 && d >= 7.0) return { kind: "u", w: 2.0, l: uL, risers: risers, fh: r2(fh) };
    // a narrow unit too shallow for a straight run with rooms behind it: the U-stair lies across the back wall
    if (d - ENTRY_D - sL < 1.7 && w >= uL + 1.5 && d >= 7.0) return { kind: "u_back", w: uL, l: 2.0, risers: risers, fh: r2(fh) };
    return { kind: "straight", w: 1.0, l: sL, risers: risers, fh: r2(fh) };
  }
  /* unitCtx(w, d, opts): what all the levels of a unit share: the stair module (from the floor-to-floor height) and
     which faces of the unit are exterior in its own frame (opts.win = {front, back, left, right}). */
  function unitCtx(w, d, opts) {
    opts = opts || {};
    var fh = opts.fh || 3.0;
    return { stair: stairModule(fh, w, d), fh: fh, win: opts.win || { front: true, back: false, left: false, right: false }, level: opts.level || 0, levels: opts.levels || 1 };
  }
  // a studio: one room for living and sleeping with the entry in its corner, bath, kitchen and laundry across the back
  function studio(u, w, d) {
    var out = [], kd = clamp(d - 4.6, 1.8, 2.2), fd = d - kd, bathW = Math.max(1.5, Math.min(BATH_W, w - 2.4)), ldry = w - bathW - LDRY >= 2.4 ? LDRY : 0;
    out.push(R("Entry", 0, 0, HALL, ENTRY_D), R("Studio", HALL, 0, w - HALL, ENTRY_D), R("Studio", 0, ENTRY_D, w, fd - ENTRY_D));
    out.push(R("Bath", 0, fd, bathW, kd), R("Kitchen", bathW, fd, w - bathW - ldry, kd));
    if (ldry) out.push(R("Laundry", w - ldry, fd, ldry, kd));
    return mergeParts(out, "Studio");
  }
  // the living room is drawn as one L-shaped area made of two rectangles; the largest carries the name
  function mergeParts(rooms, name) {
    var parts = rooms.filter(function (r) { return r.name === name; });
    if (parts.length < 2) return rooms;
    var main = parts.reduce(function (a, b) { return b.area_m2 > a.area_m2 ? b : a; }, parts[0]);
    parts.forEach(function (r) { if (r !== main) r.part = true; });
    return rooms;
  }

  // ------------------------------------------------------------------ single-level flats
  // a deep flat: entry and hall along the party wall, living (and dining) at the entry face, the wet band across
  // the middle (bath beside the hall, laundry, kitchen run to the far wall), bedrooms at the back
  function flat(u, w, d, ctx) {
    var beds = u ? u.beds : 1;
    if (beds === 0) return studio(u, w, d);
    // the deep template (living in front, wet band, bedroom behind) needs 3.2 + 1.8 + 2.5 m; a shallower cell puts the
    // bedroom beside the living room, which needs 5.8 m of width
    if (d < 7.4 || (w < 5.0)) return flatShallow(u, w, d, ctx);
    if (d < 8.2 && w >= 5.8) return flatShallow(u, w, d, ctx);
    var out = [], twoBack = beds >= 2 && d >= 9.6 && w >= 5.8, frontBed2 = beds >= 2 && !twoBack && (w - HALL - 2.9) >= 3.4;
    var db = clamp(d - WET - 3.4 - (twoBack ? HALL : 0), 2.5, 3.6), dl = d - WET - db - (twoBack ? HALL : 0), yWet = dl, yBack = yWet + WET + (twoBack ? HALL : 0);
    out.push(R("Entry", 0, 0, HALL, ENTRY_D), R("Hall", 0, ENTRY_D, HALL, yWet + WET - ENTRY_D));
    var lx = HALL, lw = w - HALL;
    if (frontBed2) { out.push(R("Bedroom 2", w - 2.9, 0, 2.9, dl)); lw -= 2.9; }
    if (!frontBed2 && dl >= 6.2) out.push(R("Living", lx, 0, lw, dl - 2.9), R("Dining", lx, dl - 2.9, lw, 2.9));
    else if (!frontBed2 && lw >= 6.1) out.push(R("Living", lx, 0, lw - 2.7, dl), R("Dining", lx + lw - 2.7, 0, 2.7, dl));
    else out.push(R("Living / dining", lx, 0, lw, dl));
    var x = HALL;
    out.push(R("Bath", x, yWet, BATH_W, WET)); x += BATH_W;
    if (w - x - LDRY >= 2.4) { out.push(R("Laundry", x, yWet, LDRY, WET)); x += LDRY; }
    out.push(R("Kitchen", x, yWet, w - x, WET));
    if (twoBack) {
      out.push(R("Hall", 0, yWet + WET, w, HALL));
      var w1 = clamp(w - 2.9, 3.0, 3.6);
      out.push(R("Bedroom 1", 0, yBack, w1, db), R("Bedroom 2", w1, yBack, w - w1, db));
    } else {
      out.push(R(beds >= 2 ? "Bedroom 1" : "Bedroom", 0, yBack, w - CLOSET, db), R("Closet", w - CLOSET, yBack, CLOSET, db));
    }
    return out;
  }
  // a shallow or narrow flat: living (with the entry in its corner) and the bedroom side by side on the entry face,
  // bath, kitchen and laundry across the back; the bath opens off the living room
  // the bedrooms stand beside the living room on the window wall (as many as the width takes: a bedroom 2.9-4.3 m
  // wide each, the living room 3.2 m or more); the wet band across the back: bath and kitchen under the living room,
  // the laundry, an ensuite under bedroom 1 when the unit has two baths, and a walk-in closet under the last bedroom
  function flatShallow(u, w, d, ctx) {
    var beds = u ? u.beds : 1, baths = u ? u.baths : 1, out = [], kd = clamp(d - 4.4, 1.8, 2.4), fd = d - kd;
    var two = beds >= 2 && w - 2 * 2.9 >= 3.2, bw = two ? clamp((w - 3.6) / 2, 2.9, 4.3) : clamp(0.45 * w, 2.9, 3.4);
    if (!two && w - bw < 3.0) bw = Math.max(2.6, w - 3.0);
    var lx = two ? bw : 0, lw = two ? w - 2 * bw : w - bw;   // the living room between two bedrooms, or beside one
    out.push(R("Entry", lx, 0, HALL, ENTRY_D), R("Living / dining", lx + HALL, 0, lw - HALL, ENTRY_D), R("Living / dining", lx, ENTRY_D, lw, fd - ENTRY_D));
    if (two) out.push(R("Bedroom 1", 0, 0, bw, fd), R("Bedroom 2", lx + lw, 0, bw, fd));
    else out.push(R(beds >= 2 ? "Bedroom 1" : "Bedroom", lw, 0, bw, fd));
    // the wet band: bath and kitchen under the living room, the laundry off the kitchen, an ensuite (or closet) under
    // bedroom 1, a walk-in closet under the last bedroom
    var x = 0;
    if (two) {
      if (baths >= 2 && bw >= BATH_W) { out.push(R("Ensuite", 0, fd, BATH_W, kd)); x = BATH_W; }
      if (bw - x >= SLIVER) { out.push(R(x ? "Storage" : "Closet", x, fd, bw - x, kd)); }
      else if (bw - x > 0.05) out[out.length - 1].w = r2(out[out.length - 1].w + bw - x);
      x = bw;
    }
    var bathW = Math.min(BATH_W, lw), kw = Math.max(2.4, Math.min(3.6, w - x - bathW - LDRY - CLOSET));
    out.push(R("Bath", x, fd, bathW, kd)); x += bathW;
    if (w - x - kw >= LDRY) { out.push(R("Kitchen", x, fd, kw, kd)); x += kw; } else { out.push(R("Kitchen", x, fd, w - x, kd)); x = w; }
    if (w - x >= LDRY) { out.push(R("Laundry", x, fd, LDRY, kd)); x += LDRY; }
    if (w - x >= SLIVER) out.push(R("Closet", x, fd, w - x, kd));
    else if (w - x > 0.05) out[out.length - 1].w = r2(out[out.length - 1].w + (w - x));
    return mergeParts(out, "Living / dining");
  }

  // ------------------------------------------------------------------ multi-level units: the stair column on the left
  // the level a two-level unit is entered on: entry, stair core, powder room and laundry in the column; living,
  // dining and kitchen beside it (the powder room sits at the kitchen end when the stair is a straight run)
  function living(u, w, d, ctx) {
    var st = ctx.stair, sw = st.w, L = st.l, out = [], yA = ENTRY_D + L, restA = d - yA, core = st.kind === "u";
    out.push(R("Entry", 0, 0, sw, ENTRY_D), R("Stair", 0, ENTRY_D, sw, L, { stair: st }));
    var wcDone = false;
    if (core) {
      if (restA >= WC_D + SLIVER) { out.push(R("WC", 0, yA, sw, WC_D), R("Laundry", 0, yA + WC_D, sw, restA - WC_D)); wcDone = true; }
      else if (restA >= WC_D - 0.1) { out.push(R("WC", 0, yA, sw, restA)); wcDone = true; }
      else if (restA >= SLIVER) out.push(R("Closet", 0, yA, sw, restA));
      else if (restA > 0.05) out[out.length - 1].h = r2(out[out.length - 1].h + restA);   // the stair core takes the sliver
    } else if (restA >= SLIVER) out.push(R("Storage", 0, yA, sw, restA));
    else if (restA > 0.05) out[out.length - 1].h = r2(out[out.length - 1].h + restA);
    var wb = w - sw, x = sw, dl = 3.2, dd = 2.7, dk = WET, need = dl + dd + dk, extra = d - need;
    if (extra >= 0) { dl += extra * 0.45; dd += extra * 0.3; dk += extra * 0.25; if (dk > 2.4) { var over = dk - 2.4; dk = 2.4; dl += over * 0.6; dd += over * 0.4; } }
    if (extra >= 0) out.push(R("Living", x, 0, wb, dl), R("Dining", x, dl, wb, dd));
    else { dk = WET; dl = d - dk; dd = 0; out.push(R("Living / dining", x, 0, wb, dl)); }   // too short for two rooms: one open room with the table by the window
    if (!wcDone && wb - WC_W >= 2.4) out.push(R("WC", x, dl + dd, WC_W, dk), R("Kitchen", x + WC_W, dl + dd, wb - WC_W, dk));
    else out.push(R("Kitchen", x, dl + dd, wb, dk));
    return out;
  }
  // the bedroom level: landing and stair in the column, a hall beside it, the primary bedroom at the front (with an
  // ensuite and closet when wide enough), the bath row behind it, laundry behind the stair, the other bedrooms across
  // the back (off a cross hall when the depth allows two rooms, else one bedroom with a walk-in closet)
  function bedroomLevel(u, w, d, ctx, opts) {
    opts = opts || {};
    var st = ctx.stair, sw = st.w, L = st.l, core = st.kind === "u", beds = opts.beds !== undefined ? opts.beds : (u ? u.beds : 2), baths = u ? u.baths : 1, out = [];
    if (core) out.push(R("Landing", 0, 0, sw, ENTRY_D), R("Stair", 0, ENTRY_D, sw, L, { stair: st, upper: true }));
    else out.push(R("Closet", 0, 0, sw, ENTRY_D), R("Stair", 0, ENTRY_D, sw, L - 1.0, { stair: st, upper: true }), R("Landing", 0, ENTRY_D + L - 1.0, sw, 1.0));
    var yA = ENTRY_D + L, hx = sw, bx = sw + HALL, wb = w - bx, primary = opts.primary || "Primary bedroom";
    var dp = clamp(0.38 * d, 3.2, 3.8), ens = baths >= 2 && wb >= 5.4 && !opts.attic;
    if (ens) out.push(R(primary, bx, 0, wb - BATH_W, dp), R("Ensuite", bx + wb - BATH_W, 0, BATH_W, BATH_D), R("Closet", bx + wb - BATH_W, BATH_D, BATH_W, dp - BATH_D));
    else out.push(R(primary, bx, 0, wb, dp));
    var yb = dp, bd = BATH_D, yBack = yb + bd, fill = 0;
    if (yBack < yA - 0.3) { fill = yA - yBack; yBack = yA; }   // the stair column reaches further back: laundry and storage fill the row behind the bath
    var back = d - yBack, twoBack = (beds >= 3 || opts.attic) && back >= 2.5 + HALL && w >= 5.5;
    out.push(R("Hall", hx, 0, HALL, yBack));
    if (twoBack) out.push(R("Hall", hx, yBack, w - hx, HALL));
    if (wb - BATH_W >= SLIVER) out.push(R("Bath", bx, yb, BATH_W, bd), R("Closet", bx + BATH_W, yb, wb - BATH_W, bd));
    else out.push(R("Bath", bx, yb, wb, bd));
    if (fill >= SLIVER) out.push(R("Laundry", bx, yb + bd, wb, fill));   // a laundry and utility room off the hall
    else if (fill > 0.05) { out[out.length - 1].h = r2(out[out.length - 1].h + fill); if (out[out.length - 2].name === "Bath") out[out.length - 2].h = r2(out[out.length - 2].h + fill); }
    var yStart = twoBack ? yBack + HALL : yBack, db = d - yStart, la = yStart - yA, hasLaundry = out.some(function (r) { return r.name === "Laundry"; });
    if (la >= 0.6) out.push(R(!hasLaundry && la >= 1.6 ? "Laundry" : "Storage", 0, yA, sw, la));   // behind the stair, off the hall: a laundry when a washer fits past the door's approach, else storage
    if (db < 1.0) { if (db > 0.05) { out.filter(function (r) { return r.y + r.h > yStart - 0.05 && r.y < yStart; }).forEach(function (r) { r.h = r2(r.h + db); }); } return out; }   // nothing fits behind: the row above takes the sliver
    if (opts.attic) { var tw = Math.max(2.4, w * 0.45); out.push(R(opts.den ? "Den" : "Study", 0, yStart, w - tw, db), R("Terrace", w - tw, yStart, tw, db)); }
    else if (beds >= 3 && twoBack) { var w2 = clamp(0.55 * w, 2.9, w - 2.6); out.push(R("Bedroom 2", 0, yStart, w2, db), R("Bedroom 3", w2, yStart, w - w2, db)); }
    else if (beds >= 2 && db >= 1.7) out.push(R("Bedroom 2", 0, yStart, w - CLOSET, db), R("Closet", w - CLOSET, yStart, CLOSET, db));
    else out.push(R(db >= 1.7 ? "Study" : "Storage", 0, yStart, w, db));
    return out;
  }
  // an entry level under a living level (three-level townhouse): entry, stair core and mechanical room in the
  // column; a short hall to the den, with the bath and storage on the street side, the den behind, the patio at the back
  function entryLevel(u, w, d, ctx) {
    var st = ctx.stair, sw = st.w, L = st.l, out = [], yA = ENTRY_D + L, den = !!(u && u.den), wb = w - sw;
    // a three-bedroom unit whose bedroom level holds only two puts its third bedroom here, at grade, in place of the den
    var beds = u ? u.beds : 0, upstairs = beds >= 3 ? bedroomLevel(u, w, d, ctx).filter(function (r) { return /bedroom/i.test(r.name); }).length : 0, bedHere = beds >= 3 && upstairs < beds;
    out.push(R("Entry", 0, 0, sw, ENTRY_D), R("Stair", 0, ENTRY_D, sw, L, { stair: st }));
    var pd = clamp(d - Math.max(yA, BATH_D + 3.4) - 0.3, 1.5, 3.0), yP = d - pd;
    out.push(R("Hall", sw, 0, HALL, BATH_D));
    if (wb - HALL - BATH_W >= SLIVER) out.push(R("Bath", sw + HALL, 0, BATH_W, BATH_D), R(bedHere ? "Closet" : "Storage", sw + HALL + BATH_W, 0, wb - HALL - BATH_W, BATH_D));
    else out.push(R("Bath", sw + HALL, 0, wb - HALL, BATH_D));
    out.push(R(bedHere ? "Bedroom " + beds : (den ? "Den" : "Flex room"), sw, BATH_D, wb, yP - BATH_D));
    if (yP - yA >= 0.6) out.push(R("Mechanical", 0, yA, sw, yP - yA));
    out.push(R("Patio", 0, yP, w, pd));
    return out;
  }
  // attic level (the duplex's third level within the roof): a bedroom in front, bath row, den or study and a terrace behind
  function attic(u, w, d, ctx) { return bedroomLevel(u, w, d, ctx, { attic: true, den: !!(u && u.den), primary: "Bedroom 3", beds: 1 }); }

  // ------------------------------------------------------------------ narrow, shallow two-level units: the stair across the back
  // the entry level: entry in the corner, living (and dining) in front, the kitchen band, then a 2 m band along the
  // back holding the U-stair and the powder room beside it
  function livingBack(u, w, d, ctx) {
    var st = ctx.stair, L = st.w, band = st.l, yB = d - band, out = [], fd = yB - WET;
    out.push(R("Entry", 0, 0, 1.0, ENTRY_D));
    if (fd >= 5.9) out.push(R("Living", 1.0, 0, w - 1.0, ENTRY_D), R("Living", 0, ENTRY_D, w, 3.2 - ENTRY_D), R("Dining", 0, 3.2, w, fd - 3.2));
    else out.push(R("Living / dining", 1.0, 0, w - 1.0, ENTRY_D), R("Living / dining", 0, ENTRY_D, w, fd - ENTRY_D));
    var ldry = w - LDRY >= 2.4 ? LDRY : 0;
    out.push(R("Kitchen", 0, fd, w - ldry, WET)); if (ldry) out.push(R("Laundry", w - ldry, fd, ldry, WET));
    out.push(R("Stair", 0, yB, L, band, { stair: st }));
    if (w - L >= WC_W) out.push(R("WC", L, yB, w - L, band)); else if (w - L >= SLIVER) out.push(R("Storage", L, yB, w - L, band)); else out[out.length - 1].w = r2(w);
    mergeParts(out, "Living"); return mergeParts(out, "Living / dining");
  }
  // the bedroom level: the stair band at the back with the bath beside it, a cross hall in front of it, the
  // bedrooms (two across when the width allows) with walk-in closets between them and the hall
  function bedroomBack(u, w, d, ctx) {
    var st = ctx.stair, L = st.w, band = st.l, yB = d - band, hy = yB - HALL, beds = u ? u.beds : 2, out = [];
    var n = beds >= 2 && w >= 5.0 ? 2 : 1, bw = w / n;
    for (var i = 0; i < n; i++) out.push(R(i === 0 ? "Primary bedroom" : "Bedroom 2", i * bw, 0, bw, hy));   // to the hall, closets as furniture
    out.push(R("Hall", 0, hy, w, HALL), R("Stair", 0, yB, L, band, { stair: st, upper: true }));
    if (w - L >= 1.5) out.push(R("Bath", L, yB, w - L, band)); else if (w - L >= SLIVER) out.push(R("Laundry", L, yB, w - L, band)); else out[out.length - 1].w = r2(w);
    return out;
  }
  // the entry level of a three-level narrow unit: entry, hall and bath in front, the den behind, the stair band at the back
  function entryBack(u, w, d, ctx) {
    var st = ctx.stair, L = st.w, band = st.l, yB = d - band, den = !!(u && u.den), out = [];
    out.push(R("Entry", 0, 0, 1.0, ENTRY_D), R("Hall", 1.0, 0, HALL, BATH_D));
    if (w - 1.0 - HALL - BATH_W >= SLIVER) out.push(R("Bath", 1.0 + HALL, 0, BATH_W, BATH_D), R("Closet", 1.0 + HALL + BATH_W, 0, w - 1.0 - HALL - BATH_W, BATH_D));
    else out.push(R("Bath", 1.0 + HALL, 0, w - 1.0 - HALL, BATH_D));
    out.push(R("Storage", 0, ENTRY_D, 1.0, BATH_D - ENTRY_D > 0.05 ? BATH_D - ENTRY_D : 0.3));
    out.push(R(den ? "Den" : "Flex room", 0, BATH_D, w, yB - BATH_D), R("Stair", 0, yB, L, band, { stair: st }));
    if (w - L >= SLIVER) out.push(R("Mechanical", L, yB, w - L, band)); else out[out.length - 1].w = r2(w);
    return out.filter(function (r) { return r.h > 0.2; });
  }

  // ------------------------------------------------------------------ the shared single exit stair core
  // a 2.4 m band across the depth: a 1.1 m straight stair beside a 1.3 m corridor; the vestibule on the street at
  // the ground floor (a landing above), a bike or storage room behind the stair
  function core(u, w, d, ctx) {
    var fh = ctx.fh || 3.0, L = r2((Math.ceil(fh / ST.rise_max) - 1) * ST.run + 1.0), sw = Math.min(1.1, w - 1.2), cw = w - sw, out = [], ground = !ctx.level;
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

  /* layout(role, unit, w, d, ctx): rooms for one level. ctx from unitCtx (the stair shared by all the levels of a unit). */
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
  return { MIN: MIN, layout: layout, unitCtx: unitCtx, stairModule: stairModule, LANDING: ENTRY_D, HALL: HALL, WET: WET, BATH_W: BATH_W, BATH_D: BATH_D, WC_W: WC_W, WC_D: WC_D };
})();
