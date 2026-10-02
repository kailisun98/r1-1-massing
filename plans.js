/* plans.js -- architectural floor plans of a unit option (catalogue design or by-law configuration).
   Takes the rooms of every unit on every floor (R1Cmhc.unitRooms) and draws them the way a plan is drawn:
   exterior walls, party walls between units, partitions, an entry door per unit on the face it is reached from,
   interior doors from the circulation rooms into the served rooms, windows on the exterior walls of habitable
   rooms, stairs with their direction, kitchens with counters, sinks and stoves, bathrooms with fixtures, beds,
   tables and sofas, room names with areas, overall dimensions, and the exterior exit stairs and open walkways
   that reach the upper units (R1Access). Walls are drawn as segments with the openings left out of them, so a
   door or a cased opening is a real gap. Everything is in metres and scaled by k px per metre. */
var R1Plans = (function () {
  "use strict";
  var C = R1Cmhc;
  function fmt(x, d) { return Number(x).toFixed(d); }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function r2(v) { return Math.round(v * 100) / 100; }

  var WALL = { ext: 0.30, party: 0.25, int: 0.12 }, DOOR = 0.9, EPS = 0.02;
  var INK = "#1f2933", WALL_FILL = "#2c3e50", FLOOR = "#ffffff", GLASS = "#8fc1e3", FIX = "#4b5563", LIGHT = "#9aa4b1", WALK = "#e9ebe6", STAIR = "#f1f2ef";
  var CIRC = ["Entry", "Lobby, mail", "Living", "Living / dining", "Studio", "Dining", "Hall", "Landing", "Kitchen", "Stair", "Shop floor", "Common room", "Play room", "Kitchenette", "Den", "Flex room", "Vestibule", "Corridor"];
  var OPEN_PAIRS = [["Entry", "Living"], ["Living", "Dining"], ["Dining", "Kitchen"], ["Entry", "Stair"], ["Living", "Stair"], ["Hall", "Stair"], ["Landing", "Stair"], ["Landing", "Hall"], ["Hall", "Hall"],
    ["Entry", "Lobby, mail"], ["Lobby, mail", "Common room"], ["Common room", "Kitchenette"], ["Entry", "Play room"], ["Play room", "Play room"], ["Living", "Kitchen"], ["Dining", "Hall"], ["Entry", "Hall"], ["Living", "Living"], ["Living", "Hall"], ["Kitchen", "Hall"],
    ["Entry", "Living / dining"], ["Living / dining", "Living / dining"], ["Living / dining", "Kitchen"], ["Living / dining", "Hall"], ["Living / dining", "Dining"], ["Hall", "Den"], ["Hall", "Flex room"], ["Den", "Den"],
    ["Entry", "Studio"], ["Studio", "Studio"], ["Studio", "Kitchen"], ["Vestibule", "Corridor"], ["Vestibule", "Stair"], ["Corridor", "Stair"], ["Landing", "Corridor"], ["Corridor", "Corridor"], ["Kitchen", "Stair"], ["Dining", "Stair"], ["Den", "Stair"], ["Flex room", "Stair"],
    ["Living", "Den"], ["Living / dining", "Den"], ["Landing", "Living"], ["Landing", "Living / dining"], ["Landing", "Den"], ["Landing", "Dining"], ["Living / dining", "Stair"],
    ["Hall", "Family room"], ["Hall", "Hobby room"], ["Hall", "Play room"]];
  // the open-plan rooms: no wall at all between them (a cased opening with stub walls stands between the others)
  var OPEN_FULL = ["Living", "Dining", "Kitchen", "Living / dining", "Studio", "Den"];
  var HABITABLE = ["Living", "Living / dining", "Studio", "Dining", "Kitchen", "Bedroom", "Bedroom 1", "Bedroom 2", "Bedroom 3", "Primary bedroom", "Study", "Den", "Office", "Play room", "Nap room", "Common room", "Shop floor", "Flex room", "Kitchenette"];
  var OUTDOOR = ["Terrace", "Patio"], SMALL_WINDOW = ["Bath", "Ensuite", "WC", "Laundry", "Corridor", "Vestibule", "Landing"];
  // rooms that may open off the room they serve rather than a hall: a walk-in closet off a bedroom, a pantry off the kitchen
  var OFF_ANY = ["Ensuite", "Closet", "Linen", "Mechanical", "Storage", "Laundry"], NEVER_FROM = /Bath|WC|Ensuite|Stair|Laundry|Mechanical|Storage|Linen|Closet|Patio|Terrace/;
  // small service rooms whose door swings out into the room it is entered from, so the fixtures inside stay clear of it
  var OUT_SWING = ["WC", "Laundry", "Closet", "Linen", "Storage", "Mechanical", "Bike room", "Pantry"];
  var SHORT = { "Primary bedroom": "Primary bed", "Bedroom 1": "Bed 1", "Bedroom 2": "Bed 2", "Bedroom 3": "Bed 3", "Ensuite": "Ens.", "Mechanical": "Mech.", "Lobby, mail": "Lobby", "Back of house": "Back", "Kitchenette": "Kit'ette", "Storage": "Stor.", "Laundry": "Ldry", "Kitchen": "Kit.", "Dining": "Din.", "Living": "Liv.", "Living / dining": "Liv / din", "Hall": "H", "Shop floor": "Shop", "Common room": "Common", "Play room": "Play", "Nap room": "Nap", "Flex room": "Flex", "Terrace": "Terr.", "Bedroom": "Bed", "Closet": "Clo.", "Linen": "Lin." };
  var SHORTER = { "Primary bedroom": "P.bed", "Ensuite": "Ens", "Bath": "Bath", "WC": "WC", "Laundry": "L", "Storage": "S", "Kitchen": "K", "Dining": "D", "Living": "L", "Living / dining": "L/D", "Entry": "E", "Hall": "H", "Study": "St", "Den": "Den", "Office": "Off", "Bedroom": "Bed", "Bedroom 1": "B1", "Bedroom 2": "B2", "Bedroom 3": "B3", "Closet": "C", "Linen": "Ln", "Mechanical": "M" };
  var DOOR_PRIORITY = ["Hall", "Landing", "Corridor", "Entry", "Vestibule", "Living", "Living / dining", "Studio", "Dining", "Kitchen", "Den", "Flex room", "Lobby, mail", "Common room", "Play room", "Shop floor", "Primary bedroom", "Stair"];
  var FLOOR_WORD = ["ground", "second", "third", "fourth"];

  function isOpen(a, b) { return OPEN_PAIRS.some(function (p) { return (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a); }); }
  function isCirc(n) { return CIRC.indexOf(n) >= 0; }
  function isOutdoor(n) { return OUTDOOR.indexOf(n) >= 0; }
  function isBed(n) { return /bedroom/i.test(n); }
  function habitable(n) { return HABITABLE.indexOf(n) >= 0; }
  // the floor colour of a unit: its colour at 13% over white (labels and stair text are haloed in it, never in white)
  function tint(hex) { var n = parseInt(hex.slice(1), 16), f = function (v) { return Math.round(255 + (v - 255) * 0.13); }; return "rgb(" + f((n >> 16) & 255) + "," + f((n >> 8) & 255) + "," + f(n & 255) + ")"; }

  // shared edge of two axis-aligned rectangles (metres): {side: "v"|"h", at, from, to} or null
  function sharedEdge(r, s) {
    var t = 0.03;
    if (Math.abs(r.x + r.w - s.x) < t || Math.abs(s.x + s.w - r.x) < t) {
      var y0 = Math.max(r.y, s.y), y1 = Math.min(r.y + r.h, s.y + s.h);
      if (y1 - y0 > 0.8) return { side: "v", at: Math.abs(r.x + r.w - s.x) < t ? r.x + r.w : r.x, from: y0, to: y1 };
    }
    if (Math.abs(r.y + r.h - s.y) < t || Math.abs(s.y + s.h - r.y) < t) {
      var x0 = Math.max(r.x, s.x), x1 = Math.min(r.x + r.w, s.x + s.w);
      if (x1 - x0 > 0.8) return { side: "h", at: Math.abs(r.y + r.h - s.y) < t ? r.y + r.h : r.y, from: x0, to: x1 };
    }
    return null;
  }

  /* openings of one unit level: entry door (on the face the unit is reached from), interior doors, open connections, windows */
  function openings(ur, ext) {
    var rooms = ur.rooms, out = [], doorsInto = {};
    function pushDoor(from, to, e, kind) {
      var len = e.to - e.from, w = Math.min(DOOR, Math.max(len - 0.05, Math.min(0.86, len))), mid = (e.from + e.to) / 2;   // a 0.86 m leaf may fill a 0.9 m hall end
      // hinge the door near the end of the wall closest to the room's corner, not mid-wall, when the wall is long
      var at0 = len > 1.6 ? e.from + 0.15 : mid - w / 2;
      out.push({ kind: kind, side: e.side, at: e.at, from: at0, to: at0 + w, room: to, other: from, out: OUT_SWING.indexOf(to.name) >= 0 });
      if (kind === "door") doorsInto[to.name] = true;
    }
    // interior: open connections (including the parts of one L-shaped room) and doors from circulation into served rooms
    rooms.forEach(function (r, i) {
      rooms.forEach(function (s, j) {
        if (j <= i) return;
        var e = sharedEdge(r, s); if (!e) return;
        if (r.name === s.name && (r.part || s.part)) out.push({ kind: "join", side: e.side, at: e.at, from: e.from, to: e.to, room: r, other: s });
        else if (isOpen(r.name, s.name)) { var full = OPEN_FULL.indexOf(r.name) >= 0 && OPEN_FULL.indexOf(s.name) >= 0, inset = full ? 0 : 0.15; out.push({ kind: "open", side: e.side, at: e.at, from: e.from + inset, to: e.to - inset, room: r, other: s, full: full }); }
      });
    });
    rooms.forEach(function (r) {
      if (isCirc(r.name) || isOutdoor(r.name) || r.name === "Kitchenette" || r.part) return;   // served rooms get one door
      var best = null, bestRank = 99;
      rooms.forEach(function (s) {
        if (s === r) return;
        var e = sharedEdge(r, s); if (!e) return;
        if (r.name === "Ensuite" && s.name !== "Primary bedroom" && s.name !== "Bedroom 1") return;
        var circ = isCirc(s.name), offAny = OFF_ANY.indexOf(r.name) >= 0 && !NEVER_FROM.test(s.name);
        if (r.name !== "Ensuite" && !circ && !offAny) return;
        var rank = circ ? DOOR_PRIORITY.indexOf(s.name) : 70; if (circ && rank < 0) rank = 50;
        if (r.name === "Closet" && isBed(s.name)) rank = 0;        // a walk-in closet off its bedroom, before the hall
        if (r.name === "Laundry" && s.name === "Kitchen") rank = 1; // a laundry closet off the kitchen
        if (rank < bestRank || (rank === bestRank && best && (e.to - e.from) > (best.e.to - best.e.from))) { bestRank = rank; best = { s: s, e: e }; }   // the longer wall of two equal choices
      });
      if (best) pushDoor(best.s, r, best.e, "door");
    });
    rooms.forEach(function (r) {   // outdoor rooms: a door from the room they open off (the longest shared wall with a living room, den or bedroom)
      if (!isOutdoor(r.name)) return;
      var best = null, bestLen = 0;
      rooms.forEach(function (s) { if (s === r || isOutdoor(s.name) || NEVER_FROM.test(s.name) || s.name === "Kitchen") return; var e = sharedEdge(r, s); if (e && (e.to - e.from) > bestLen) { bestLen = e.to - e.from; best = { s: s, e: e }; } });
      if (best) pushDoor(best.s, r, best.e, "door");
    });
    // the entry door on the level a unit is entered on, from the exterior: on the face R1Access chose (the street,
    // the walkway or the side path), else the first exterior face the entry touches
    if (ur.level_index === 0) {
      var entry = rooms.filter(function (r) { return r.name === "Entry" || r.name === "Vestibule" || r.name === "Lobby, mail" || r.name === "Shop floor"; })[0] || rooms[0], cand = {};
      var dLeft = ext.left || ext.core_left, dRight = ext.right || ext.core_right;   // a door may also open onto the stair core's corridor
      if (ext.front && entry.y < EPS) cand.front = { side: "h", at: 0, from: entry.x, to: entry.x + entry.w };
      if (ext.rear && Math.abs(entry.y + entry.h - ur.depth_m) < EPS) cand.rear = { side: "h", at: ur.depth_m, from: entry.x, to: entry.x + entry.w };
      if (dLeft && entry.x < EPS) cand.left = { side: "v", at: 0, from: entry.y, to: entry.y + entry.h };
      if (dRight && Math.abs(entry.x + entry.w - ur.width_m) < EPS) cand.right = { side: "v", at: ur.width_m, from: entry.y, to: entry.y + entry.h };
      var order = [ur.entry_face, "front", "left", "right", "rear"].filter(function (f, i, a) { return f && a.indexOf(f) === i; }), face = order.filter(function (f) { return cand[f]; })[0];
      if (face) {
        var f = cand[face], mid = (f.from + f.to) / 2, w = Math.min(DOOR, Math.max(0.86, f.to - f.from - 0.1));
        out.push({ kind: "entry", side: f.side, at: f.at, from: mid - w / 2, to: mid + w / 2, room: entry, other: null, face: face });
      }
      // the stair core's corridor also leaves to the rear yard
      if (ur.role === "core" && ext.rear) {
        var corr = rooms.filter(function (r) { return r.name === "Corridor" && Math.abs(r.y + r.h - ur.depth_m) < EPS; })[0];
        if (corr && corr.w >= 1.0) { var cm = corr.x + corr.w / 2, cw2 = Math.min(DOOR, corr.w - 0.1); out.push({ kind: "entry", side: "h", at: ur.depth_m, from: cm - cw2 / 2, to: cm + cw2 / 2, room: corr, other: null, face: "rear", exit: true }); }
      }
    }
    // windows on exterior walls
    rooms.forEach(function (r) {
      if (isOutdoor(r.name) || r.name === "Stair" || r.name === "Landing") return;
      var big = habitable(r.name), small = SMALL_WINDOW.indexOf(r.name) >= 0;
      if (!big && !small) return;
      var cap = small ? 0.6 : (/Living|Studio|Shop floor|Common room|Play room/.test(r.name) ? 2.4 : (isBed(r.name) ? 1.5 : 1.2));
      function win(side, at, from, to) { var len = Math.min(cap, (to - from) * 0.6), mid = (from + to) / 2; if (to - from < 1.0) return; out.push({ kind: "window", side: side, at: at, from: mid - len / 2, to: mid + len / 2, room: r }); }
      if (ext.front && r.y < EPS) win("h", 0, r.x, r.x + r.w);
      if (ext.rear && Math.abs(r.y + r.h - ur.depth_m) < EPS) win("h", ur.depth_m, r.x, r.x + r.w);
      if (ext.left && r.x < EPS) win("v", 0, r.y, r.y + r.h);
      if (ext.right && Math.abs(r.x + r.w - ur.width_m) < EPS) win("v", ur.width_m, r.y, r.y + r.h);
    });
    return out;
  }

  /* fixtures of a room, in room-local metres (x from the room's left, y from its top, the entry face); each is a
     small list of primitives: rect, circle, line, text. Sizes are the catalogue sizes in R1Fits.FIX: the bed is the
     largest that fits with 0.76 m clear on its open sides (R1Fits.bedFor), bathroom fixtures line one wall
     (tub or shower, toilet, vanity), the kitchen is a single row (fridge, counter, sink, dishwasher, range),
     the dining table seats 4 or 6 with 0.91 m behind the chairs, the living room has a sofa, coffee table,
     armchair and TV unit, the laundry a stacked washer and dryer. The top-left corner is kept for the label. */
  /* keepClear(room, openings): the zones a piece of furniture must not stand in, in room-local metres: the swing
     of every door that opens into the room (a square the width of the door at its hinge; a service room's door
     swings out into the room it is entered from) and a 0.76 m approach (the circulation clearance) in front of
     every door and entry on this room's side, so the way through each door stays clear. */
  var APPROACH = 0.76, TOL = 0.08;
  function keepClear(r, ops) {
    var Z = [];
    ops.forEach(function (op) {
      if (op.kind !== "door" && op.kind !== "entry") return;
      var mine = op.room === r, other = op.other === r;
      if (!mine && !other) return;
      var w = op.to - op.from, swings = op.out ? other : mine, approach = !(op.out && mine);   // the leaf lands in the served room, or out in the other room; a closet reached from its doorway needs no approach inside
      if (op.side === "h") {
        var top = Math.abs(op.at - r.y) < 0.03, bot = Math.abs(op.at - (r.y + r.h)) < 0.03; if (!top && !bot) return;
        var x0 = op.from - r.x, x1 = op.to - r.x;
        if (approach) Z.push({ x: x0, y: top ? 0 : r.h - APPROACH, w: x1 - x0, h: APPROACH, kind: "approach", door: op });
        if (swings) Z.push({ x: x0, y: top ? 0 : r.h - w, w: w, h: w, kind: "swing", door: op });
      } else {
        var left = Math.abs(op.at - r.x) < 0.03, right = Math.abs(op.at - (r.x + r.w)) < 0.03; if (!left && !right) return;
        var y0 = op.from - r.y, y1 = op.to - r.y;
        if (approach) Z.push({ x: left ? 0 : r.w - APPROACH, y: y0, w: APPROACH, h: y1 - y0, kind: "approach", door: op });
        if (swings) Z.push({ x: left ? 0 : r.w - w, y: y0, w: w, h: w, kind: "swing", door: op });
      }
    });
    return Z;
  }
  function overlaps(a, b, tol) { tol = tol === undefined ? TOL : tol; return a.x + a.w > b.x + tol && b.x + b.w > a.x + tol && a.y + a.h > b.y + tol && b.y + b.h > a.y + tol; }
  function fixtures(r, ur, ext, clear) {
    var F = [], n = r.name, w = r.w, h = r.h, X = (typeof R1Fits !== "undefined") ? R1Fits.FIX : null, BEDS = X ? R1Fits.BEDS : null;
    // every drawn piece belongs to a named group; essential pieces that cannot be placed clear of the doors are reported
    var pieces = [], cur = null;
    function piece(name, essential, fixed) { cur = { name: name, essential: !!essential, fixed: !!fixed, prims: [] }; pieces.push(cur); }
    function push(p) { if (cur) { p.g = cur; cur.prims.push(p); } F.push(p); }
    function rect(x, y, rw, rh, o) { push(Object.assign({ t: "rect", x: x, y: y, w: rw, h: rh }, o || {})); }
    function circ(x, y, rad, o) { push(Object.assign({ t: "circle", x: x, y: y, r: rad }, o || {})); }
    function line(x1, y1, x2, y2, o) { push(Object.assign({ t: "line", x1: x1, y1: y1, x2: x2, y2: y2 }, o || {})); }
    function text(x, y, s, o) { push(Object.assign({ t: "text", x: x, y: y, s: s }, o || {})); }
    F.dropped = [];
    if (!X) return F;
    var horiz = w >= h, Lg = horiz ? w : h, Dp = horiz ? h : w;
    // a fixture against the room's "far" wall (the bottom wall of a wide room, the left wall of a deep one), placed
    // `a` along that wall with length `la`, standing `lc` out from it, `c` off the wall
    function onWall(a, la, lc, c, o) { c = c || 0; if (horiz) rect(a, h - c - lc, la, lc, o); else rect(c, a, lc, la, o); }
    function dotOnWall(a, c, rad, o) { if (horiz) circ(a, h - c, rad, o); else circ(c, a, rad, o); }
    function bed(kind, ax, ay, opts) {   // a bed of `kind` with its head on the wall it is placed against; opts.vertical: head on the far (bottom) wall
      var bd = BEDS[kind], bw = bd.w, bl = bd.l;
      piece("bed", true);
      if (opts.vertical) { rect(ax, ay, bw, bl); rect(ax + 0.1, ay + bl - 0.55, bw / 2 - 0.15, 0.45); rect(ax + bw / 2 + 0.05, ay + bl - 0.55, bw / 2 - 0.15, 0.45); line(ax, ay + bl - 0.65, ax + bw, ay + bl - 0.65, { light: true }); }
      else { rect(ax, ay, bl, bw); rect(ax + bl - 0.55, ay + 0.1, 0.45, bw / 2 - 0.15); rect(ax + bl - 0.55, ay + bw / 2 + 0.05, 0.45, bw / 2 - 0.15); line(ax + bl - 0.65, ay, ax + bl - 0.65, ay + bw, { light: true }); }
    }
    if (isBed(n) || n === "Studio") {
      var kind = R1Fits.bedFor(n === "Studio" ? Math.min(w, 3.6) : w, n === "Studio" ? Math.min(h, 3.6) : h);
      if (n === "Studio") {   // the bed in the back corner, a sofa and a small table toward the window
        if (kind) { var bd0 = BEDS[kind]; bed(kind, 0.05, h - bd0.l - 0.05, { vertical: true }); if (w - bd0.w >= 0.7) { piece("nightstand"); rect(bd0.w + 0.1, h - 0.55, 0.5, 0.5); } }
        if (w >= 3.2 && h >= 4.6) { piece("sofa", true); rect(w - X.loveseat[1] - 0.15, 1.0, X.loveseat[1], X.loveseat[0], { rx: 0.08 }); line(w - X.loveseat[1] + 0.15, 1.0, w - X.loveseat[1] + 0.15, 1.0 + X.loveseat[0], { light: true }); }
        if (w >= 3.6 && h >= 4.0) { piece("table"); rect(0.9, 0.9, 0.8, 0.8); rect(0.9 - X.chair - 0.08, 0.9 + 0.4 - X.chair / 2, X.chair, X.chair, { light: true }); rect(1.7 + 0.08, 0.9 + 0.4 - X.chair / 2, X.chair, X.chair, { light: true }); }
        if (w >= 3.4 && h >= 3.0) { piece("closet"); rect(w - 0.75, h - 1.65, 0.6, 1.5, { light: true }); line(w - 0.45, h - 1.65, w - 0.45, h - 0.15, { light: true }); }
      } else if (kind) {
        var bdk = BEDS[kind], bw = bdk.w, bl = bdk.l;
        if (h >= w) {   // head against the back wall, 0.76 m clear at least one side
          var bx = (w - bw - 1.52 >= 0) ? (w - bw) / 2 : Math.max(0.05, w - bw - 0.76), by = h - bl - 0.05;
          bed(kind, bx, by, { vertical: true });
          if (bx >= 0.6) { piece("nightstand"); rect(bx - 0.55, h - 0.55, 0.5, 0.5); }
          if (w - bx - bw >= 0.6) { piece("nightstand"); rect(bx + bw + 0.05, h - 0.55, 0.5, 0.5); }
          if (w >= 3.6 && by >= 1.0) { piece("closet"); rect(w - 1.65, 0.1, 1.5, 0.6, { light: true }); line(w - 1.65, 0.4, w - 0.15, 0.4, { light: true }); }   // closet on the entry wall, right of the label
        } else {         // turned: head against the right wall
          var bx2 = w - bl - 0.05, by2 = Math.max((h - bw) / 2, 0.76);
          if (by2 + bw > h - 0.05) by2 = Math.max(0.3, h - bw - 0.05);
          bed(kind, bx2, by2, { vertical: false });
          if (h - by2 - bw >= 0.6) { piece("nightstand"); rect(w - 0.55, h - 0.55, 0.5, 0.5); }
          if (bx2 >= 0.8 && h >= 2.2) { piece("closet"); rect(0.1, h - 0.7, 0.6, Math.min(1.5, h - 1.5), { light: true }); }   // closet on the left wall, below the label
        }
      }
    } else if (n === "Bath" || n === "Ensuite" || n === "WC") {
      // one wall of fixtures along the room's long side: tub or shower at the far end, toilet, vanity at the door end
      var a = 0.1, tubL = X.tub[1], full = n !== "WC" && Lg >= 2.1 && Dp >= 1.45, shower = n !== "WC" && !full && Lg >= 1.9;
      if (full) { piece("tub", true); onWall(Lg - tubL - 0.05, tubL, X.tub[0], 0, { rx: 0.08 }); if (horiz) line(Lg - tubL + 0.15, h - X.tub[0] + 0.15, Lg - 0.2, h - X.tub[0] + 0.15, { light: true }); else line(X.tub[0] - 0.15, Lg - tubL + 0.15, X.tub[0] - 0.15, Lg - 0.2, { light: true }); }
      else if (shower) { piece("shower", true); onWall(Lg - X.shower[0] - 0.05, X.shower[0], X.shower[1], 0); if (horiz) line(Lg - X.shower[0] - 0.05, h - X.shower[1], Lg - 0.05, h, { light: true }); else line(0, Lg - X.shower[0] - 0.05, X.shower[1], Lg - 0.05, { light: true }); }
      var tEnd = (full ? Lg - tubL - 0.05 : (shower ? Lg - X.shower[0] - 0.05 : Lg)), small = Dp < 1.6 || n === "WC", vanL = small ? 0.5 : X.vanity[1], vanD = small ? 0.5 : X.vanity[0];   // a powder room gets a small basin
      if (tEnd - a >= X.toilet[0] + vanL + 0.2) {   // toilet then vanity along the wall
        piece("toilet", true); onWall(tEnd - X.toilet[0] - 0.05, X.toilet[0], X.toilet[1] - 0.25, 0); dotOnWall(tEnd - X.toilet[0] / 2 - 0.05, X.toilet[1] - 0.2, 0.19);
        var vl = Math.min(vanL, tEnd - X.toilet[0] - 0.2 - a); piece("vanity", true); onWall(a, vl, vanD, 0); dotOnWall(a + vl / 2, vanD / 2, 0.14);
      } else if (tEnd - a >= X.toilet[0] + 0.1) {   // the wall is short: toilet on it, the vanity on the end wall beyond the tub (a two-wall layout)
        piece("toilet", true); onWall(tEnd - X.toilet[0] - 0.05, X.toilet[0], X.toilet[1] - 0.25, 0); dotOnWall(tEnd - X.toilet[0] / 2 - 0.05, X.toilet[1] - 0.2, 0.19);
        var vd = X.vanity[0], vl2 = Math.min(X.vanity[1], Dp - (full ? X.tub[0] : (shower ? X.shower[1] : 0)) - 0.2);
        if (vl2 >= 0.5) { piece("vanity", true); if (horiz) { rect(Lg - vd - 0.05, 0.05, vd, vl2); circ(Lg - vd / 2 - 0.05, 0.05 + vl2 / 2, 0.15); } else { rect(w - vl2 - 0.05, Lg - vd - 0.05, vl2, vd); circ(w - vl2 / 2 - 0.05, Lg - vd / 2 - 0.05, 0.15); } }
      }
    } else if (n === "Kitchen" || n === "Kitchenette") {
      // a single row along the far wall: fridge, counter, sink, dishwasher, counter, range; a second row when deep enough
      var cd = X.counter_d;
      piece("counter", false, true); onWall(0, Lg, cd, 0, { counter: true });
      var fr = X.fridge[0]; piece("fridge", true); onWall(0.05, fr, fr, 0, { thick: true }); if (horiz) text(0.05 + fr / 2, h - fr / 2 + 0.12, "F"); else text(fr / 2, 0.05 + fr / 2 + 0.12, "F");
      var sa = Math.min(Lg * 0.45, Lg - X.range - X.sink - 0.4); if (sa > fr + 0.2) { piece("sink", true); onWall(sa, X.sink, 0.45, 0.05); dotOnWall(sa + X.sink / 2, 0.3, 0.1); if (sa + X.sink + X.dishwasher <= Lg - X.range - 0.3) { piece("dishwasher"); onWall(sa + X.sink, X.dishwasher, cd, 0, { light: true }); } }
      var ra = Lg - X.range - 0.2; if (ra > fr + 0.3) { piece("range", true); onWall(ra, X.range, cd, 0); [[0.19, 0.17], [0.57, 0.17], [0.19, 0.43], [0.57, 0.43]].forEach(function (p) { if (horiz) circ(ra + p[0], h - cd + p[1], 0.08); else circ(cd - p[1], ra + p[0], 0.08); }); }
      if (n === "Kitchen" && Dp >= 3.0 && Lg >= 2.4) { piece("island"); onWall(0.3, Lg - 0.6, cd, cd + 1.2, { light: true }); }   // second row or island across a 1.2 m aisle
    } else if (n === "Dining") {
      var six = Lg >= 3.3 && Dp >= 2.7, tb = six ? X.table6 : X.table4, tl = tb[1], tw = tb[0];
      if (Lg >= tl + 1.2 && Dp >= tw + 1.2) {
        var ta = (Lg - tl) / 2, tc = (Dp - tw) / 2, ch = X.chair, perSide = six ? 3 : 2;
        function tRect(a, c, la, lc, o) { if (horiz) rect(a, c, la, lc, o); else rect(c, a, lc, la, o); }
        piece("table", true); tRect(ta, tc, tl, tw);
        for (var i = 0; i < perSide; i++) { var ca = ta + tl * (i + 0.5) / perSide - ch / 2; tRect(ca, tc - ch - 0.08, ch, ch, { light: true }); tRect(ca, tc + tw + 0.08, ch, ch, { light: true }); }
        if (Lg >= tl + 2.4) { tRect(ta - ch - 0.08, tc + tw / 2 - ch / 2, ch, ch, { light: true }); tRect(ta + tl + 0.08, tc + tw / 2 - ch / 2, ch, ch, { light: true }); }
      }
    } else if (n === "Living" || n === "Living / dining" || n === "Common room" || n === "Flex room" || n === "Den") {
      var sofa = n === "Den" ? X.loveseat : X.sofa, sl = sofa[0], sd = sofa[1];
      if (w >= 3.0 && h >= 2.6) {
        var sx = n === "Living / dining" && w >= 4.8 ? 0.3 : Math.max(0.3, (Math.min(w, 3.6) - sl) / 2), sy = h - sd - 0.15;
        piece("sofa", true); rect(sx, sy, sl, sd, { rx: 0.08 }); line(sx, sy + 0.3, sx + sl, sy + 0.3, { light: true });                       // sofa along the back wall
        piece("coffee table"); rect(sx + sl / 2 - X.coffee_table[0] / 2, sy - X.coffee_gap - X.coffee_table[1], X.coffee_table[0], X.coffee_table[1], { light: true });
        if (sx + sl + 0.3 + X.armchair[0] <= w - 0.15 && (n !== "Living / dining" || h >= 3.4)) { piece("armchair"); rect(sx + sl + 0.3, sy - 0.1, X.armchair[0], X.armchair[1], { rx: 0.08 }); }   // armchair at the end
        if (h >= 3.6 && w >= 3.4 && sy - X.coffee_gap - X.coffee_table[1] - X.tv_unit[1] >= 1.2) { piece("tv"); rect(sx + sl / 2 - X.tv_unit[0] / 2, sy - X.coffee_gap - X.coffee_table[1] - 0.8 - X.tv_unit[1], X.tv_unit[0], X.tv_unit[1], { light: true }); }   // TV unit facing the sofa
        if (n === "Living / dining" && w - (sx + sl + 0.4) >= X.table4[0] + 1.0 && h >= 3.2) {   // a table for four by the window end, beside the sofa group
          var tx = w - X.table4[0] - 0.95, ty = 0.95; piece("table"); rect(tx, ty, X.table4[0], X.table4[1]);
          for (var q = 0; q < 2; q++) { rect(tx - X.chair - 0.08, ty + X.table4[1] * (q + 0.5) / 2 - X.chair / 2, X.chair, X.chair, { light: true }); rect(tx + X.table4[0] + 0.08, ty + X.table4[1] * (q + 0.5) / 2 - X.chair / 2, X.chair, X.chair, { light: true }); }
        }
      }
      if (n === "Common room" && w >= 3 && h >= 3) { piece("table"); rect(w / 2 - 1.0, h / 2 - 0.4, 2.0, 0.8); }
      if (n === "Den" && w >= 2.6 && h >= 3.4) { piece("desk"); rect(w - X.desk[1] - 0.15, 0.9, X.desk[1], X.desk[0]); rect(w - X.desk[1] - 0.15 - X.chair - 0.1, 0.9 + X.desk[0] / 2 - X.chair / 2, X.chair, X.chair, { light: true }); }
    } else if (n === "Stair") {
      piece("stair", false, true);
      var st = r.stair || { kind: Math.min(w, h) >= 1.8 ? "u" : "straight" }, vertical = h >= w, up = ur.level_index < ur.levels - 1, dn = ur.level_index > 0;
      var lab = up && dn ? "UP / DN" : (up ? "UP" : "DN");
      if ((st.kind === "u" || st.kind === "u_back") && Dp >= 1.8) {   // two flights side by side along the length, the landing at the far end
        var land = 0.95, runL = Lg - land, nT = Math.max(4, Math.round(runL / 0.26));
        for (var t = 0; t <= nT; t++) { var a2 = runL * t / nT; if (vertical) { line(0, a2, Dp / 2, a2); line(Dp / 2, a2, Dp, a2); } else { line(a2, 0, a2, Dp / 2); line(a2, Dp / 2, a2, Dp); } }
        if (vertical) { line(Dp / 2, 0, Dp / 2, runL); rect(0.03, runL, Dp - 0.06, land - 0.03, { light: true }); line(Dp / 4, 0.2, Dp / 4, runL - 0.15, { arrow: true }); text(Dp / 2, runL + land / 2 + 0.12, lab, { small: true }); }
        else { line(0, Dp / 2, runL, Dp / 2); rect(runL, 0.03, land - 0.03, Dp - 0.06, { light: true }); line(0.2, Dp / 4, runL - 0.15, Dp / 4, { arrow: true }); text(runL + land / 2, Dp / 2 + 0.12, lab, { small: true }); }
      } else {
        var treads = Math.max(6, Math.round(Lg / 0.26));
        for (var t2 = 1; t2 < treads; t2++) { if (vertical) line(0, h * t2 / treads, w, h * t2 / treads); else line(w * t2 / treads, 0, w * t2 / treads, h); }
        if (vertical) { line(w / 2, 0.2, w / 2, h - 0.3, { arrow: true }); text(w / 2, h - 0.12, lab, { small: true }); }
        else { line(0.2, h / 2, w - 0.3, h / 2, { arrow: true }); text(w - 0.55, h / 2 - 0.15, lab, { small: true }); }
      }
    } else if (n === "Laundry") {
      var wd = X.washer_dryer_stacked;   // stacked washer and dryer against the far wall
      if (Math.min(w, h) >= 0.75) { piece("washer and dryer", true); onWall(Math.max(0.05, (Lg - wd[0]) / 2), wd[0], wd[1], 0); dotOnWall(Math.max(0.05, (Lg - wd[0]) / 2) + wd[0] / 2, wd[1] / 2, 0.2); }
    } else if (n === "Closet" || n === "Linen") {
      if (Math.min(w, h) >= 0.6) { piece("rod", false, true); onWall(0.05, Lg - 0.1, X.closet_d, 0, { light: true }); if (horiz) line(0.05, h - X.closet_d / 2, w - 0.05, h - X.closet_d / 2, { light: true }); else line(X.closet_d / 2, 0.05, X.closet_d / 2, h - 0.05, { light: true }); }
    } else if (n === "Storage" || n === "Back of house" || n === "Bike room") {
      piece("shelves", false, true); for (var s2 = 0.35; s2 < h - 0.3; s2 += 0.35) line(0.1, s2, Math.min(w - 0.1, 0.7), s2, { light: true });
      if (n === "Back of house" && w > 2) { piece("rack"); rect(w - 1.0, 0.2, 0.8, h - 0.4, { light: true }); }
    } else if (n === "Mechanical") { piece("unit"); rect(0.15, h - 0.85, Math.min(0.7, w - 0.3), Math.min(0.7, h - 0.3), { thick: true }); text(0.15 + Math.min(0.7, w - 0.3) / 2, h - 0.45, "M", { small: true }); }
    else if (n === "Entry" || n === "Lobby, mail" || n === "Vestibule") { if (w >= 1.2 && h >= 1.2) { piece("closet"); rect(0.1, h - X.closet_d - 0.05, Math.min(X.vanity[1], w - 0.2), X.closet_d, { light: true }); line(0.1, h - X.closet_d / 2 - 0.05, 0.1 + Math.min(X.vanity[1], w - 0.2), h - X.closet_d / 2 - 0.05, { light: true }); } }
    else if (n === "Landing" || n === "Hall" || n === "Corridor") { /* kept clear */ }
    else if (n === "Study" || n === "Office") { if (w >= 1.8 && h >= 1.8) { piece("desk"); rect(0.2, h - X.desk[1] - 0.15, Math.min(X.desk[0], w - 0.4), X.desk[1]); rect(0.2 + Math.min(X.desk[0], w - 0.4) / 2 - X.chair / 2, h - X.desk[1] - 0.15 - X.chair - 0.08, X.chair, X.chair, { light: true }); } }
    else if (n === "Shop floor") { piece("counter"); rect(w - 0.75, 0.6, 0.6, Math.min(2.4, h - 1.2)); piece("shelving"); for (var g = 0.3; g < w - 1.2; g += 1.3) rect(g, h - 0.5, 1.0, 0.35, { light: true }); }
    else if (n === "Play room") { piece("mats"); for (var m = 0.3; m < w - 1.3; m += 1.4) rect(m, 0.4, 1.2, 0.8, { light: true, rx: 0.1 }); piece("table"); rect(w - 1.1, h - 0.7, 0.9, 0.5); }
    else if (n === "Nap room") { piece("cots"); for (var q2 = 0.2; q2 < w - 0.7; q2 += 0.75) rect(q2, h - 1.5, 0.6, 1.3, { light: true }); }
    else if (isOutdoor(n)) { if (w > 1.8 && h > 1.2) { piece("table"); circ(w / 2, h / 2, 0.45, { light: true }); rect(w / 2 - 0.9, h / 2 - 0.2, 0.4, 0.4, { light: true }); rect(w / 2 + 0.5, h / 2 - 0.2, 0.4, 0.4, { light: true }); } }
    resolvePieces(pieces, clear || [], w, h, F);
    return F;
  }
  /* resolvePieces: every movable piece must sit inside the room, clear of the door swings and approaches and of the
     pieces already placed; a piece that clashes is slid along its wall (then across) in 0.1 m steps; if no
     position clears it is left out, and an essential piece left out is reported (F.dropped). */
  function bbox(prims) {
    var b = null;
    prims.forEach(function (p) {
      var q = p.t === "rect" ? { x: p.x, y: p.y, w: p.w, h: p.h } : p.t === "circle" ? { x: p.x - p.r, y: p.y - p.r, w: 2 * p.r, h: 2 * p.r } : p.t === "line" ? { x: Math.min(p.x1, p.x2), y: Math.min(p.y1, p.y2), w: Math.abs(p.x2 - p.x1), h: Math.abs(p.y2 - p.y1) } : null;
      if (!q) return;
      if (!b) b = q; else { var x0 = Math.min(b.x, q.x), y0 = Math.min(b.y, q.y), x1 = Math.max(b.x + b.w, q.x + q.w), y1 = Math.max(b.y + b.h, q.y + q.h); b = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }
    });
    return b;
  }
  function shift(prims, dx, dy) {
    prims.forEach(function (p) { if (p.t === "line") { p.x1 += dx; p.x2 += dx; p.y1 += dy; p.y2 += dy; } else { p.x += dx; p.y += dy; } });
  }
  function resolvePieces(pieces, clear, w, h, F) {
    var placed = [];
    pieces.forEach(function (pc) {
      var b = bbox(pc.prims); if (!b) return;
      if (pc.fixed) return;   // cabinetry and stairs stay where they are and do not block the pieces that sit against them
      function ok(dx, dy) {
        var q = { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h };
        if (q.x < -0.01 || q.y < -0.01 || q.x + q.w > w + 0.01 || q.y + q.h > h + 0.01) return false;   // within the room (pieces stand against its walls)
        for (var i = 0; i < clear.length; i++) if (overlaps(q, clear[i])) return false;
        for (var j = 0; j < placed.length; j++) if (overlaps(q, placed[j])) return false;
        return true;
      }
      // slide steps of 0.1 m, the nearest first; of two equal steps the one toward the room's centre first, so a
      // mirrored room gives the mirrored answer
      var sx = (b.x + b.w / 2 <= w / 2) ? 1 : -1, sy = (b.y + b.h / 2 <= h / 2) ? 1 : -1, steps = [0];
      for (var s = 0.1; s <= 2.5; s += 0.1) { steps.push(s); steps.push(-s); }
      var found = null;
      for (var i = 0; i < steps.length && !found; i++) if (ok(steps[i] * sx, 0)) found = [steps[i] * sx, 0];
      for (var j = 0; j < steps.length && !found; j++) if (ok(0, steps[j] * sy)) found = [0, steps[j] * sy];
      if (found) { if (found[0] || found[1]) shift(pc.prims, found[0], found[1]); placed.push({ x: b.x + found[0], y: b.y + found[1], w: b.w, h: b.h }); }
      else { pc.dropped = true; if (pc.essential) F.dropped.push(pc.name); }
    });
    for (var k = F.length - 1; k >= 0; k--) if (F[k].g && F[k].g.dropped) F.splice(k, 1);
  }

  /* wall segments of one unit level with the openings cut out of them: each wall {x1,y1,x2,y2,th} is
     axis-aligned in unit metres; an opening {side, at, from, to} on the same line removes its range. Pieces that
     end at the wall's own end keep half a wall thickness beyond it so corners close. */
  function wallPieces(walls, ops) {
    var out = [];
    walls.forEach(function (w) {
      var horiz = Math.abs(w.y1 - w.y2) < 1e-6, at = horiz ? w.y1 : w.x1, lo = horiz ? Math.min(w.x1, w.x2) : Math.min(w.y1, w.y2), hi = horiz ? Math.max(w.x1, w.x2) : Math.max(w.y1, w.y2);
      var cuts = ops.filter(function (op) { return op.side === (horiz ? "h" : "v") && Math.abs(op.at - at) < 0.03 && op.to > lo + 1e-6 && op.from < hi - 1e-6; })
        .map(function (op) { return [Math.max(lo, op.from), Math.min(hi, op.to)]; }).sort(function (a, b) { return a[0] - b[0]; });
      var s = lo, cap = w.th / 2;
      function piece(a, b, capA, capB) {
        var pa = a - (capA ? cap : 0), pb = b + (capB ? cap : 0);
        out.push(Object.assign({}, w, horiz ? { x1: pa, x2: pb } : { y1: pa, y2: pb }));
      }
      cuts.forEach(function (c) { if (c[0] > s + 0.01) piece(s, c[0], s === lo, false); s = Math.max(s, c[1]); });
      if (hi > s + 0.01) piece(s, hi, s === lo, true);
    });
    return out;
  }
  // the sheet reads left to right as the site plan does (a rotation of the map, never a reflection): when side 1 lies
  // on the right of the street-up view, cells and rooms are mirrored across the block
  function mirrorCells(cells) { return cells.map(function (c) { return { key: c.key, a0: r2(1 - c.a1), a1: r2(1 - c.a0), b0: c.b0, b1: c.b1, core_left: !!c.core_right, core_right: !!c.core_left }; }); }
  function mirrorUnit(ur) {
    var w = ur.width_m, swap = { left: "right", right: "left" };
    return Object.assign({}, ur, { rooms: ur.rooms.map(function (r) { return Object.assign({}, r, { x: r2(w - r.x - r.w) }); }),
      cell: { key: ur.cell.key, a0: r2(1 - ur.cell.a1), a1: r2(1 - ur.cell.a0), b0: ur.cell.b0, b1: ur.cell.b1, core_left: !!ur.cell.core_right, core_right: !!ur.cell.core_left }, entry_face: swap[ur.entry_face] || ur.entry_face });
  }
  function extOf(c) { return { front: c.b0 < EPS, rear: c.b1 > 1 - EPS, left: c.a0 < EPS, right: c.a1 > 1 - EPS, core_left: !!c.core_left, core_right: !!c.core_right }; }

  /* sheet(option, opts): the drawing. opts.k px/m (default 20), opts.floors names, opts.block key, opts.mirror. */
  function sheet(o, opts) {
    opts = opts || {};
    var k = opts.k || 20, pad = 26, gapX = Math.round(k * 2.2), parts = [], y = pad, width = 0, areas = C.unitAreas(o), mirror = !!opts.mirror;
    var fs = Math.max(7, k * 0.42), fs2 = Math.max(6, k * 0.34), byCell = {}, access = (typeof R1Access !== "undefined") ? R1Access.plan(o) : { blocks: {}, entries: {}, notes: [] };
    C.unitRooms(o).forEach(function (r) { byCell[r.block + "|" + r.floor_index + "|" + r.unit] = r; });
    function rectSvg(x, y0, w, h, style) { return '<rect x="' + x.toFixed(2) + '" y="' + y0.toFixed(2) + '" width="' + w.toFixed(2) + '" height="' + h.toFixed(2) + '" ' + style + "/>"; }
    function lineSvg(a, b, style) { return '<line x1="' + a[0].toFixed(2) + '" y1="' + a[1].toFixed(2) + '" x2="' + b[0].toFixed(2) + '" y2="' + b[1].toFixed(2) + '" ' + style + "/>"; }
    function textSvg(x, y0, s, style) { return '<text x="' + x.toFixed(2) + '" y="' + y0.toFixed(2) + '" ' + style + ">" + esc(s) + "</text>"; }
    o.blocks.forEach(function (b) {
      if (opts.block && b.key !== opts.block) return;
      var floors = b.floors.map(function (f, i) { return { f: f, i: i }; }).filter(function (x) { return !opts.floors || opts.floors.indexOf(x.f.name) >= 0; });
      if (!floors.length) return;
      var A = access.blocks[b.key] || { walkways: [], stairs: [] }, Wm = b.width_m, Dm = b.depth_m;
      // how far the exterior stairs and walkways stand off the front and the rear face (metres)
      var topExtra = 0, botExtra = 0;
      A.walkways.forEach(function (w) { if (w.face === "front") topExtra = Math.max(topExtra, -w.y0); else botExtra = Math.max(botExtra, w.y1 - Dm); });
      A.stairs.forEach(function (s) { if (s.face === "front") topExtra = Math.max(topExtra, -s.y0); else botExtra = Math.max(botExtra, s.y1 - Dm); });
      // orientation: the street at the top of the sheet, the lane at the bottom, so a front building's street
      // face is its top edge and a rear building's courtyard face its top edge (its lane face the bottom)
      var W = Wm * k, D = Dm * k, x = pad + 26, yTop = y + fs * 5.2 + 6, y0 = yTop + topExtra * k, isRear = b.key === "rear";
      var topCaption = isRear ? "COURTYARD" : "STREET", botCaption = isRear ? "LANE" : (o.blocks.some(function (z) { return z.key === "rear"; }) ? "COURTYARD" : "REAR YARD");
      parts.push(textSvg(x, y + 4, b.name, 'font-size="' + (fs + 3) + '" font-weight="700" fill="' + INK + '"'));
      parts.push(textSvg(x + (fs + 3) * 0.62 * (b.name.length + 1), y + 4, fmt(b.width_m, 1) + " x " + fmt(b.depth_m, 1) + " m, " + b.storeys + " storeys, " + b.units + " unit" + (b.units === 1 ? "" : "s"), 'font-size="' + fs + '" fill="' + LIGHT + '"'));
      floors.forEach(function (fx, col) {
        var f = fx.f, fi = fx.i, x0 = x + col * (W + gapX), cells0 = C.unitCells ? C.unitCells(f.units, f.split, f.cols, f.core) : [];
        if (f.core && C.coreCell) cells0 = cells0.concat([C.coreCell(f)]);
        var cells = mirror ? mirrorCells(cells0) : cells0;
        function BX(mx) { return x0 + (mirror ? Wm - mx : mx) * k; }   // block metres -> px (mirrored when the sheet is)
        function blockRect(xa, xb, ya, yb) { var p = BX(xa), q = BX(xb); return [Math.min(p, q), y0 + ya * k, Math.abs(q - p), (yb - ya) * k]; }
        // 1. floors and rooms
        parts.push(rectSvg(x0, y0, W, D, 'fill="' + FLOOR + '"'));
        var perCell = [];
        cells.forEach(function (c) {
          var cx = x0 + c.a0 * W, cw = (c.a1 - c.a0) * W, ch = (c.b1 - c.b0) * D, cy = y0 + c.b0 * D, col2 = C.unitColor(o, c.key, b.key);
          var ur0 = byCell[b.key + "|" + fi + "|" + c.key]; if (!ur0) return;
          var ur = mirror ? mirrorUnit(ur0) : ur0, walls = [];
          var ext = extOf(c);
          function P(mx, my) { return [cx + mx * k, cy + my * k]; }   // unit metres -> px (the unit's front at the top)
          parts.push(rectSvg(cx, cy, cw, ch, 'fill="' + col2 + '" fill-opacity="0.13"'));
          ur.rooms.forEach(function (r) {
            var p0 = P(r.x, r.y);
            if (isOutdoor(r.name)) parts.push(rectSvg(p0[0], p0[1], r.w * k, r.h * k, 'fill="#eef3ea"'));
            // partitions: each room outline as a thin wall (shared edges draw twice, harmlessly)
            walls.push({ x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y, th: WALL.int, outdoor: isOutdoor(r.name) });
            walls.push({ x1: r.x, y1: r.y + r.h, x2: r.x + r.w, y2: r.y + r.h, th: WALL.int, outdoor: isOutdoor(r.name) });
            walls.push({ x1: r.x, y1: r.y, x2: r.x, y2: r.y + r.h, th: WALL.int, outdoor: isOutdoor(r.name) });
            walls.push({ x1: r.x + r.w, y1: r.y, x2: r.x + r.w, y2: r.y + r.h, th: WALL.int, outdoor: isOutdoor(r.name) });
          });
          // fixtures, placed clear of the doors (text haloed in the floor tint, never white); on a mirrored sheet they are
          // laid out in the unit's own frame and mirrored with it, so both sheets show the same furniture
          var halo = ' paint-order="stroke" stroke="' + tint(col2) + '" stroke-width="3" stroke-linejoin="round"', ops = openings(ur, ext), ops0 = mirror ? openings(ur0, extOf(ur0.cell)) : ops;
          ur0.rooms.forEach(function (r0, ri) {
            var r = ur.rooms[ri], fx = fixtures(r0, ur0, extOf(ur0.cell), keepClear(r0, ops0));
            if (mirror) fx.forEach(function (p) { if (p.t === "rect") p.x = r0.w - p.x - p.w; else if (p.t === "line") { p.x1 = r0.w - p.x1; p.x2 = r0.w - p.x2; } else p.x = r0.w - p.x; });
            fx.forEach(function (g) {
              var stroke = g.light ? LIGHT : FIX, sw = g.thick ? 1.4 : 0.9;
              if (g.t === "rect") { var q = P(r.x + g.x, r.y + g.y); parts.push(rectSvg(q[0], q[1], g.w * k, g.h * k, 'fill="' + (g.counter ? "#f3f4f6" : "none") + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + (g.rx ? ' rx="' + g.rx * k + '"' : ""))); }
              else if (g.t === "circle") { var q2 = P(r.x + g.x, r.y + g.y); parts.push('<circle cx="' + q2[0].toFixed(2) + '" cy="' + q2[1].toFixed(2) + '" r="' + (g.r * k).toFixed(2) + '" fill="none" stroke="' + stroke + '" stroke-width="' + sw + '"/>'); }
              else if (g.t === "line") { parts.push(lineSvg(P(r.x + g.x1, r.y + g.y1), P(r.x + g.x2, r.y + g.y2), 'stroke="' + stroke + '" stroke-width="' + sw + '"' + (g.arrow ? ' marker-end="url(#arr)"' : ""))); }
              else if (g.t === "text") { var q3 = P(r.x + g.x, r.y + g.y); parts.push(textSvg(q3[0], q3[1], g.s, 'text-anchor="middle" font-size="' + (g.small ? fs2 : fs) + '" fill="' + FIX + '"' + halo)); }
            });
          });
          // party walls of the cell (thicker), exterior walls thickest
          [["h", 0, ext.front], ["h", ur.depth_m, ext.rear], ["v", 0, ext.left], ["v", ur.width_m, ext.right]].forEach(function (e) {
            var th = e[2] ? WALL.ext : WALL.party;
            if (e[0] === "h") walls.push({ x1: 0, y1: e[1], x2: ur.width_m, y2: e[1], th: th, ext: !!e[2] }); else walls.push({ x1: e[1], y1: 0, x2: e[1], y2: ur.depth_m, th: th, ext: !!e[2] });
          });
          perCell.push({ ur: ur, c: c, P: P, walls: wallPieces(walls, ops), ops: ops, cx: cx, cy: cy, cw: cw, col: col2 });
          // unit tag
          var tagW = Math.min(cw - 6, fs * 5.2);
          parts.push(rectSvg(cx + 4, cy + 4, tagW, fs * 1.6, 'fill="' + col2 + '" rx="2"'));
          parts.push(textSvg(cx + 7, cy + 4 + fs * 1.2, c.key, 'font-size="' + fs + '" font-weight="700" fill="#ffffff"'));
          var uu = b.unit_list.filter(function (z) { return z.key === c.key; })[0];
          if (uu && cw > tagW + fs * 9) parts.push(textSvg(cx + tagW + 8, cy + 4 + fs * 1.2, uu.kind ? uu.name : (uu.beds ? uu.beds + " bed" : "studio") + " / " + uu.baths + " bath, ~" + Math.round(areas[c.key + "@" + b.key] || 0) + " m2", 'font-size="' + fs2 + '" fill="' + INK + '"'));
          if (c.key === C.CORE_KEY && ch > fs * 6) parts.push('<text x="' + (cx + cw / 2).toFixed(2) + '" y="' + (cy + fs * 4).toFixed(2) + '" text-anchor="middle" font-size="' + (fs2 - 1) + '" fill="' + FIX + '" letter-spacing=".5" transform="rotate(-90 ' + (cx + cw / 2).toFixed(2) + " " + (cy + fs * 4).toFixed(2) + ')">EXIT STAIR</text>');
        });
        // 2. walls: thin partitions first, then party and exterior walls; outdoor edges dashed; openings are gaps
        var allWalls = [];
        perCell.forEach(function (pc) { pc.walls.forEach(function (wl) { allWalls.push({ wl: wl, P: pc.P }); }); });
        allWalls.sort(function (a, b2) { return a.wl.th - b2.wl.th; });
        allWalls.forEach(function (w) {
          var wl = w.wl;
          parts.push(lineSvg(w.P(wl.x1, wl.y1), w.P(wl.x2, wl.y2), 'stroke="' + WALL_FILL + '" stroke-width="' + (wl.th * k).toFixed(2) + '"' + (wl.outdoor && !wl.ext ? ' stroke-dasharray="' + (0.3 * k) + " " + (0.2 * k) + '"' : "") + ' stroke-linecap="butt"'));
        });
        // 3. openings: the door leaf and swing in the gap, or the window
        perCell.forEach(function (pc) {
          var P = pc.P;
          pc.ops.forEach(function (op) {
            var a = op.side === "h" ? P(op.from, op.at) : P(op.at, op.from), b2 = op.side === "h" ? P(op.to, op.at) : P(op.at, op.to);
            if (op.kind === "window") {
              parts.push(lineSvg(a, b2, 'stroke="' + GLASS + '" stroke-width="' + (WALL.ext * k * 0.5).toFixed(2) + '"'));
              parts.push(lineSvg(a, b2, 'stroke="' + INK + '" stroke-width="0.8"'));
            } else if (op.kind === "open" || op.kind === "join") {
              // a cased opening, or the join between the two parts of one room: nothing but the gap
            } else {   // door: hinge at `from`, leaf swings into the room it serves (out of a small service room)
              var r = op.room, w = op.to - op.from, into;
              if (op.side === "h") into = (r.y + r.h / 2 > op.at) ? 1 : -1; else into = (r.x + r.w / 2 > op.at) ? 1 : -1;
              if (op.out && op.other) into = -into;
              var hinge = op.side === "h" ? P(op.from, op.at) : P(op.at, op.from);
              var leafEnd = op.side === "h" ? P(op.from, op.at + into * w) : P(op.at + into * w, op.from);
              var arcEnd = op.side === "h" ? P(op.to, op.at) : P(op.at, op.to);
              var sweep = (op.side === "h" ? (into > 0 ? 0 : 1) : (into > 0 ? 1 : 0));
              parts.push(lineSvg(hinge, leafEnd, 'stroke="' + INK + '" stroke-width="1.1"'));
              parts.push('<path d="M ' + leafEnd[0].toFixed(2) + " " + leafEnd[1].toFixed(2) + " A " + (w * k).toFixed(2) + " " + (w * k).toFixed(2) + " 0 0 " + sweep + " " + arcEnd[0].toFixed(2) + " " + arcEnd[1].toFixed(2) + '" fill="none" stroke="' + LIGHT + '" stroke-width="0.7"/>');
              if (op.kind === "entry") {   // a red arrow outside the door, pointing in
                var m = op.side === "h" ? P((op.from + op.to) / 2, op.at - into * 0.5) : P(op.at - into * 0.5, (op.from + op.to) / 2);
                if (op.side === "h") parts.push('<path d="M ' + (m[0] - 4).toFixed(2) + " " + (m[1] - into * 4).toFixed(2) + " l 4 " + (into * 7) + " l 4 " + (-into * 7) + ' z" fill="#c81e1e"/>');
                else parts.push('<path d="M ' + (m[0] - into * 4).toFixed(2) + " " + (m[1] - 4).toFixed(2) + " l " + (into * 7) + " 4 l " + (-into * 7) + ' 4 z" fill="#c81e1e"/>');
              }
            }
          });
        });
        // 4. the exterior exit stairs and walkways that reach the upper units: the walkway of this floor with the
        // stair flights, the walkway above shown dashed on the ground floor
        A.walkways.forEach(function (w) {
          var R = blockRect(w.x0, w.x1, w.y0, w.y1), outerY = w.face === "front" ? R[1] : R[1] + R[3];
          if (w.floor_index === fi) {
            parts.push(rectSvg(R[0], R[1], R[2], R[3], 'fill="' + WALK + '" stroke="' + INK + '" stroke-width="0.8"'));
            parts.push(lineSvg([R[0], outerY], [R[0] + R[2], outerY], 'stroke="' + INK + '" stroke-width="1.6"'));   // the guard
            if (R[2] > fs * 6) parts.push(textSvg(R[0] + R[2] / 2, R[1] + R[3] / 2 + fs2 * 0.38, "WALKWAY", 'text-anchor="middle" font-size="' + fs2 + '" fill="' + FIX + '" letter-spacing="1"'));
          } else if (fi === 0 && w.floor_index === Math.min.apply(null, A.walkways.filter(function (z) { return z.face === w.face; }).map(function (z) { return z.floor_index; }))) {
            parts.push(rectSvg(R[0], R[1], R[2], R[3], 'fill="none" stroke="' + LIGHT + '" stroke-width="0.8" stroke-dasharray="4 3"'));
            if (R[2] > fs * 8) parts.push(textSvg(R[0] + R[2] / 2, R[1] + R[3] / 2 + fs2 * 0.38, "WALKWAY OVER", 'text-anchor="middle" font-size="' + (fs2 - 1) + '" fill="' + LIGHT + '" letter-spacing="1"'));
          }
        });
        A.stairs.forEach(function (st) {
          var onFloor = st.floors.indexOf(fi) >= 0, top = fi === st.top_floor, R = blockRect(st.x0, st.x1, st.y0, st.y1);
          if (!onFloor && fi !== 0 && fi > st.top_floor) return;   // above the stair: nothing
          parts.push(rectSvg(R[0], R[1], R[2], R[3], 'fill="' + STAIR + '" stroke="' + INK + '" stroke-width="0.9"'));
          var outerY = st.face === "front" ? R[1] : R[1] + R[3];
          parts.push(lineSvg([R[0], outerY], [R[0] + R[2], outerY], 'stroke="' + INK + '" stroke-width="1.6"'));   // the guard along the outside
          [st.land0, st.land1].forEach(function (L) { var Q = blockRect(L[0], L[1], st.y0, st.y1); parts.push(rectSvg(Q[0], Q[1], Q[2], Q[3], 'fill="' + WALK + '" stroke="' + LIGHT + '" stroke-width="0.6"')); });
          var sepY = y0 + (st.face === "rear" ? st.inner[1] : st.inner[0]) * k;   // between the two flights
          parts.push(lineSvg([R[0], sepY], [R[0] + R[2], sepY], 'stroke="' + LIGHT + '" stroke-width="0.6"'));
          function flight(strip, mode) {   // treads across the strip along the run; mode: "up" | "dn" | "below" | "over"
            var Q = blockRect(st.run[0], st.run[1], strip[0], strip[1]), n = Math.max(4, Math.round((st.run[1] - st.run[0]) / 0.27));
            for (var t = 0; t <= n; t++) { var xt = Q[0] + Q[2] * t / n; parts.push(lineSvg([xt, Q[1]], [xt, Q[1] + Q[3]], 'stroke="' + (mode === "over" ? LIGHT : FIX) + '" stroke-width="0.7"' + (mode === "over" ? ' stroke-dasharray="2 2"' : ""))); }
            if (mode === "up" || mode === "dn") {
              var dirPx = (st.dir > 0) !== mirror ? 1 : -1, ya = Q[1] + Q[3] / 2, xa = dirPx > 0 ? Q[0] + 3 : Q[0] + Q[2] - 3, xb = dirPx > 0 ? Q[0] + Q[2] - 5 : Q[0] + 5;
              parts.push(lineSvg([xa, ya], [xb, ya], 'stroke="' + FIX + '" stroke-width="0.9" marker-end="url(#arr)"'));
              parts.push(textSvg(dirPx > 0 ? Q[0] + 2 : Q[0] + Q[2] - 2, ya - 2, mode.toUpperCase(), 'text-anchor="' + (dirPx > 0 ? "start" : "end") + '" font-size="' + fs2 + '" fill="' + FIX + '" paint-order="stroke" stroke="' + STAIR + '" stroke-width="3"'));
            }
          }
          if (fi === 0) { flight(st.outer, "up"); flight(st.inner, "over"); }
          else if (onFloor) { flight(st.inner, "dn"); flight(st.outer, top ? "below" : "up"); }
          else { flight(st.inner, "below"); flight(st.outer, "below"); }
          var lx = (blockRect(st.land1[0], st.land1[1], st.y0, st.y1)), label = "EXIT STAIR";
          if (R[3] > fs2 * 2.2 && R[2] > fs2 * 9) parts.push(textSvg(lx[0] + lx[2] / 2, lx[1] + lx[3] / 2 + fs2 * 0.38, label, 'text-anchor="middle" font-size="' + (fs2 - 1) + '" fill="' + FIX + '" letter-spacing=".5" transform="rotate(-90 ' + (lx[0] + lx[2] / 2).toFixed(2) + " " + (lx[1] + lx[3] / 2 + fs2 * 0.38).toFixed(2) + ')"'));
        });
        // 5. room names and areas (top-left of each room, clear of the fixtures against the far walls)
        perCell.forEach(function (pc) {
          var ur = pc.ur, cx = pc.cx, cy = pc.cy;
          ur.rooms.forEach(function (r) {
            if (r.part || r.name === "Stair" || r.name === "Landing") return;   // no name on the second part of an L-shaped room, the stair or its landing
            var small = r.name === "Hall", size = small ? fs2 : fs;
            var tx = cx + (r.x + 0.16) * k, ty = cy + r.y * k + size * 1.25;
            if (r.y < EPS) ty += fs * 1.7;   // rooms along the top edge sit under the unit tag line
            if (r.h * k < size * 1.4 + (r.y < EPS ? fs * 1.7 : 0)) return;
            // the name must fit the room's width: full name, then a short form, then nothing
            var avail = r.w * k - 6, est = function (s) { return s.length * size * 0.56; }, nm = r.name;
            if (est(nm) > avail) nm = SHORT[r.name] || nm;
            if (est(nm) > avail) nm = SHORTER[r.name] || (nm.length > 3 ? nm.slice(0, 3) + "." : nm);
            if (est(nm) > avail) return;
            parts.push(textSvg(tx, ty, nm, 'font-size="' + size + '" font-weight="600" fill="' + INK + '"'));
            if (!small && nm === r.name && r.h >= 2.3 && r.h * k > size * 3.4 && est(fmt(r.area_m2, 1) + " m2") <= avail) parts.push(textSvg(tx, ty + size * 1.15, fmt(r.area_m2, 1) + " m2", 'font-size="' + fs2 + '" fill="' + LIGHT + '"'));
          });
        });
        // 6. captions (what lies beyond the top and bottom edges), floor name, dimensions
        var yBot = y0 + D + botExtra * k;
        parts.push(textSvg(x0 + W / 2, yTop - fs * 3.9, topCaption, 'text-anchor="middle" font-size="' + fs2 + '" fill="' + LIGHT + '" letter-spacing="1"'));
        parts.push(textSvg(x0 + W / 2, yBot + fs * 1.2, botCaption, 'text-anchor="middle" font-size="' + fs2 + '" fill="' + LIGHT + '" letter-spacing="1"'));
        parts.push(textSvg(x0 + W / 2, yBot + fs * 2.8, f.name + " floor", 'text-anchor="middle" font-size="' + (fs + 2) + '" font-weight="700" fill="' + INK + '"'));
        if (col === 0) {
          // overall width along the top, depth along the left, with ticks
          var dy = yTop - fs * 1.1, dx = x0 - fs * 1.4;
          parts.push('<line x1="' + x0 + '" y1="' + dy + '" x2="' + (x0 + W) + '" y2="' + dy + '" stroke="' + INK + '" stroke-width="0.8"/><line x1="' + x0 + '" y1="' + (dy - 4) + '" x2="' + x0 + '" y2="' + (dy + 4) + '" stroke="' + INK + '" stroke-width="0.8"/><line x1="' + (x0 + W) + '" y1="' + (dy - 4) + '" x2="' + (x0 + W) + '" y2="' + (dy + 4) + '" stroke="' + INK + '" stroke-width="0.8"/>');
          parts.push(textSvg(x0 + W / 2, dy - 3, String(Math.round(b.width_m * 1000)), 'text-anchor="middle" font-size="' + fs2 + '" fill="' + INK + '"'));
          parts.push('<line x1="' + dx + '" y1="' + y0 + '" x2="' + dx + '" y2="' + (y0 + D) + '" stroke="' + INK + '" stroke-width="0.8"/><line x1="' + (dx - 4) + '" y1="' + y0 + '" x2="' + (dx + 4) + '" y2="' + y0 + '" stroke="' + INK + '" stroke-width="0.8"/><line x1="' + (dx - 4) + '" y1="' + (y0 + D) + '" x2="' + (dx + 4) + '" y2="' + (y0 + D) + '" stroke="' + INK + '" stroke-width="0.8"/>');
          parts.push('<text x="' + (dx - 3) + '" y="' + (y0 + D / 2) + '" text-anchor="middle" font-size="' + fs2 + '" fill="' + INK + '" transform="rotate(-90 ' + (dx - 3) + " " + (y0 + D / 2) + ')">' + Math.round(b.depth_m * 1000) + "</text>");
          // unit widths above the overall width (the cells on the top edge)
          if (cells.length > 1 && cells.some(function (c) { return c.b0 < EPS; })) {
            var by = yTop - fs * 2.5;
            cells.filter(function (c) { return c.b0 < EPS; }).forEach(function (c) {
              var a1 = x0 + c.a0 * W, a2 = x0 + c.a1 * W;
              parts.push('<line x1="' + a1 + '" y1="' + by + '" x2="' + a2 + '" y2="' + by + '" stroke="' + LIGHT + '" stroke-width="0.7"/><line x1="' + a1 + '" y1="' + (by - 3) + '" x2="' + a1 + '" y2="' + (by + 3) + '" stroke="' + LIGHT + '" stroke-width="0.7"/><line x1="' + a2 + '" y1="' + (by - 3) + '" x2="' + a2 + '" y2="' + (by + 3) + '" stroke="' + LIGHT + '" stroke-width="0.7"/>');
              parts.push(textSvg((a1 + a2) / 2, by - 2, String(Math.round((c.a1 - c.a0) * b.width_m * 1000)), 'text-anchor="middle" font-size="' + (fs2 - 1) + '" fill="' + LIGHT + '"'));
            });
          }
        }
        width = Math.max(width, x0 + W + pad);
      });
      y = y0 + D + botExtra * k + fs * 3.6 + 16;
    });
    // scale bar
    parts.push('<line x1="' + (pad + 26) + '" y1="' + (y - 4) + '" x2="' + (pad + 26 + 5 * k) + '" y2="' + (y - 4) + '" stroke="' + INK + '" stroke-width="2"/>');
    for (var sb = 0; sb <= 5; sb++) parts.push('<line x1="' + (pad + 26 + sb * k) + '" y1="' + (y - 8) + '" x2="' + (pad + 26 + sb * k) + '" y2="' + (y - 4) + '" stroke="' + INK + '" stroke-width="1"/>');
    parts.push('<text x="' + (pad + 26 + 5 * k + 5) + '" y="' + (y - 2) + '" font-size="' + fs2 + '" fill="' + LIGHT + '">0 to 5 m; dimensions in mm</text>');
    y += 12;
    var totalW = Math.max(width, 300), totalH = y;
    var legend = o.blocks.map(function (b) { return b.unit_list.map(function (u) { return '<span class="lg"><i style="background:' + C.unitColor(o, u.key, b.key) + '"></i>' + esc(u.key) + " " + (u.kind ? esc(u.name) : (u.beds ? u.beds + " bed" : "studio") + " / " + u.baths + " bath") + ", ~" + Math.round(areas[u.key + "@" + b.key] || 0) + " m2</span>"; }).join(""); }).join("") +
      '<span class="lg"><i style="background:#c81e1e"></i>entry</span><span class="lg"><i style="background:' + GLASS + '"></i>window</span>' +
      (R1Access && R1Access.hasStairs(access) ? '<span class="lg"><i style="background:' + WALK + ';border:1px solid ' + INK + '"></i>open walkway</span><span class="lg"><i style="background:' + STAIR + ';border:1px solid ' + INK + '"></i>exterior exit stair</span>' : "");
    var defs = '<defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="' + FIX + '"/></marker></defs>';
    return { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="' + totalW + '" height="' + totalH + '" viewBox="0 0 ' + totalW + " " + totalH + '" role="img" aria-label="Floor plans" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">' + defs + parts.join("") + "</svg>", legend: legend, width: totalW, height: totalH, access: access };
  }

  /* check(option): what the drawn plans still fail to provide: a room without a door from a circulation room,
     a door narrower than 0.85 m, a bedroom, bath, WC, hall, kitchen or stair below its minimum, a stair that
     does not stack between the levels of a unit, or a unit with no way in (no entry door on the face it is
     reached from, or an upper entry level with no walkway and exit stair). Empty when the plans meet all of them. */
  function check(o) {
    var issues = [], MIN = (typeof R1Rooms !== "undefined") ? R1Rooms.MIN : { hall: 0.9, bath_w: 1.5, wc_w: 1.35, bed_w: 2.5, bed_area: 7.5, kitchen: 1.7, kitchen_run: 2.1, living_w: 3.2, dining_w: 2.6, stair_w: 0.86, stair_l: 3.0, door: 0.86, service_m2: 4.5, bed_max_m2: 22 };
    var HALLS = ["Hall", "Landing", "Entry", "Vestibule", "Corridor"], LIVINGS = ["Living", "Living / dining", "Dining", "Studio"];
    var stairs = {}, access = (typeof R1Access !== "undefined") ? R1Access.plan(o) : null, bedsDrawn = {}, unitOf = {};
    C.unitRooms(o).forEach(function (ur) {
      var uu = C.unitOf(C.blockOf(o, ur.block), ur.unit); if (uu && !uu.kind) { unitOf[ur.block + "|" + ur.unit] = uu; bedsDrawn[ur.block + "|" + ur.unit] = (bedsDrawn[ur.block + "|" + ur.unit] || 0) + ur.rooms.filter(function (r) { return isBed(r.name) && !r.part; }).length; }
      var c = ur.cell, ext = extOf(c), ops = openings(ur, ext), doored = {};
      var where = ur.unit + ", " + ur.floor.toLowerCase() + " floor";
      ops.forEach(function (op) { if ((op.kind === "door" || op.kind === "entry") && op.room) doored[op.room.name + "@" + op.room.x + "," + op.room.y] = op; });
      ur.rooms.forEach(function (r) {
        var tag = where + ": " + r.name.toLowerCase(), md = Math.min(r.w, r.h);
        if (!isCirc(r.name) && !isOutdoor(r.name) && !r.part && r.name !== "Kitchenette" && !doored[r.name + "@" + r.x + "," + r.y]) issues.push(tag + " has no door from a circulation room");
        if (isBed(r.name)) { var bed = (typeof R1Fits !== "undefined") ? R1Fits.bedFor(r.w, r.h) : (md >= MIN.bed_w && r.area_m2 >= MIN.bed_area ? "twin" : null); if (!bed) issues.push(tag + " is " + fmt(r.w, 2) + " x " + fmt(r.h, 2) + " m: no bed fits with 0.76 m clear on its open sides (a twin room needs 7.75 m2)"); }
        if ((r.name === "Bath" || r.name === "Ensuite") && md < MIN.bath_w - 0.01) issues.push(tag + " is " + fmt(md, 2) + " m across (a one-wall bathroom needs " + MIN.bath_w + " m)");
        if (r.name === "WC" && md < MIN.wc_w - 0.01) issues.push(tag + " is " + fmt(md, 2) + " m across (a half bath needs " + MIN.wc_w + " m)");
        if ((r.name === "Hall" || r.name === "Landing") && md < MIN.hall - 0.01) issues.push(tag + " is " + fmt(md, 2) + " m wide (a hall needs " + MIN.hall + " m)");
        if (r.name === "Kitchen") {
          if (md < MIN.kitchen - 0.01) issues.push(tag + " is " + fmt(md, 2) + " m across (a 0.6 m counter with a 1.07 m aisle needs " + MIN.kitchen + " m)");
          if (Math.max(r.w, r.h) < MIN.kitchen_run - 0.01) issues.push(tag + " has a " + fmt(Math.max(r.w, r.h), 2) + " m run (a single-row kitchen needs " + MIN.kitchen_run + " m)");
        }
        if (/^Living/.test(r.name) && !r.part) {   // an L-shaped living room is judged on the whole of its parts
          var parts = ur.rooms.filter(function (s) { return s.name === r.name; }), bx0 = Math.min.apply(null, parts.map(function (s) { return s.x; })), by0 = Math.min.apply(null, parts.map(function (s) { return s.y; })), bx1 = Math.max.apply(null, parts.map(function (s) { return s.x + s.w; })), by1 = Math.max.apply(null, parts.map(function (s) { return s.y + s.h; }));
          var mdl = Math.min(bx1 - bx0, by1 - by0);
          if (mdl < MIN.living_w - 0.01) issues.push(tag + " is " + fmt(mdl, 2) + " m across (a sofa and armchair fit needs " + MIN.living_w + " m)");
        }
        if (r.name === "Dining" && md < MIN.dining_w - 0.01) issues.push(tag + " is " + fmt(md, 2) + " m across (a table with 0.91 m behind the chairs needs " + MIN.dining_w + " m)");
        if (r.name === "Stair") {
          var isU = r.stair && (r.stair.kind === "u" || r.stair.kind === "u_back"), needW = isU ? 1.8 : MIN.stair_w;
          if (md < needW - 0.01 || Math.max(r.w, r.h) < MIN.stair_l - 0.01) issues.push(tag + " is " + fmt(r.w, 2) + " x " + fmt(r.h, 2) + " m (" + (isU ? "a U-stair needs two 0.9 m flights, " + needW + " m" : "a stair needs " + needW + " m") + " wide and " + MIN.stair_l + " m long)");
          (stairs[ur.block + "|" + ur.unit] || (stairs[ur.block + "|" + ur.unit] = [])).push([r.x, r.y, r.w, r.h]);
        }
      });
      ops.forEach(function (op) { if ((op.kind === "door" || op.kind === "entry") && op.to - op.from < MIN.door - 0.01) issues.push(where + ": the door to " + op.room.name.toLowerCase() + " is " + fmt(op.to - op.from, 2) + " m (doors need " + MIN.door + " m)"); });
      // the furniture: every essential piece placed clear of the door swings and approaches (what could not be placed is reported)
      ur.rooms.forEach(function (r) {
        var zones = keepClear(r, ops), fx = fixtures(r, ur, ext, zones);
        fx.dropped.forEach(function (name) { issues.push(where + ": " + r.name.toLowerCase() + ": the " + name + " cannot stand clear of the door swing and its " + APPROACH + " m approach"); });
        fx.forEach(function (p) {
          if (!p.g || p.g.fixed || p.t === "text") return;
          var b = bbox([p]); if (!b) return;
          zones.forEach(function (z) { if (overlaps(b, z)) issues.push(where + ": " + r.name.toLowerCase() + ": the " + p.g.name + " stands in the door " + z.kind); });
        });
      });
      // the circulation: what opens off what (as the catalogue plans do), the open kitchen, no closets grown into rooms,
      // and every room reached from the entry (or the stair above) through halls and living space, never through another room
      var dwelling = !ur.core && ur.role !== "core" && ur.role !== "shop" && ur.role !== "daycare" && ur.role !== "common";
      if (dwelling) {
        ops.forEach(function (op) {
          if (op.kind !== "door" || !op.other) return;
          var to = op.room.name, from = op.other.name, lo = to.toLowerCase(), lf = from.toLowerCase();
          if ((to === "Bath" || to === "Ensuite") && HALLS.indexOf(from) < 0 && !isBed(from) && from !== "Studio") issues.push(where + ": the " + lo + " opens off the " + lf + " (a bathroom opens off a hall, the entry or its bedroom)");
          if (to === "WC" && HALLS.indexOf(from) < 0 && LIVINGS.indexOf(from) < 0 && from !== "Kitchen") issues.push(where + ": the powder room opens off the " + lf + " (it opens off the entry hall or the dining area)");
          if (isBed(to) && HALLS.indexOf(from) < 0) issues.push(where + ": " + lo + " opens off the " + lf + " (a bedroom opens off a hall)");
        });
        var kit = ur.rooms.filter(function (r) { return r.name === "Kitchen"; })[0];
        if (kit && !ops.some(function (op) { return op.kind === "open" && (op.room === kit || op.other === kit) && LIVINGS.indexOf((op.room === kit ? op.other : op.room).name) >= 0 && op.to - op.from >= 1.2; })) issues.push(where + ": the kitchen is closed off (it opens along its front to the living or dining area)");
        ur.rooms.forEach(function (r) {
          var walkIn = r.name === "Closet" && ops.some(function (op) { return op.kind === "door" && op.room === r && op.other && isBed(op.other.name); }), capM2 = walkIn ? 6.5 : MIN.service_m2;   // a walk-in off its bedroom may be bigger
          if (/^(Laundry|Storage|Mechanical|Closet|Linen)$/.test(r.name) && r.area_m2 > capM2 + 0.01) issues.push(where + ": " + r.name.toLowerCase() + " is " + fmt(r.area_m2, 1) + " m2 (a closet, not a room: " + capM2 + " m2 at most)");
          if (isBed(r.name) && !r.part && r.area_m2 > MIN.bed_max_m2 + 0.01) issues.push(where + ": " + r.name.toLowerCase() + " is " + fmt(r.area_m2, 1) + " m2 (over " + MIN.bed_max_m2 + " m2: space the living rooms should have)");
        });
        var startOp = ops.filter(function (op) { return op.kind === "entry" && !op.exit; })[0], start = ur.level_index === 0 ? (startOp ? startOp.room : null) : (ur.rooms.filter(function (r) { return r.name === "Stair"; })[0] || null);
        if (startOp && !/^(Entry|Vestibule|Lobby, mail|Shop floor|Living|Living \/ dining|Studio|Hall|Corridor)$/.test(startOp.room.name)) issues.push(where + ": the entry door opens into the " + startOp.room.name.toLowerCase());
        if (start) {
          var seen = {}, queue = [ur.rooms.indexOf(start)]; seen[queue[0]] = true;
          var through = function (r) { return isCirc(r.name) || r.name === "Landing"; };
          while (queue.length) {
            var ci = queue.shift(), ri = ur.rooms[ci];
            ops.forEach(function (op) {
              if (op.kind !== "open" && op.kind !== "join" && op.kind !== "door") return;
              var other = op.room === ri ? op.other : (op.other === ri ? op.room : null); if (!other) return;
              var j = ur.rooms.indexOf(other); if (j < 0 || seen[j]) return;
              if (op.kind !== "join" && !through(ri) && !(isBed(ri.name) && (OFF_ANY.indexOf(other.name) >= 0 || other.name === "Ensuite"))) return;   // past a bedroom only its closet or ensuite
              seen[j] = true; queue.push(j);
            });
          }
          ur.rooms.forEach(function (r, j) { if (!seen[j] && !r.part && !isOutdoor(r.name)) issues.push(where + ": " + r.name.toLowerCase() + " cannot be reached from the " + (ur.level_index === 0 ? "entry" : "stair") + " without passing through another room"); });
          var stairR = ur.rooms.filter(function (r) { return r.name === "Stair"; })[0];
          if (stairR && !ops.some(function (op) { return op.kind === "open" && (op.room === stairR || op.other === stairR); })) issues.push(where + ": the stair opens off no hall, landing or living space");
        }
      }
      if (ur.level_index === 0 || ur.role === "core") {
        var ent = ops.filter(function (op) { return op.kind === "entry" && !op.exit; })[0];
        if (ur.role === "core" && ur.level_index > 0) ent = { face: null };   // an upper corridor has no door of its own
        if (!ent) issues.push(where + ": no entry door on the " + (ur.entry_face || "exterior") + " face");
        else if (ur.entry_face && ent.face && ent.face !== ur.entry_face) issues.push(where + ": the entry door is on the " + ent.face + " face, not the " + ur.entry_face + " face it is reached from");
        if (ur.floor_index > 0 && ur.role !== "core") {
          var A = access ? access.blocks[ur.block] : null, served = ur.core || (A && A.walkways.some(function (w) { return w.floor_index === ur.floor_index && w.units.indexOf(ur.unit) >= 0; }) && A.stairs.some(function (s) { return s.floors.indexOf(ur.floor_index) >= 0 && s.face === ur.entry_face; }));
          if (!served) issues.push(ur.unit + " is entered on the " + FLOOR_WORD[ur.floor_index] + " floor but no exit stair and walkway reach it");
        }
      }
    });
    Object.keys(unitOf).forEach(function (k) {   // a unit's plans hold the bedrooms of its type (a studio has none)
      var u = unitOf[k], n = bedsDrawn[k] || 0;
      if (u.beds > 0 && n < u.beds) issues.push(k.split("|")[1] + " is a " + u.beds + "-bedroom unit but only " + n + " bedroom" + (n === 1 ? "" : "s") + " fit" + (n === 1 ? "s" : "") + " on its levels");
      if (n > u.beds) issues.push(k.split("|")[1] + " is a " + (u.beds ? u.beds + "-bedroom" : "studio") + " unit but " + n + " bedrooms are drawn");
    });
    Object.keys(stairs).forEach(function (k) {   // the same place and width on every level (the length may take in a landing or a sliver)
      var st = stairs[k];
      for (var i = 1; i < st.length; i++) if (st[i].slice(0, 3).some(function (v, j) { return Math.abs(v - st[0][j]) > 0.05; })) { issues.push(k.split("|")[1] + ": the stair does not stack between levels"); break; }
    });
    return issues;
  }

  return { sheet: sheet, openings: openings, fixtures: fixtures, keepClear: keepClear, wallPieces: wallPieces, check: check, WALL: WALL };
})();
