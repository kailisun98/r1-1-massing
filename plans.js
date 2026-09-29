/* plans.js -- architectural floor plans of a unit option (catalogue design or by-law configuration).
   Takes the rooms of every unit on every floor (R1Cmhc.unitRooms) and draws them the way a plan is drawn:
   exterior walls, party walls between units, partitions, an entry door per unit, interior doors from the
   circulation rooms into the served rooms, windows on the exterior walls of habitable rooms, stairs with
   their direction, kitchens with counters, sinks and stoves, bathrooms with fixtures, beds, tables and sofas,
   room names with areas, and overall dimensions. Everything is in metres and scaled by k px per metre. */
var R1Plans = (function () {
  "use strict";
  var C = R1Cmhc;
  function fmt(x, d) { return Number(x).toFixed(d); }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  var WALL = { ext: 0.30, party: 0.25, int: 0.12 }, DOOR = 0.9, EPS = 0.02, HALO = ' paint-order="stroke" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"';
  var INK = "#1f2933", WALL_FILL = "#2c3e50", FLOOR = "#ffffff", GLASS = "#8fc1e3", FIX = "#4b5563", LIGHT = "#9aa4b1";
  var CIRC = ["Entry", "Lobby, mail", "Living", "Dining", "Hall", "Landing", "Kitchen", "Stair", "Shop floor", "Common room", "Play room", "Kitchenette"];
  var OPEN_PAIRS = [["Entry", "Living"], ["Living", "Dining"], ["Dining", "Kitchen"], ["Entry", "Stair"], ["Living", "Stair"], ["Hall", "Stair"], ["Landing", "Stair"], ["Landing", "Hall"], ["Hall", "Hall"],
    ["Entry", "Lobby, mail"], ["Lobby, mail", "Common room"], ["Common room", "Kitchenette"], ["Entry", "Play room"], ["Play room", "Play room"], ["Living", "Kitchen"], ["Dining", "Hall"], ["Entry", "Hall"], ["Living", "Living"], ["Living", "Hall"], ["Kitchen", "Hall"]];
  var DOOR_PRIORITY_EXTRA = ["Landing"];
  var HABITABLE = ["Living", "Dining", "Kitchen", "Bedroom", "Bedroom 1", "Bedroom 2", "Bedroom 3", "Primary bedroom", "Study", "Den", "Office", "Play room", "Nap room", "Common room", "Shop floor", "Flex room", "Kitchenette"];
  var OUTDOOR = ["Terrace", "Patio"], SMALL_WINDOW = ["Bath", "Ensuite", "WC", "Laundry"];
  var SHORT = { "Primary bedroom": "Primary bed", "Bedroom 1": "Bed 1", "Bedroom 2": "Bed 2", "Bedroom 3": "Bed 3", "Ensuite": "Ens.", "Mechanical": "Mech.", "Lobby, mail": "Lobby", "Back of house": "Back", "Kitchenette": "Kit'ette", "Storage": "Stor.", "Laundry": "Ldry", "Kitchen": "Kit.", "Dining": "Din.", "Living": "Liv.", "Hall": "H", "Shop floor": "Shop", "Common room": "Common", "Play room": "Play", "Nap room": "Nap", "Flex room": "Flex", "Terrace": "Terr.", "Bedroom": "Bed" };
  var SHORTER = { "Primary bedroom": "P.bed", "Ensuite": "Ens", "Bath": "Bath", "WC": "WC", "Laundry": "L", "Storage": "S", "Kitchen": "K", "Dining": "D", "Living": "L", "Entry": "E", "Hall": "H", "Study": "St", "Den": "Den", "Office": "Off", "Bedroom": "Bed", "Bedroom 1": "B1", "Bedroom 2": "B2", "Bedroom 3": "B3" };
  var DOOR_PRIORITY = ["Hall", "Landing", "Entry", "Living", "Dining", "Kitchen", "Lobby, mail", "Common room", "Play room", "Shop floor", "Primary bedroom", "Stair"];

  function isOpen(a, b) { return OPEN_PAIRS.some(function (p) { return (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a); }); }
  function isCirc(n) { return CIRC.indexOf(n) >= 0; }
  function isOutdoor(n) { return OUTDOOR.indexOf(n) >= 0; }
  function isBed(n) { return /bedroom/i.test(n); }
  function habitable(n) { return HABITABLE.indexOf(n) >= 0; }

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

  /* openings of one unit level: entry door, interior doors, open connections, windows */
  function openings(ur, ext) {
    var rooms = ur.rooms, out = [], doorsInto = {};
    function pushDoor(from, to, e, kind) {
      var len = e.to - e.from, w = Math.min(DOOR, len - 0.05), mid = (e.from + e.to) / 2;
      // hinge the door near the end of the wall closest to the room's corner, not mid-wall, when the wall is long
      var at0 = len > 1.6 ? e.from + 0.15 : mid - w / 2;
      out.push({ kind: kind, side: e.side, at: e.at, from: at0, to: at0 + w, room: to, other: from });
      if (kind === "door") doorsInto[to.name] = true;
    }
    // interior: open connections (including the parts of one L-shaped room) and doors from circulation into served rooms
    rooms.forEach(function (r, i) {
      rooms.forEach(function (s, j) {
        if (j <= i) return;
        var e = sharedEdge(r, s); if (!e) return;
        if (r.name === s.name && (r.part || s.part)) out.push({ kind: "join", side: e.side, at: e.at, from: e.from, to: e.to, room: r, other: s });
        else if (isOpen(r.name, s.name)) out.push({ kind: "open", side: e.side, at: e.at, from: e.from + 0.15, to: e.to - 0.15, room: r, other: s });
      });
    });
    rooms.forEach(function (r) {
      if (isCirc(r.name) || isOutdoor(r.name) || r.name === "Kitchenette" || r.part) return;   // served rooms get one door
      var best = null, bestRank = 99;
      rooms.forEach(function (s) {
        if (s === r) return;
        var e = sharedEdge(r, s); if (!e) return;
        if (r.name === "Ensuite" && s.name !== "Primary bedroom") return;
        if (r.name !== "Ensuite" && !isCirc(s.name)) return;
        var rank = DOOR_PRIORITY.indexOf(s.name); if (rank < 0) rank = 50;
        if (rank < bestRank) { bestRank = rank; best = { s: s, e: e }; }
      });
      if (best) pushDoor(best.s, r, best.e, "door");
    });
    rooms.forEach(function (r) {   // outdoor rooms: a door from the room they open off
      if (!isOutdoor(r.name)) return;
      var best = null, bestLen = 0;
      rooms.forEach(function (s) { if (s === r || isOutdoor(s.name) || /Bath|WC|Storage|Stair|Mech/.test(s.name)) return; var e = sharedEdge(r, s); if (e && (e.to - e.from) > bestLen) { bestLen = e.to - e.from; best = { s: s, e: e }; } });
      if (best) pushDoor(best.s, r, best.e, "door");
    });
    // the entry door on the level a unit is entered on, from the exterior
    if (ur.level_index === 0) {
      var entry = rooms.filter(function (r) { return r.name === "Entry" || r.name === "Lobby, mail" || r.name === "Shop floor"; })[0] || rooms[0];
      var faces = [];
      if (ext.front && entry.y < EPS) faces.push({ side: "h", at: 0, from: entry.x, to: entry.x + entry.w });
      if (ext.left && entry.x < EPS) faces.push({ side: "v", at: 0, from: entry.y, to: entry.y + entry.h });
      if (ext.right && Math.abs(entry.x + entry.w - ur.width_m) < EPS) faces.push({ side: "v", at: ur.width_m, from: entry.y, to: entry.y + entry.h });
      if (ext.rear && Math.abs(entry.y + entry.h - ur.depth_m) < EPS) faces.push({ side: "h", at: ur.depth_m, from: entry.x, to: entry.x + entry.w });
      if (faces.length) {
        var f = faces[0], mid = (f.from + f.to) / 2, w = Math.min(DOOR, Math.max(0.85, f.to - f.from - 0.1));
        out.push({ kind: "entry", side: f.side, at: f.at, from: mid - w / 2, to: mid + w / 2, room: entry, other: null });
      }
    }
    // windows on exterior walls
    rooms.forEach(function (r) {
      if (isOutdoor(r.name) || r.name === "Stair" || r.name === "Landing") return;
      var big = habitable(r.name), small = SMALL_WINDOW.indexOf(r.name) >= 0;
      if (!big && !small) return;
      var cap = small ? 0.6 : (/Living|Shop floor|Common room|Play room/.test(r.name) ? 2.4 : (isBed(r.name) ? 1.5 : 1.2));
      function win(side, at, from, to) { var len = Math.min(cap, (to - from) * 0.6), mid = (from + to) / 2; if (to - from < 1.0) return; out.push({ kind: "window", side: side, at: at, from: mid - len / 2, to: mid + len / 2, room: r }); }
      if (ext.front && r.y < EPS) win("h", 0, r.x, r.x + r.w);
      if (ext.rear && Math.abs(r.y + r.h - ur.depth_m) < EPS) win("h", ur.depth_m, r.x, r.x + r.w);
      if (ext.left && r.x < EPS) win("v", 0, r.y, r.y + r.h);
      if (ext.right && Math.abs(r.x + r.w - ur.width_m) < EPS) win("v", ur.width_m, r.y, r.y + r.h);
    });
    return out;
  }

  /* fixtures of a room, in room-local metres (x from the room's left, y from its front/bottom); each is a small
     list of primitives: rect, circle, line, arc, text */
  function fixtures(r, ur, ext) {
    var F = [], n = r.name, w = r.w, h = r.h;
    function rect(x, y, rw, rh, o) { F.push(Object.assign({ t: "rect", x: x, y: y, w: rw, h: rh }, o || {})); }
    function circ(x, y, rad, o) { F.push(Object.assign({ t: "circle", x: x, y: y, r: rad }, o || {})); }
    function line(x1, y1, x2, y2, o) { F.push(Object.assign({ t: "line", x1: x1, y1: y1, x2: x2, y2: y2 }, o || {})); }
    function text(x, y, s, o) { F.push(Object.assign({ t: "text", x: x, y: y, s: s }, o || {})); }
    if (isBed(n)) {
      var bw = /Primary/.test(n) ? 1.6 : (/Bedroom 1|Bedroom$/.test(n) ? 1.5 : 1.2), bl = 2.0;
      if (w >= bw + 0.6 && h >= bl + 0.6) {   // head against the back wall, centred
        var bx = (w - bw) / 2, by = h - bl - 0.1;
        rect(bx, by, bw, bl); rect(bx + 0.1, by + bl - 0.55, bw / 2 - 0.15, 0.45); rect(bx + bw / 2 + 0.05, by + bl - 0.55, bw / 2 - 0.15, 0.45);
        line(bx, by + bl - 0.65, bx + bw, by + bl - 0.65, { light: true });
        if (bx > 0.7) rect(0.15, h - 0.6, 0.5, 0.5);   // bedside table
        if (h > bl + 1.6 && w > 2.6) rect(w - Math.min(1.2, w - 0.3) - 0.15, 0.15, Math.min(1.2, w - 0.3), 0.6, { light: true });   // wardrobe, top right (clear of the label)
      } else if (w >= bl + 0.5 && h >= bw + 0.5) {   // turned
        var bx2 = w - bl - 0.1, by2 = (h - bw) / 2;
        rect(bx2, by2, bl, bw); rect(bx2 + bl - 0.55, by2 + 0.1, 0.45, bw / 2 - 0.15); rect(bx2 + bl - 0.55, by2 + bw / 2 + 0.05, 0.45, bw / 2 - 0.15);
      }
    } else if (n === "Bath" || n === "Ensuite" || n === "WC") {
      var tub = n !== "WC" && r.area_m2 >= 4.2 && Math.max(w, h) >= 2.0;
      if (w >= h) {   // fixtures along the back wall, tub along the right
        rect(0.15, h - 0.7, 0.45, 0.65); circ(0.375, h - 0.2, 0.2);                      // toilet
        rect(0.75, h - 0.55, 0.6, 0.45); circ(1.05, h - 0.32, 0.14);                   // basin
        if (tub) rect(w - 0.85, 0.15, 0.7, Math.min(1.7, h - 0.3), { rx: 0.1 }); else if (w > 2.2) { rect(w - 1.05, 0.15, 0.9, 0.9); line(w - 1.05, 0.15, w - 0.15, 1.05, { light: true }); }
      } else {
        rect(w - 0.65, 0.15, 0.65, 0.45); circ(w - 0.2, 0.375, 0.2);
        rect(w - 0.55, 0.8, 0.45, 0.6); circ(w - 0.32, 1.1, 0.14);
        if (tub) rect(0.15, h - 1.85, Math.min(0.7, w - 0.3), 1.7, { rx: 0.1 }); else if (h > 2.2) { rect(0.15, h - 1.05, 0.9, 0.9); line(0.15, h - 1.05, 1.05, h - 0.15, { light: true }); }
      }
    } else if (n === "Kitchen" || n === "Kitchenette") {
      var along = w >= h ? "back" : "left", d = 0.6;
      if (along === "back") {
        rect(0, h - d, w, d, { counter: true });
        rect(w * 0.18, h - 0.5, 0.5, 0.4); circ(w * 0.18 + 0.25, h - 0.3, 0.1);         // sink
        var sx = w * 0.62; rect(sx, h - 0.6, 0.6, 0.6); [[0.17, 0.17], [0.43, 0.17], [0.17, 0.43], [0.43, 0.43]].forEach(function (p) { circ(sx + p[0], h - 0.6 + p[1], 0.09); });
        rect(w - 0.75, h - 0.75, 0.7, 0.7, { thick: true }); text(w - 0.4, h - 0.32, "F");   // fridge
        if (n === "Kitchen" && h > 3.2 && w > 3.0) rect(w * 0.25, h - 2.3, w * 0.5, 0.8, { light: true });   // island
      } else {
        rect(0, 0, d, h, { counter: true });
        rect(0.1, h * 0.18, 0.4, 0.5); circ(0.3, h * 0.18 + 0.25, 0.1);
        var sy = h * 0.6; rect(0, sy, 0.6, 0.6); [[0.17, 0.17], [0.43, 0.17], [0.17, 0.43], [0.43, 0.43]].forEach(function (p) { circ(p[0], sy + p[1], 0.09); });
        rect(0.05, h - 0.75, 0.7, 0.7, { thick: true }); text(0.4, h - 0.32, "F");
      }
    } else if (n === "Dining") {
      var tw = Math.min(1.8, w - 1.2), th = Math.min(0.95, h - 1.5);
      if (tw > 1.0 && th > 0.7) {
        var tx = (w - tw) / 2, ty = Math.max((h - th) / 2, 1.0); rect(tx, ty, tw, th);
        var seats = Math.max(2, Math.floor(tw / 0.7));
        for (var i = 0; i < seats; i++) { var cx = tx + tw * (i + 0.5) / seats; rect(cx - 0.22, ty - 0.55, 0.44, 0.44, { light: true }); rect(cx - 0.22, ty + th + 0.1, 0.44, 0.44, { light: true }); }
      } else if (Math.min(w, h) > 1.6) { circ(w / 2, h / 2, 0.55); for (var a = 0; a < 4; a++) { rect(w / 2 + Math.cos(a * Math.PI / 2) * 0.85 - 0.22, h / 2 + Math.sin(a * Math.PI / 2) * 0.85 - 0.22, 0.44, 0.44, { light: true }); } }
    } else if (n === "Living" || n === "Common room" || n === "Flex room") {
      if (w >= 2.6 && h >= 2.4) {
        var sl = Math.min(2.2, w - 1.0), sofaX = (w - sl) / 2;
        rect(sofaX, h - 1.15, sl, 0.9, { rx: 0.08 }); line(sofaX, h - 0.85, sofaX + sl, h - 0.85, { light: true });   // sofa along the back, facing the front windows
        rect(w / 2 - 0.5, h - 2.0, 1.0, 0.55, { light: true });                                                  // coffee table
        if (w > 3.6) rect(w - 0.95, h - 2.05, 0.8, 0.8, { rx: 0.08 });                                             // armchair
        if (h > 3.8 && w > 3.0) rect(w - 1.15, 0.9, 1.0, 0.35, { light: true });                                  // media unit, clear of the label
      }
      if (n === "Common room" && w >= 3 && h >= 3) { rect(w / 2 - 1.0, h / 2 - 0.4, 2.0, 0.8); }
    } else if (n === "Stair") {
      var vertical = h >= w, treads = Math.max(6, Math.round((vertical ? h : w) / 0.27));
      for (var t = 1; t < treads; t++) { if (vertical) line(0, h * t / treads, w, h * t / treads); else line(w * t / treads, 0, w * t / treads, h); }
      if (vertical) { line(w / 2, 0.2, w / 2, h - 0.3, { arrow: true }); text(w / 2, h - 0.12, ur.level_index === 0 ? "UP" : "DN", { small: true }); }
      else { line(0.2, h / 2, w - 0.3, h / 2, { arrow: true }); text(w - 0.55, h / 2 - 0.15, ur.level_index === 0 ? "UP" : "DN", { small: true }); }
    } else if (n === "Laundry") {
      if (w >= 1.4 && h >= 0.7) { rect(0.1, h - 0.7, 0.6, 0.6); circ(0.4, h - 0.4, 0.2); rect(0.8, h - 0.7, 0.6, 0.6); circ(1.1, h - 0.4, 0.2); }
      else if (h >= 1.4) { rect(0.1, h - 0.7, 0.6, 0.6); circ(0.4, h - 0.4, 0.2); rect(0.1, h - 1.4, 0.6, 0.6); circ(0.4, h - 1.1, 0.2); }
    } else if (n === "Storage" || n === "Back of house") {
      for (var s2 = 0.35; s2 < h - 0.3; s2 += 0.35) line(0.1, s2, Math.min(w - 0.1, 0.6 + 0.1), s2, { light: true });
      if (n === "Back of house" && w > 2) rect(w - 1.0, 0.2, 0.8, h - 0.4, { light: true });
    } else if (n === "Mechanical") { rect(0.15, 0.15, Math.min(0.7, w - 0.3), Math.min(0.7, h - 0.3), { thick: true }); text(0.15 + Math.min(0.7, w - 0.3) / 2, 0.55, "M", { small: true }); }
    else if (n === "Entry" || n === "Lobby, mail") { if (w >= 1.5 && h >= 1.2) rect(w - 0.65, h - Math.min(1.2, h - 0.3) - 0.15, 0.6, Math.min(1.2, h - 0.3), { light: true }); }
    else if (n === "Landing" || n === "Hall") { /* kept clear */ }
    else if (n === "Study" || n === "Den" || n === "Office") { if (w >= 1.8 && h >= 1.6) { rect(0.2, h - 0.75, Math.min(1.5, w - 0.4), 0.6); rect(0.2 + Math.min(1.5, w - 0.4) / 2 - 0.22, h - 1.3, 0.44, 0.44, { light: true }); } if (n === "Den" && w >= 2.6 && h >= 2.6) rect(w - 1.9, 0.25, 1.7, 0.8, { rx: 0.08 }); }
    else if (n === "Shop floor") { rect(w - 0.75, 0.6, 0.6, Math.min(2.4, h - 1.2)); for (var g = 0.3; g < w - 1.2; g += 1.3) rect(g, h - 0.5, 1.0, 0.35, { light: true }); }
    else if (n === "Play room") { for (var m = 0.3; m < w - 1.3; m += 1.4) rect(m, 0.4, 1.2, 0.8, { light: true, rx: 0.1 }); rect(w - 1.1, h - 0.7, 0.9, 0.5); }
    else if (n === "Nap room") { for (var q = 0.2; q < w - 0.7; q += 0.75) rect(q, h - 1.5, 0.6, 1.3, { light: true }); }
    else if (isOutdoor(n)) { if (w > 1.8 && h > 1.2) { circ(w / 2, h / 2, 0.45, { light: true }); rect(w / 2 - 0.9, h / 2 - 0.2, 0.4, 0.4, { light: true }); rect(w / 2 + 0.5, h / 2 - 0.2, 0.4, 0.4, { light: true }); } }
    return F;
  }

  /* sheet(option, opts): the drawing. opts.k px/m (default 20), opts.floors names, opts.block key. */
  function sheet(o, opts) {
    opts = opts || {};
    var k = opts.k || 20, pad = 26, gapX = Math.round(k * 2.2), parts = [], y = pad, width = 0, areas = C.unitAreas(o);
    var fs = Math.max(7, k * 0.42), fs2 = Math.max(6, k * 0.34), byCell = {};
    C.unitRooms(o).forEach(function (r) { byCell[r.block + "|" + r.floor_index + "|" + r.unit] = r; });
    function px(v) { return (v * k).toFixed(2); }
    function rectSvg(x, y0, w, h, style) { return '<rect x="' + x.toFixed(2) + '" y="' + y0.toFixed(2) + '" width="' + w.toFixed(2) + '" height="' + h.toFixed(2) + '" ' + style + "/>"; }
    o.blocks.forEach(function (b) {
      if (opts.block && b.key !== opts.block) return;
      var floors = b.floors.map(function (f, i) { return { f: f, i: i }; }).filter(function (x) { return !opts.floors || opts.floors.indexOf(x.f.name) >= 0; });
      if (!floors.length) return;
      // orientation: the street at the top of the sheet, the lane at the bottom, so a front building's street
      // face is its top edge and a rear building's courtyard face its top edge (its lane face the bottom)
      var W = b.width_m * k, D = b.depth_m * k, x = pad + 26, y0 = y + fs * 5.2 + 6, isRear = b.key === "rear";
      var topCaption = isRear ? "COURTYARD" : "STREET", botCaption = isRear ? "LANE" : (o.blocks.some(function (z) { return z.key === "rear"; }) ? "COURTYARD" : "REAR YARD");
      parts.push('<text x="' + x + '" y="' + (y + 4) + '" font-size="' + (fs + 3) + '" font-weight="700" fill="' + INK + '">' + esc(b.name) + "</text>");
      parts.push('<text x="' + (x + (fs + 3) * 0.62 * (b.name.length + 1)) + '" y="' + (y + 4) + '" font-size="' + fs + '" fill="' + LIGHT + '">' + fmt(b.width_m, 1) + " x " + fmt(b.depth_m, 1) + " m, " + b.storeys + " storeys, " + b.units + " unit" + (b.units === 1 ? "" : "s") + "</text>");
      floors.forEach(function (fx, col) {
        var f = fx.f, fi = fx.i, x0 = x + col * (W + gapX), cells = C.unitCells ? C.unitCells(f.units, f.split, f.cols) : null;
        // 1. floors and rooms
        var walls = [], openingsAll = [];
        parts.push(rectSvg(x0, y0, W, D, 'fill="' + FLOOR + '"'));
        (cells || []).forEach(function (c) {
          var cx = x0 + c.a0 * W, cw = (c.a1 - c.a0) * W, ch = (c.b1 - c.b0) * D, cy = y0 + c.b0 * D, col2 = C.unitColor(o, c.key, b.key);
          var ur = byCell[b.key + "|" + fi + "|" + c.key]; if (!ur) return;
          var ext = { front: c.b0 < EPS, rear: c.b1 > 1 - EPS, left: c.a0 < EPS, right: c.a1 > 1 - EPS };
          function P(mx, my) { return [cx + mx * k, cy + my * k]; }   // unit metres -> px (the unit's front at the top)
          parts.push(rectSvg(cx, cy, cw, ch, 'fill="' + col2 + '" fill-opacity="0.13"'));
          ur.rooms.forEach(function (r) {
            var p0 = P(r.x, r.y);
            if (isOutdoor(r.name)) parts.push(rectSvg(p0[0], p0[1], r.w * k, r.h * k, 'fill="#eef3ea"'));
            // partitions: each room outline as a thin wall (shared edges draw twice, harmlessly)
            walls.push({ x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y, th: WALL.int, P: P, outdoor: isOutdoor(r.name) });
            walls.push({ x1: r.x, y1: r.y + r.h, x2: r.x + r.w, y2: r.y + r.h, th: WALL.int, P: P, outdoor: isOutdoor(r.name) });
            walls.push({ x1: r.x, y1: r.y, x2: r.x, y2: r.y + r.h, th: WALL.int, P: P, outdoor: isOutdoor(r.name) });
            walls.push({ x1: r.x + r.w, y1: r.y, x2: r.x + r.w, y2: r.y + r.h, th: WALL.int, P: P, outdoor: isOutdoor(r.name) });
          });
          // fixtures
          ur.rooms.forEach(function (r) {
            fixtures(r, ur, ext).forEach(function (g) {
              var stroke = g.light ? LIGHT : FIX, sw = g.thick ? 1.4 : 0.9;
              if (g.t === "rect") { var q = P(r.x + g.x, r.y + g.y); parts.push(rectSvg(q[0], q[1], g.w * k, g.h * k, 'fill="' + (g.counter ? "#f3f4f6" : "none") + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + (g.rx ? ' rx="' + g.rx * k + '"' : ""))); }
              else if (g.t === "circle") { var q2 = P(r.x + g.x, r.y + g.y); parts.push('<circle cx="' + q2[0].toFixed(2) + '" cy="' + q2[1].toFixed(2) + '" r="' + (g.r * k).toFixed(2) + '" fill="none" stroke="' + stroke + '" stroke-width="' + sw + '"/>'); }
              else if (g.t === "line") { var a = P(r.x + g.x1, r.y + g.y1), b2 = P(r.x + g.x2, r.y + g.y2); parts.push('<line x1="' + a[0].toFixed(2) + '" y1="' + a[1].toFixed(2) + '" x2="' + b2[0].toFixed(2) + '" y2="' + b2[1].toFixed(2) + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + (g.arrow ? ' marker-end="url(#arr)"' : "") + "/>"); }
              else if (g.t === "text") { var q3 = P(r.x + g.x, r.y + g.y); parts.push('<text x="' + q3[0].toFixed(2) + '" y="' + q3[1].toFixed(2) + '" text-anchor="middle" font-size="' + (g.small ? fs2 : fs) + '" fill="' + FIX + '"' + HALO + ">" + esc(g.s) + "</text>"); }
            });
          });
          // party walls of the cell (thicker), exterior walls thickest
          [["h", 0, ext.front], ["h", ur.depth_m, ext.rear], ["v", 0, ext.left], ["v", ur.width_m, ext.right]].forEach(function (e) {
            var th = e[2] ? WALL.ext : WALL.party;
            if (e[0] === "h") walls.push({ x1: 0, y1: e[1], x2: ur.width_m, y2: e[1], th: th, P: P, ext: !!e[2] }); else walls.push({ x1: e[1], y1: 0, x2: e[1], y2: ur.depth_m, th: th, P: P, ext: !!e[2] });
          });
          openings(ur, ext).forEach(function (op) { op.P = P; op.cellW = ur.width_m; op.cellD = ur.depth_m; openingsAll.push(op); });
          // unit tag
          var tagW = Math.min(cw - 6, fs * 5.2);
          parts.push(rectSvg(cx + 4, cy + 4, tagW, fs * 1.6, 'fill="' + col2 + '" rx="2"'));
          parts.push('<text x="' + (cx + 7) + '" y="' + (cy + 4 + fs * 1.2) + '" font-size="' + fs + '" font-weight="700" fill="#ffffff">' + esc(c.key) + "</text>");
          var uu = b.unit_list.filter(function (z) { return z.key === c.key; })[0];
          if (uu && cw > tagW + fs * 9) parts.push('<text x="' + (cx + tagW + 8) + '" y="' + (cy + 4 + fs * 1.2) + '" font-size="' + fs2 + '" fill="' + INK + '"' + HALO + ">" + (uu.kind ? esc(uu.name) : uu.beds + " bed / " + uu.baths + " bath, ~" + Math.round(areas[c.key + "@" + b.key] || 0) + " m2") + "</text>");
        });
        // 2. walls: thin partitions first, then party and exterior walls; outdoor edges dashed
        walls.sort(function (a, b2) { return a.th - b2.th; });
        walls.forEach(function (wl) {
          var a = wl.P(wl.x1, wl.y1), b2 = wl.P(wl.x2, wl.y2);
          parts.push('<line x1="' + a[0].toFixed(2) + '" y1="' + a[1].toFixed(2) + '" x2="' + b2[0].toFixed(2) + '" y2="' + b2[1].toFixed(2) + '" stroke="' + WALL_FILL + '" stroke-width="' + (wl.th * k).toFixed(2) + '"' + (wl.outdoor && !wl.ext ? ' stroke-dasharray="' + (0.3 * k) + " " + (0.2 * k) + '"' : "") + ' stroke-linecap="square"/>');
        });
        // 3. openings: erase the wall, then the door leaf and swing, or the window
        openingsAll.forEach(function (op) {
          var th = op.kind === "window" || op.kind === "entry" ? WALL.ext : WALL.int, P = op.P;
          var a = op.side === "h" ? P(op.from, op.at) : P(op.at, op.from), b2 = op.side === "h" ? P(op.to, op.at) : P(op.at, op.to);
          var isExt = op.kind === "entry" || op.kind === "window";
          var thick = (isExt ? WALL.ext : ((op.at < EPS || Math.abs(op.at - op.cellW) < EPS || Math.abs(op.at - op.cellD) < EPS) ? WALL.party : WALL.int)) * k + 1.5;
          parts.push('<line x1="' + a[0].toFixed(2) + '" y1="' + a[1].toFixed(2) + '" x2="' + b2[0].toFixed(2) + '" y2="' + b2[1].toFixed(2) + '" stroke="' + FLOOR + '" stroke-width="' + thick.toFixed(2) + '"/>');
          if (op.kind === "window") {
            parts.push('<line x1="' + a[0].toFixed(2) + '" y1="' + a[1].toFixed(2) + '" x2="' + b2[0].toFixed(2) + '" y2="' + b2[1].toFixed(2) + '" stroke="' + GLASS + '" stroke-width="' + (WALL.ext * k * 0.5).toFixed(2) + '"/>');
            parts.push('<line x1="' + a[0].toFixed(2) + '" y1="' + a[1].toFixed(2) + '" x2="' + b2[0].toFixed(2) + '" y2="' + b2[1].toFixed(2) + '" stroke="' + INK + '" stroke-width="0.8"/>');
          } else if (op.kind === "open" || op.kind === "join") {
            // a cased opening, or the join between the two parts of one room: nothing but the erased wall
          } else {   // door: hinge at `from`, leaf swings into the room it serves
            var r = op.room, w = op.to - op.from, into;
            if (op.side === "h") into = (r.y + r.h / 2 > op.at) ? 1 : -1; else into = (r.x + r.w / 2 > op.at) ? 1 : -1;
            var hinge = op.side === "h" ? P(op.from, op.at) : P(op.at, op.from);
            var leafEnd = op.side === "h" ? P(op.from, op.at + into * w) : P(op.at + into * w, op.from);
            var arcEnd = op.side === "h" ? P(op.to, op.at) : P(op.at, op.to);
            var sweep = (op.side === "h" ? (into > 0 ? 0 : 1) : (into > 0 ? 1 : 0));
            parts.push('<line x1="' + hinge[0].toFixed(2) + '" y1="' + hinge[1].toFixed(2) + '" x2="' + leafEnd[0].toFixed(2) + '" y2="' + leafEnd[1].toFixed(2) + '" stroke="' + INK + '" stroke-width="1.1"/>');
            parts.push('<path d="M ' + leafEnd[0].toFixed(2) + " " + leafEnd[1].toFixed(2) + " A " + (w * k).toFixed(2) + " " + (w * k).toFixed(2) + " 0 0 " + sweep + " " + arcEnd[0].toFixed(2) + " " + arcEnd[1].toFixed(2) + '" fill="none" stroke="' + LIGHT + '" stroke-width="0.7"/>');
            if (op.kind === "entry") {   // a red arrow outside the door, pointing in
              var m = op.side === "h" ? P((op.from + op.to) / 2, op.at - into * 0.5) : P(op.at - into * 0.5, (op.from + op.to) / 2);
              if (op.side === "h") parts.push('<path d="M ' + (m[0] - 4).toFixed(2) + " " + (m[1] - into * 4).toFixed(2) + " l 4 " + (into * 7) + " l 4 " + (-into * 7) + ' z" fill="#c81e1e"/>');
              else parts.push('<path d="M ' + (m[0] - into * 4).toFixed(2) + " " + (m[1] - 4).toFixed(2) + " l " + (into * 7) + " 4 l " + (-into * 7) + ' 4 z" fill="#c81e1e"/>');
            }
          }
        });
        // 4. room names and areas (top-left of each room, clear of the fixtures against the far walls)
        (cells || []).forEach(function (c) {
          var ur = byCell[b.key + "|" + fi + "|" + c.key]; if (!ur) return;
          var cx = x0 + c.a0 * W, cy = y0 + c.b0 * D;
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
            parts.push('<text x="' + tx.toFixed(2) + '" y="' + ty.toFixed(2) + '" font-size="' + size + '" font-weight="600" fill="' + INK + '"' + HALO + ">" + esc(nm) + "</text>");
            if (!small && nm === r.name && r.h >= 2.3 && r.h * k > size * 3.4 && est(fmt(r.area_m2, 1) + " m2") <= avail) parts.push('<text x="' + tx.toFixed(2) + '" y="' + (ty + size * 1.15).toFixed(2) + '" font-size="' + fs2 + '" fill="' + LIGHT + '"' + HALO + ">" + fmt(r.area_m2, 1) + " m2</text>");
          });
        });
        // 5. captions (what lies beyond the top and bottom edges), floor name, dimensions
        parts.push('<text x="' + (x0 + W / 2) + '" y="' + (y0 - fs * 3.9) + '" text-anchor="middle" font-size="' + fs2 + '" fill="' + LIGHT + '" letter-spacing="1">' + topCaption + "</text>");
        parts.push('<text x="' + (x0 + W / 2) + '" y="' + (y0 + D + fs * 1.2) + '" text-anchor="middle" font-size="' + fs2 + '" fill="' + LIGHT + '" letter-spacing="1">' + botCaption + "</text>");
        parts.push('<text x="' + (x0 + W / 2) + '" y="' + (y0 + D + fs * 2.8) + '" text-anchor="middle" font-size="' + (fs + 2) + '" font-weight="700" fill="' + INK + '">' + esc(f.name) + " floor</text>");
        if (col === 0) {
          // overall width along the top, depth along the left, with ticks
          var dy = y0 - fs * 1.1, dx = x0 - fs * 1.4;
          parts.push('<line x1="' + x0 + '" y1="' + dy + '" x2="' + (x0 + W) + '" y2="' + dy + '" stroke="' + INK + '" stroke-width="0.8"/><line x1="' + x0 + '" y1="' + (dy - 4) + '" x2="' + x0 + '" y2="' + (dy + 4) + '" stroke="' + INK + '" stroke-width="0.8"/><line x1="' + (x0 + W) + '" y1="' + (dy - 4) + '" x2="' + (x0 + W) + '" y2="' + (dy + 4) + '" stroke="' + INK + '" stroke-width="0.8"/>');
          parts.push('<text x="' + (x0 + W / 2) + '" y="' + (dy - 3) + '" text-anchor="middle" font-size="' + fs2 + '" fill="' + INK + '">' + Math.round(b.width_m * 1000) + "</text>");
          parts.push('<line x1="' + dx + '" y1="' + y0 + '" x2="' + dx + '" y2="' + (y0 + D) + '" stroke="' + INK + '" stroke-width="0.8"/><line x1="' + (dx - 4) + '" y1="' + y0 + '" x2="' + (dx + 4) + '" y2="' + y0 + '" stroke="' + INK + '" stroke-width="0.8"/><line x1="' + (dx - 4) + '" y1="' + (y0 + D) + '" x2="' + (dx + 4) + '" y2="' + (y0 + D) + '" stroke="' + INK + '" stroke-width="0.8"/>');
          parts.push('<text x="' + (dx - 3) + '" y="' + (y0 + D / 2) + '" text-anchor="middle" font-size="' + fs2 + '" fill="' + INK + '" transform="rotate(-90 ' + (dx - 3) + " " + (y0 + D / 2) + ')">' + Math.round(b.depth_m * 1000) + "</text>");
          // unit widths above the overall width (the cells on the top edge)
          if (cells && cells.length > 1 && cells[0].b0 < EPS) {
            var by = y0 - fs * 2.5;
            cells.filter(function (c) { return c.b0 < EPS; }).forEach(function (c) {
              var a1 = x0 + c.a0 * W, a2 = x0 + c.a1 * W;
              parts.push('<line x1="' + a1 + '" y1="' + by + '" x2="' + a2 + '" y2="' + by + '" stroke="' + LIGHT + '" stroke-width="0.7"/><line x1="' + a1 + '" y1="' + (by - 3) + '" x2="' + a1 + '" y2="' + (by + 3) + '" stroke="' + LIGHT + '" stroke-width="0.7"/><line x1="' + a2 + '" y1="' + (by - 3) + '" x2="' + a2 + '" y2="' + (by + 3) + '" stroke="' + LIGHT + '" stroke-width="0.7"/>');
              parts.push('<text x="' + ((a1 + a2) / 2) + '" y="' + (by - 2) + '" text-anchor="middle" font-size="' + (fs2 - 1) + '" fill="' + LIGHT + '">' + Math.round((c.a1 - c.a0) * b.width_m * 1000) + "</text>");
            });
          }
        }
        width = Math.max(width, x0 + W + pad);
      });
      y = y0 + D + fs * 3.6 + 16;
    });
    // scale bar
    parts.push('<line x1="' + (pad + 26) + '" y1="' + (y - 4) + '" x2="' + (pad + 26 + 5 * k) + '" y2="' + (y - 4) + '" stroke="' + INK + '" stroke-width="2"/>');
    for (var sb = 0; sb <= 5; sb++) parts.push('<line x1="' + (pad + 26 + sb * k) + '" y1="' + (y - 8) + '" x2="' + (pad + 26 + sb * k) + '" y2="' + (y - 4) + '" stroke="' + INK + '" stroke-width="1"/>');
    parts.push('<text x="' + (pad + 26 + 5 * k + 5) + '" y="' + (y - 2) + '" font-size="' + fs2 + '" fill="' + LIGHT + '">0 to 5 m; dimensions in mm</text>');
    y += 12;
    var totalW = Math.max(width, 300), totalH = y;
    var legend = o.blocks.map(function (b) { return b.unit_list.map(function (u) { return '<span class="lg"><i style="background:' + C.unitColor(o, u.key, b.key) + '"></i>' + esc(u.key) + " " + (u.kind ? esc(u.name) : u.beds + " bed / " + u.baths + " bath") + ", ~" + Math.round(areas[u.key + "@" + b.key] || 0) + " m2</span>"; }).join(""); }).join("") +
      '<span class="lg"><i style="background:#c81e1e"></i>entry</span><span class="lg"><i style="background:' + GLASS + '"></i>window</span>';
    var defs = '<defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="' + FIX + '"/></marker></defs>';
    return { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="' + totalW + '" height="' + totalH + '" viewBox="0 0 ' + totalW + " " + totalH + '" role="img" aria-label="Floor plans">' + defs + parts.join("") + "</svg>", legend: legend, width: totalW, height: totalH };
  }

  /* check(option): what the drawn plans still fail to provide: a room without a door from a circulation room,
     a door narrower than 0.85 m, a bedroom, bath, WC, hall, kitchen or stair below its minimum, or a stair
     that does not stack between the levels of a unit. Empty when the plans meet all of them. */
  function check(o) {
    var issues = [], MIN = (typeof R1Rooms !== "undefined") ? R1Rooms.MIN : { hall: 0.95, bath_w: 1.5, wc_w: 0.9, bed_w: 2.7, bed_area: 7, kitchen: 2.1, stair_w: 0.95, stair_l: 3.4, door: 0.85 };
    var stairs = {};
    C.unitRooms(o).forEach(function (ur) {
      var c = ur.cell, ext = { front: c.b0 < EPS, rear: c.b1 > 1 - EPS, left: c.a0 < EPS, right: c.a1 > 1 - EPS }, ops = openings(ur, ext), doored = {};
      var where = ur.unit + ", " + ur.floor.toLowerCase() + " floor";
      ops.forEach(function (op) { if ((op.kind === "door" || op.kind === "entry") && op.room) doored[op.room.name + "@" + op.room.x + "," + op.room.y] = op; });
      ur.rooms.forEach(function (r) {
        var tag = where + ": " + r.name.toLowerCase(), md = Math.min(r.w, r.h);
        if (!isCirc(r.name) && !isOutdoor(r.name) && !r.part && r.name !== "Kitchenette" && !doored[r.name + "@" + r.x + "," + r.y]) issues.push(tag + " has no door from a circulation room");
        if (isBed(r.name) && (md < MIN.bed_w - 0.01 || r.area_m2 < MIN.bed_area - 0.05)) issues.push(tag + " is " + fmt(r.w, 2) + " x " + fmt(r.h, 2) + " m (a bedroom needs " + MIN.bed_w + " m across and " + MIN.bed_area + " m2)");
        if ((r.name === "Bath" || r.name === "Ensuite") && md < MIN.bath_w - 0.01) issues.push(tag + " is " + fmt(md, 2) + " m across (a bathroom needs " + MIN.bath_w + " m)");
        if (r.name === "WC" && md < MIN.wc_w - 0.01) issues.push(tag + " is " + fmt(md, 2) + " m across (a water closet needs " + MIN.wc_w + " m)");
        if ((r.name === "Hall" || r.name === "Landing") && md < MIN.hall - 0.01) issues.push(tag + " is " + fmt(md, 2) + " m wide (a hall needs " + MIN.hall + " m)");
        if (r.name === "Kitchen" && md < MIN.kitchen - 0.01) issues.push(tag + " is " + fmt(md, 2) + " m across (a kitchen needs " + MIN.kitchen + " m in front of the counter)");
        if (r.name === "Stair") {
          if (md < MIN.stair_w - 0.01 || Math.max(r.w, r.h) < MIN.stair_l - 0.01) issues.push(tag + " is " + fmt(r.w, 2) + " x " + fmt(r.h, 2) + " m (a stair needs " + MIN.stair_w + " x " + MIN.stair_l + " m)");
          (stairs[ur.block + "|" + ur.unit] || (stairs[ur.block + "|" + ur.unit] = [])).push([r.x, r.y, r.w, r.h]);
        }
      });
      ops.forEach(function (op) { if ((op.kind === "door" || op.kind === "entry") && op.to - op.from < MIN.door - 0.01) issues.push(where + ": the door to " + op.room.name.toLowerCase() + " is " + fmt(op.to - op.from, 2) + " m (doors need " + MIN.door + " m)"); });
    });
    Object.keys(stairs).forEach(function (k) {
      var st = stairs[k];
      for (var i = 1; i < st.length; i++) if (st[i].some(function (v, j) { return Math.abs(v - st[0][j]) > 0.05; })) { issues.push(k.split("|")[1] + ": the stair does not stack between levels"); break; }
    });
    return issues;
  }

  return { sheet: sheet, openings: openings, fixtures: fixtures, check: check, WALL: WALL };
})();
