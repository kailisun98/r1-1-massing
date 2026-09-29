/* siteplan.js -- the site plan sheet: the lot with its street and lane, the neighbours in halftone, the yard lines
   of the schedule, the massing option's footprints with the ground-floor units in their colours, the entries, the
   exterior exit stairs and walkways, the paths, a car-share stall off the lane and the shared outdoor space (or
   private patios behind the ground units with the shared space beyond), with every dimension in halftone so the
   plan reads first. The street is at the top, as on the floor-plan sheet: the frame is a rotation of the map
   (never a reflection), and the north arrow says which way north is. Metres in the lot's frame; k px per metre. */
var R1SitePlan = (function () {
  "use strict";
  var core = R1Core, site = R1Site, M = R1Massing;
  var INK = "#1f2933", LIGHT = "#9aa4b1", HALF = "#8f99a6", RED = "#c81e1e", SETBACK = "#b42828", ENV = "#3c8cdc";
  var STALL = { w: 2.5, d: 5.5 }, PATH_W = 1.2, FRONT_WALK_W = 1.5, EDGE = 0.6, PATIO_D = 3.0, WALK = 1.0;
  var NOTES = {
    parking: "Parking: a car-share stall is optional. The tool assumes no parking minimum applies to an R1-1 multiplex (verify against the Parking By-law); stalls are 2.5 x 5.5 m, entered from the lane, so a lane must exist and the rear yard must hold a 5.5 m stall.",
    outdoor: "Outdoor space: the shared area is what the rear yard (or the courtyard) leaves after the walkways, stairs, paths and stalls; private patios are 3.0 m deep behind the ground units that face the yard. Site coverage, impermeable-area and outdoor-space rules of the schedule are not checked here.",
    projections: "Exterior stairs and walkways stand off the building faces (1.2 m walkway, 2.4 m stair); the yard-projection rules for open stairs are not checked."
  };
  function fmt(x, d) { return Number(x).toFixed(d); }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function mm(x) { return String(Math.round(x * 1000)); }

  /* frame(ev): the sheet frame: x across the front, y into the site from the front lot line; oriented so the sheet is
     a rotation of the map. mirror says whether side 1 then lies on the right (the plan sheet mirrors to match). */
  function frame(ev) {
    var E = ev.edges, f = ev.idx.front, d = E[f].d, n = E[f].n;
    if (d[0] * n[1] - d[1] * n[0] > 0) d = [-d[0], -d[1]];
    var o = core.mid(E[f].a, E[f].b), ms1 = core.mid(E[ev.idx.side1].a, E[ev.idx.side1].b);
    var mirror = (ms1[0] - o[0]) * d[0] + (ms1[1] - o[1]) * d[1] > 0;
    return { o: o, d: d, n: n, mirror: mirror, T: function (p) { var dx = p[0] - o[0], dy = p[1] - o[1]; return [dx * d[0] + dy * d[1], dx * n[0] + dy * n[1]]; } };
  }
  function bbox(pts) { var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; }); return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) }; }

  /* sheet(ctx, opts): ctx {ev, form, option, res, det, parcel, address}; opts {k, carshare: 0|1|2|null (auto), outdoor: "shared"|"patios"} */
  function sheet(ctx, opts) {
    opts = opts || {};
    var ev = ctx.ev, form = ctx.form && ctx.form.status === "ok" ? ctx.form : null, o = form ? ctx.option || null : null, res = ctx.res || {}, det = ctx.det, k = opts.k || 9;
    var F = frame(ev), T = F.T, R = core.RULES, FR = M.FORM_RULES, like = form ? (form.dims_like || form.scheme) : "single", isCourt = like === "courtyard";
    var lot = ev.pts.map(T), LB = bbox(lot), frontGap = det && det.front && det.front.gap_m ? Math.min(det.front.gap_m, 14) : 12, rearGap = det && det.rear && det.rear.gap_m ? Math.min(det.rear.gap_m, 10) : 6;
    var hasLane = !!(det && det.rear && det.rear.gap_m !== null && det.rear.gap_m >= 3 && det.rear.gap_m < 12);
    var access = (o && typeof R1Access !== "undefined") ? R1Access.plan(o) : null;
    var win = { x0: LB.x0 - 7, x1: LB.x1 + 11, y0: LB.y0 - (frontGap + 2.5), y1: LB.y1 + (rearGap + 2.5) };
    var pad = 22, W = (win.x1 - win.x0) * k + 2 * pad, H = (win.y1 - win.y0) * k + 2 * pad, fs = Math.max(7.5, k * 0.95), fs2 = Math.max(6.5, k * 0.8), parts = [], notes = [], rows = [];
    function X(x) { return pad + (x - win.x0) * k; } function Y(y) { return pad + (y - win.y0) * k; }
    function P(p) { var q = T(p); return [X(q[0]), Y(q[1])]; }
    function pts(list) { return list.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" "); }
    function polyS(sitePts) { return pts(sitePts.map(P)); }
    function polyF(framePts) { return pts(framePts.map(function (p) { return [X(p[0]), Y(p[1])]; })); }
    function rectF(x0, y0, x1, y1, style) { return '<rect x="' + X(Math.min(x0, x1)).toFixed(1) + '" y="' + Y(Math.min(y0, y1)).toFixed(1) + '" width="' + (Math.abs(x1 - x0) * k).toFixed(1) + '" height="' + (Math.abs(y1 - y0) * k).toFixed(1) + '" ' + style + "/>"; }
    function text(x, y, s, style) { return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" ' + style + ">" + esc(s) + "</text>"; }
    function textF(x, y, s, style, dyPx) { return text(X(x), Y(y) + (dyPx || 0), s, style); }   // frame metres, plus an optional pixel offset down
    // halftone dimensions: a horizontal string at frame y, or a vertical string at frame x, ticks and the value in mm
    function dimH(x0, x1, y, label, above) {
      var a = [X(x0), Y(y)], b = [X(x1), Y(y)], t = 3;
      parts.push('<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '" stroke="' + HALF + '" stroke-width="0.6"/>');
      [a, b].forEach(function (p) { parts.push('<line x1="' + (p[0] - t) + '" y1="' + (p[1] + t) + '" x2="' + (p[0] + t) + '" y2="' + (p[1] - t) + '" stroke="' + HALF + '" stroke-width="0.9"/>'); });
      parts.push(text((a[0] + b[0]) / 2, above === false ? a[1] + fs2 + 2 : a[1] - 3, (label ? label + " " : "") + mm(Math.abs(x1 - x0)), 'text-anchor="middle" font-size="' + fs2 + '" fill="' + HALF + '" font-family="SF Mono, Menlo, Consolas, monospace"'));
    }
    function dimV(y0, y1, x, label, left) {
      var a = [X(x), Y(y0)], b = [X(x), Y(y1)], t = 3;
      parts.push('<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '" stroke="' + HALF + '" stroke-width="0.6"/>');
      [a, b].forEach(function (p) { parts.push('<line x1="' + (p[0] - t) + '" y1="' + (p[1] + t) + '" x2="' + (p[0] + t) + '" y2="' + (p[1] - t) + '" stroke="' + HALF + '" stroke-width="0.9"/>'); });
      var tx = left === false ? a[0] + fs2 + 2 : a[0] - 3, ty = (a[1] + b[1]) / 2;
      parts.push('<text x="' + tx + '" y="' + ty + '" text-anchor="middle" font-size="' + fs2 + '" fill="' + HALF + '" font-family="SF Mono, Menlo, Consolas, monospace" transform="rotate(-90 ' + tx + " " + ty + ')">' + esc((label ? label + " " : "") + mm(Math.abs(y1 - y0))) + "</text>");
    }
    parts.push('<defs><clipPath id="siteclip"><rect x="' + pad + '" y="' + pad + '" width="' + (W - 2 * pad) + '" height="' + (H - 2 * pad) + '"/></clipPath>' +
      '<pattern id="lawn" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M 0 6 L 6 0" stroke="#b9cfae" stroke-width="0.6"/></pattern>' +
      '<marker id="sarr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="' + INK + '"/></marker></defs>');
    parts.push('<rect x="' + pad + '" y="' + pad + '" width="' + (W - 2 * pad) + '" height="' + (H - 2 * pad) + '" fill="#f7f7f5" stroke="' + LIGHT + '" stroke-width="0.6"/>');
    parts.push('<g clip-path="url(#siteclip)">');
    // 1. the streets and lanes, the neighbours' parcels and buildings, in halftone
    if (res.roads) res.roads.segments.forEach(function (seg) {
      seg.pieces.forEach(function (pc) { parts.push('<polygon points="' + polyS(pc.quad) + '" fill="' + (seg.kind === "street" ? "#e6e6e3" : "#ededea") + '"/>'); });
      parts.push('<polyline points="' + polyS(seg.pts) + '" fill="none" stroke="#c9c9c4" stroke-width="0.7" stroke-dasharray="6 3 1 3"/>');
    });
    (res.parcels || []).forEach(function (p) { if (p === ctx.parcel) return; parts.push('<polygon points="' + polyS(p.ring) + '" fill="none" stroke="#d3d7dc" stroke-width="0.7"/>'); });
    (res.buildings || []).forEach(function (b) { if (ctx.parcel && site.pointInRing(b.centroid, ctx.parcel.ring)) return; parts.push('<polygon points="' + polyS(b.ring) + '" fill="#ebebe8" stroke="#cfd3d8" stroke-width="0.7"/>'); });
    if (res.roads) {
      var pf = [F.o[0] - F.n[0] * frontGap / 2, F.o[1] - F.n[1] * frontGap / 2], sf = M.roadNameNear(res.roads, pf);
      var rm = core.mid(ev.edges[ev.idx.rear].a, ev.edges[ev.idx.rear].b), pr = [rm[0] + F.n[0] * rearGap / 2, rm[1] + F.n[1] * rearGap / 2], sr = M.roadNameNear(res.roads, pr);
      if (sf) parts.push(textF((LB.x0 + LB.x1) / 2, LB.y0 - frontGap / 2 + 0.3, sf.name.toUpperCase(), 'text-anchor="middle" font-size="' + fs + '" fill="#8a8a86" letter-spacing="2"'));
      if (sr) parts.push(textF((LB.x0 + LB.x1) / 2, LB.y1 + rearGap / 2 + 0.3, (sr.name || "LANE").toUpperCase(), 'text-anchor="middle" font-size="' + fs2 + '" fill="#8a8a86" letter-spacing="2"'));
    }
    // 2. the lot
    parts.push('<polygon points="' + polyF(lot) + '" fill="#f1f5ec" stroke="' + INK + '" stroke-width="1.6"/>');
    // 3. the buildings (frame boxes are used for the open-space arithmetic)
    var blds = [], bByKey = {};
    if (form) form.buildings.forEach(function (b) { var fp = b.pts.map(T), bb = bbox(fp); var e = { b: b, fp: fp, box: bb, key: b.key }; blds.push(e); bByKey[b.key] = e; });
    var frontB = blds.filter(function (e) { return e.key !== "rear"; }), rearB = bByKey.rear || null;
    var backOfFront = frontB.length ? Math.max.apply(null, frontB.map(function (e) { return e.box.y1; })) : (ev.env_pts ? bbox(ev.env_pts.map(T)).y1 : LB.y0 + R.front_yard_m.value);
    var frontOfFront = frontB.length ? Math.min.apply(null, frontB.map(function (e) { return e.box.y0; })) : LB.y0 + R.front_yard_m.value;
    // the exterior stairs and walkways, in the frame
    var acc = [];   // {kind, face, block, rect (frame box), pts (site)}
    if (access && form) form.buildings.forEach(function (bld) {
      var B = access.blocks[bld.key]; if (!B) return;
      B.walkways.forEach(function (w) { if (!B.walkways.some(function (z) { return z.face === w.face && z.floor_index < w.floor_index; })) { var q = R1Access.rectSite(bld, B, w.x0, w.x1, w.y0, w.y1); acc.push({ kind: "walkway", face: w.face, block: bld.key, pts: q, box: bbox(q.map(T)) }); } });
      B.stairs.forEach(function (st) { var q = R1Access.rectSite(bld, B, st.x0, st.x1, st.y0, st.y1), q0 = R1Access.rectSite(bld, B, st.land0[0], st.land0[1], st.y0, st.y1), q1 = R1Access.rectSite(bld, B, st.land1[0], st.land1[1], st.y0, st.y1), run = R1Access.rectSite(bld, B, st.run[0], st.run[1], st.outer[0], st.outer[1]); acc.push({ kind: "stair", face: st.face, block: bld.key, st: st, B: B, bld: bld, pts: q, land0: q0, land1: q1, run: run, box: bbox(q.map(T)) }); });
    });
    var rearProj = Math.max.apply(null, [0].concat(acc.filter(function (a) { return a.block !== "rear" && a.face === "rear"; }).map(function (a) { return a.box.y1 - backOfFront; })));
    var courtProjRear = rearB ? Math.max.apply(null, [0].concat(acc.filter(function (a) { return a.block === "rear" && a.face === "front"; }).map(function (a) { return rearB.box.y0 - a.box.y0; }))) : 0;
    // 4. open space: stalls, patios and the shared area
    var xL = LB.x0 + EDGE, xR = LB.x1 - EDGE, yR = LB.y1 - EDGE, stalls = [], patios = [], shared = [], stallNote = "";
    var carshare = opts.carshare === null || opts.carshare === undefined ? (hasLane && !isCourt ? 1 : 0) : opts.carshare;
    if (carshare > 0) {
      if (isCourt) { stallNote = "No car-share stall: the rear building stands " + FR.courtyard_rear_yard_m.value + " m off the lane, so nothing can park off it."; carshare = 0; }
      else if (!hasLane) { stallNote = "No car-share stall: no lane was detected behind this lot, and a driveway from the street would cross the front yard."; carshare = 0; }
      else if (LB.y1 - backOfFront - rearProj < STALL.d + WALK) { stallNote = "No car-share stall: the rear yard behind the building and its stair is shallower than a 5.5 m stall."; carshare = 0; }
    }
    if (carshare > 0) {
      // stalls at the rear lot line, entered from the lane, on the side away from the rear stair
      var stairX = acc.filter(function (a) { return a.kind === "stair" && a.face === "rear"; }).map(function (a) { return (a.box.x0 + a.box.x1) / 2; })[0];
      var atRight = stairX === undefined ? true : stairX < (LB.x0 + LB.x1) / 2, sw = STALL.w * carshare;
      var sx0 = atRight ? xR - sw : xL, sx1 = sx0 + sw;
      for (var i = 0; i < carshare; i++) stalls.push({ x0: sx0 + i * STALL.w, x1: sx0 + (i + 1) * STALL.w, y0: LB.y1 - STALL.d, y1: LB.y1 });
      var beside = atRight ? [xL, sx0 - WALK] : [sx1 + WALK, xR];
      shared.push({ x0: xL, x1: xR, y0: backOfFront + rearProj + (rearProj > 0 ? 0.3 : WALK), y1: LB.y1 - STALL.d - WALK, name: "SHARED OUTDOOR SPACE" });
      if (beside[1] - beside[0] >= 2.0) shared.push({ x0: beside[0], x1: beside[1], y0: LB.y1 - STALL.d - WALK, y1: yR, name: null });
    } else if (isCourt && rearB) {
      shared.push({ x0: xL, x1: xR, y0: backOfFront + (rearProj > 0 ? R1Access.WALK_W : WALK), y1: rearB.box.y0 - (courtProjRear > 0 ? R1Access.WALK_W : WALK), name: "SHARED COURTYARD" });
    } else {
      shared.push({ x0: xL, x1: xR, y0: backOfFront + rearProj + (rearProj > 0 ? 0.3 : WALK), y1: yR, name: "SHARED OUTDOOR SPACE" });
    }
    if (opts.outdoor === "patios" && o && !isCourt && shared.length) {
      // a private patio behind each ground unit on the rear face of the buildings on the street
      R1Cmhc.unitVolumes(o, form).filter(function (v) { return v.floor_index === 0 && v.block !== "rear"; }).forEach(function (v) {
        var cb = bbox(v.pts.map(T)), e = bByKey[v.block]; if (!e || cb.y1 < e.box.y1 - 0.05) return;
        patios.push({ x0: cb.x0 + 0.3, x1: cb.x1 - 0.3, y0: cb.y1, y1: cb.y1 + PATIO_D, unit: v.unit, color: v.color });
      });
      if (patios.length) { var py = Math.max.apply(null, patios.map(function (p) { return p.y1; })) + WALK; shared.forEach(function (s) { if (s.name) s.y0 = Math.max(s.y0, py); }); }
    }
    shared = shared.filter(function (s) { return s.y1 - s.y0 >= 1.0 && s.x1 - s.x0 >= 1.0; });
    shared.forEach(function (s) { parts.push(rectF(s.x0, s.y0, s.x1, s.y1, 'fill="#dbe9d0"')); parts.push(rectF(s.x0, s.y0, s.x1, s.y1, 'fill="url(#lawn)" stroke="#8fae7e" stroke-width="0.8" stroke-dasharray="5 3"')); });
    patios.forEach(function (p) { parts.push(rectF(p.x0, p.y0, p.x1, p.y1, 'fill="' + p.color + '" fill-opacity="0.16" stroke="' + p.color + '" stroke-width="0.8" stroke-dasharray="3 2"')); if ((p.x1 - p.x0) * k > fs2 * 4) parts.push(textF((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, "PATIO " + p.unit, 'text-anchor="middle" font-size="' + (fs2 - 1) + '" fill="' + INK + '" fill-opacity=".7" letter-spacing=".5"', fs2 * 0.35)); });
    // 5. paths: the front walk to the street entries, the side-yard path to the rear yard, the gap of a side-by-side pair
    var paths = [], entries = [];
    if (o) {
      var byCell = {}; R1Cmhc.unitRooms(o).forEach(function (ur) { byCell[ur.block + "|" + ur.floor_index + "|" + ur.unit] = ur; });
      R1Cmhc.unitVolumes(o, form).filter(function (v) { return v.floor_index === 0; }).forEach(function (v) {
        var ur = byCell[v.block + "|0|" + v.unit]; if (!ur || ur.level_index !== 0) return;
        var c = ur.cell, ext = { front: c.b0 < 0.02, rear: c.b1 > 0.98, left: c.a0 < 0.02, right: c.a1 > 0.98 }, e = bByKey[v.block], B = access ? access.blocks[v.block] : null;
        var op = R1Plans.openings(ur, ext).filter(function (x) { return x.kind === "entry"; })[0]; if (!op || !e || !B) return;
        var mx = c.a0 * B.width_m + (op.side === "h" ? (op.from + op.to) / 2 : op.at), my = c.b0 * B.depth_m + (op.side === "h" ? op.at : (op.from + op.to) / 2);
        var outv = op.face === "front" ? [0, -1] : op.face === "rear" ? [0, 1] : op.face === "left" ? [-1, 0] : [1, 0];
        var pd = T(R1Access.toSite(e.b, B, mx, my)), po = T(R1Access.toSite(e.b, B, mx + outv[0] * 0.6, my + outv[1] * 0.6));
        entries.push({ unit: v.unit, face: op.face, door: pd, out: po, block: v.block });
      });
    }
    var frontEntries = entries.filter(function (en) { return en.face === "front" && en.block !== "rear"; });
    if (frontEntries.length && frontB.length) {
      if (frontEntries.length <= 2) frontEntries.forEach(function (en) { paths.push({ x0: en.door[0] - FRONT_WALK_W / 2, x1: en.door[0] + FRONT_WALK_W / 2, y0: LB.y0, y1: frontOfFront }); });
      else {
        var ex0 = Math.min.apply(null, frontEntries.map(function (en) { return en.door[0]; })) - FRONT_WALK_W / 2, ex1 = Math.max.apply(null, frontEntries.map(function (en) { return en.door[0]; })) + FRONT_WALK_W / 2, exm = (ex0 + ex1) / 2;
        paths.push({ x0: ex0, x1: ex1, y0: frontOfFront - FRONT_WALK_W, y1: frontOfFront }, { x0: exm - FRONT_WALK_W / 2, x1: exm + FRONT_WALK_W / 2, y0: LB.y0, y1: frontOfFront - FRONT_WALK_W });
      }
    } else if (frontB.length) paths.push({ x0: (frontB[0].box.x0 + frontB[0].box.x1) / 2 - FRONT_WALK_W / 2, x1: (frontB[0].box.x0 + frontB[0].box.x1) / 2 + FRONT_WALK_W / 2, y0: LB.y0, y1: frontOfFront });
    var sidePathAt = null;   // the side yard that carries the path to the rear: the rear stair's side, else side 1
    var rearStair = acc.filter(function (a) { return a.kind === "stair" && a.face === "rear" && a.block !== "rear"; })[0], courtStair = acc.filter(function (a) { return a.kind === "stair" && a.block === "rear"; })[0];
    if (like === "side_by_side" && blds.length === 2) {
      var g0 = Math.min(blds[0].box.x1, blds[1].box.x1), g1 = Math.max(blds[0].box.x0, blds[1].box.x0);
      paths.push({ x0: g0 + 0.3, x1: g1 - 0.3, y0: frontOfFront - FRONT_WALK_W, y1: backOfFront + WALK, gap: true });
    } else {
      var sideRef = rearStair || courtStair || entries.filter(function (en) { return en.face === "left" || en.face === "right"; })[0];
      var atLeft = sideRef ? (sideRef.box ? (sideRef.box.x0 + sideRef.box.x1) / 2 < (LB.x0 + LB.x1) / 2 : sideRef.door[0] < (LB.x0 + LB.x1) / 2) : !F.mirror;
      sidePathAt = atLeft ? "left" : "right";
      var spx0 = atLeft ? LB.x0 : LB.x1 - PATH_W, spEnd = rearB ? rearB.box.y0 - courtProjRear : backOfFront + rearProj + WALK;
      paths.push({ x0: spx0, x1: spx0 + PATH_W, y0: LB.y0, y1: Math.min(spEnd, LB.y1 - EDGE), side: true });
    }
    paths.forEach(function (p) { parts.push(rectF(p.x0, p.y0, p.x1, p.y1, 'fill="#dedfd9" stroke="#b8bab3" stroke-width="0.6"')); });
    stalls.forEach(function (s, i) {
      parts.push(rectF(s.x0, s.y0, s.x1, s.y1, 'fill="#e2e3df" stroke="' + INK + '" stroke-width="0.8"'));
      parts.push(rectF(s.x0 + 0.35, s.y0 + 0.5, s.x1 - 0.35, s.y1 - 0.5, 'fill="none" stroke="' + LIGHT + '" stroke-width="0.7" rx="' + (0.4 * k) + '"'));   // the car
      parts.push('<line x1="' + X(s.x0 + 0.35) + '" y1="' + Y(s.y0 + 1.9) + '" x2="' + X(s.x1 - 0.35) + '" y2="' + Y(s.y0 + 1.9) + '" stroke="' + LIGHT + '" stroke-width="0.6"/><line x1="' + X(s.x0 + 0.35) + '" y1="' + Y(s.y1 - 1.6) + '" x2="' + X(s.x1 - 0.35) + '" y2="' + Y(s.y1 - 1.6) + '" stroke="' + LIGHT + '" stroke-width="0.6"/>');
      if (i === 0) { parts.push(textF((s.x0 + s.x1) / 2, s.y0 + 0.4, "CAR", 'text-anchor="middle" font-size="' + (fs2 - 0.5) + '" fill="' + INK + '" letter-spacing=".5"', fs2)); parts.push(textF((s.x0 + s.x1) / 2, s.y0 + 0.4, "SHARE", 'text-anchor="middle" font-size="' + (fs2 - 0.5) + '" fill="' + INK + '" letter-spacing=".5"', fs2 * 2.1)); }
    });
    // 6. the envelope when no form is drawn, the footprints, the ground units and their labels
    if (!form && ev.env_pts) { parts.push('<polygon points="' + polyS(ev.env_pts) + '" fill="' + ENV + '" fill-opacity="0.18" stroke="' + ENV + '" stroke-width="1.2" stroke-dasharray="6 3"/>'); var eb = bbox(ev.env_pts.map(T)); parts.push(textF((eb.x0 + eb.x1) / 2, (eb.y0 + eb.y1) / 2, "PERMITTED ENVELOPE", 'text-anchor="middle" font-size="' + fs + '" fill="' + INK + '" letter-spacing="1"', fs * 0.35)); }
    blds.forEach(function (e) {
      var col = form.scheme === "cmhc" ? "#2a9d8f" : "#d99a2b";
      parts.push('<polygon points="' + polyF(e.fp) + '" fill="' + col + '" fill-opacity="' + (o ? 0.12 : 0.4) + '" stroke="' + INK + '" stroke-width="1.3"/>');
      if (!o) parts.push(textF((e.box.x0 + e.box.x1) / 2, (e.box.y0 + e.box.y1) / 2, e.b.name.toUpperCase() + " · " + e.b.storeys + " ST", 'text-anchor="middle" font-size="' + fs2 + '" fill="' + INK + '" letter-spacing=".5"', fs * 0.35));
    });
    if (o) R1Cmhc.unitVolumes(o, form).filter(function (v) { return v.floor_index === 0; }).forEach(function (v) {
      var u = R1Cmhc.unitOf(R1Cmhc.blockOf(o, v.block), v.unit) || {}, cb = bbox(v.pts.map(T)), c = T(v.centroid);
      parts.push('<polygon points="' + polyS(v.pts) + '" fill="' + v.color + '" fill-opacity="0.55" stroke="#ffffff" stroke-width="0.8"/>');
      if ((cb.x1 - cb.x0) * k > fs * 2.2 && (cb.y1 - cb.y0) * k > fs * 2.4) {
        parts.push(textF(c[0], c[1], v.unit, 'text-anchor="middle" font-size="' + fs + '" font-weight="700" fill="#ffffff"', -1));
        if ((cb.x1 - cb.x0) * k > fs2 * 5) parts.push(textF(c[0], c[1], u.kind ? (u.name || "").toUpperCase() : v.beds + " BED", 'text-anchor="middle" font-size="' + (fs2 - 1) + '" fill="#ffffff" letter-spacing=".5"', fs2 * 1.1));
      }
    });
    blds.forEach(function (e) { if (o) parts.push(textF(e.box.x1 - 0.35, e.box.y0 + 0.35, e.b.storeys + " STOREYS", 'text-anchor="end" font-size="' + (fs2 - 1.5) + '" fill="' + INK + '" fill-opacity=".8" letter-spacing=".5"', fs2)); });
    // 7. the exterior stairs and walkways
    acc.forEach(function (a) {
      if (a.kind === "walkway") { parts.push('<polygon points="' + polyS(a.pts) + '" fill="none" stroke="' + INK + '" stroke-width="0.8" stroke-dasharray="4 3"/>'); if ((a.box.x1 - a.box.x0) * k > fs2 * 8) parts.push(textF(a.box.x0 + (a.box.x1 - a.box.x0) * 0.3, (a.box.y0 + a.box.y1) / 2, "WALKWAY OVER", 'text-anchor="middle" font-size="' + (fs2 - 1.5) + '" fill="' + INK + '" fill-opacity=".7" letter-spacing=".5"', fs2 * 0.35)); }
      else {
        parts.push('<polygon points="' + polyS(a.pts) + '" fill="#f1f2ef" stroke="' + INK + '" stroke-width="0.9"/>');
        [a.land0, a.land1].forEach(function (q) { parts.push('<polygon points="' + polyS(q) + '" fill="#e9ebe6" stroke="' + LIGHT + '" stroke-width="0.6"/>'); });
        var st = a.st, n = Math.max(4, Math.round((st.run[1] - st.run[0]) / 0.27));
        for (var t = 0; t <= n; t++) { var xt = st.run[0] + (st.run[1] - st.run[0]) * t / n, p1 = P(R1Access.toSite(a.bld, a.B, xt, st.outer[0])), p2 = P(R1Access.toSite(a.bld, a.B, xt, st.outer[1])); parts.push('<line x1="' + p1[0].toFixed(1) + '" y1="' + p1[1].toFixed(1) + '" x2="' + p2[0].toFixed(1) + '" y2="' + p2[1].toFixed(1) + '" stroke="#4b5563" stroke-width="0.6"/>'); }
        var ya = (st.outer[0] + st.outer[1]) / 2, pa = P(R1Access.toSite(a.bld, a.B, st.run[0] + (st.dir > 0 ? 0.2 : (st.run[1] - st.run[0]) - 0.2), ya)), pb = P(R1Access.toSite(a.bld, a.B, st.run[0] + (st.dir > 0 ? (st.run[1] - st.run[0]) - 0.35 : 0.35), ya));
        parts.push('<line x1="' + pa[0].toFixed(1) + '" y1="' + pa[1].toFixed(1) + '" x2="' + pb[0].toFixed(1) + '" y2="' + pb[1].toFixed(1) + '" stroke="' + INK + '" stroke-width="0.8" marker-end="url(#sarr)"/>');
        var lc = P(R1Access.toSite(a.bld, a.B, (st.land0[0] + st.land0[1]) / 2, (st.y0 + st.y1) / 2));
        parts.push(text(lc[0], lc[1] + fs2 * 0.35, "UP", 'text-anchor="middle" font-size="' + (fs2 - 1) + '" fill="' + INK + '"'));
        var rc = P(R1Access.toSite(a.bld, a.B, (st.land1[0] + st.land1[1]) / 2, (st.y0 + st.y1) / 2));   // the name reads along the mid landing, as on the plans
        parts.push('<text x="' + rc[0].toFixed(1) + '" y="' + (rc[1] + fs2 * 0.35).toFixed(1) + '" text-anchor="middle" font-size="' + (fs2 - 1.5) + '" fill="' + INK + '" fill-opacity=".8" letter-spacing=".5" transform="rotate(-90 ' + rc[0].toFixed(1) + " " + (rc[1] + fs2 * 0.35).toFixed(1) + ')">EXIT STAIR</text>');
      }
    });
    // 8. entries at grade: a red arrow outside each door, pointing in
    entries.forEach(function (en) {
      var a = [X(en.out[0]), Y(en.out[1])], b = [X(en.door[0]), Y(en.door[1])], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, s = 4.5;
      parts.push('<path d="M ' + (b[0] - ux * 1).toFixed(1) + " " + (b[1] - uy * 1).toFixed(1) + " L " + (a[0] - uy * s).toFixed(1) + " " + (a[1] + ux * s).toFixed(1) + " L " + (a[0] + uy * s).toFixed(1) + " " + (a[1] - ux * s).toFixed(1) + ' z" fill="' + RED + '"/>');
    });
    // 9. the yard lines of the schedule: dashed across the lot, named in the margins (front and rear yards tagged at
    // the right end of their lines, side yards at the lane end), so no label crosses the drawing
    var tagStyle = 'font-size="' + (fs2 - 1) + '" fill="' + SETBACK + '" letter-spacing=".5"';
    M.setbackSegments(ev).forEach(function (sg) {
      var a = T(sg.a), b = T(sg.b), along = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);
      parts.push('<line x1="' + X(a[0]) + '" y1="' + Y(a[1]) + '" x2="' + X(b[0]) + '" y2="' + Y(b[1]) + '" stroke="' + SETBACK + '" stroke-width="0.8" stroke-dasharray="7 4" stroke-opacity=".85"/>');
      if (along) { var right = a[0] > b[0] ? a : b; parts.push(text(X(LB.x1) + 4, Y(right[1]) + 3, sg.kind + " YARD" + (sg.kind === "REAR" && rearB ? " (SINGLE BLDG)" : ""), 'text-anchor="start" ' + tagStyle)); }
      else { var low = a[1] > b[1] ? a : b; parts.push(text(X(low[0]), Y(LB.y1) + fs2 + 3, "SIDE YARD", 'text-anchor="middle" ' + tagStyle)); }
    });
    if (rearB) {   // the courtyard rear yard line at 0.9 m
      var Er = ev.edges[ev.idx.rear], L9 = M.offsetLine(Er, FR.courtyard_rear_yard_m.value), a9 = core.intersect(L9[0], L9[1], ev.edges[ev.idx.side1].a, ev.edges[ev.idx.side1].d), b9 = core.intersect(L9[0], L9[1], ev.edges[ev.idx.side2].a, ev.edges[ev.idx.side2].d);
      if (a9 && b9) { var A9 = T(a9), B9 = T(b9); parts.push('<line x1="' + X(A9[0]) + '" y1="' + Y(A9[1]) + '" x2="' + X(B9[0]) + '" y2="' + Y(B9[1]) + '" stroke="' + SETBACK + '" stroke-width="0.8" stroke-dasharray="7 4"/>'); parts.push(text(X(LB.x1) + 4, Y((A9[1] + B9[1]) / 2) + 3, "REAR YARD (REAR BLDG)", 'text-anchor="start" ' + tagStyle)); }
    }
    // 10. labels of the open space and the halftone dimensions
    shared.forEach(function (s) {
      if (!s.name) return;
      var area = shared.reduce(function (t, z) { return t + (z.x1 - z.x0) * (z.y1 - z.y0); }, 0), cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2;
      parts.push(textF(cx, cy, s.name, 'text-anchor="middle" font-size="' + fs + '" fill="' + INK + '" fill-opacity=".8" letter-spacing="1"', -1));
      parts.push(textF(cx, cy, "~" + Math.round(area) + " m2", 'text-anchor="middle" font-size="' + fs2 + '" fill="' + INK + '" fill-opacity=".7"', fs * 1.2));
      dimH(s.x0, s.x1, s.y0 + 0.9, null, false); dimV(s.y0, s.y1, s.x0 + 0.9, null, false);
    });
    stalls.forEach(function (s, i) { if (i === 0) { dimH(s.x0, s.x1, s.y0 - 0.6, null, true); dimV(s.y0, s.y1, s.x0 - 0.6, null, true); } });
    if (patios.length) dimV(patios[0].y0, patios[0].y1, patios[0].x0 - 0.5, null, true);
    // outside the lot: the depth chain on the left, the width chain across the front, the overall size opposite
    var chainX = LB.x0 - 2.4, ys = [LB.y0].concat(frontB.length ? [frontOfFront, backOfFront] : (ev.env_pts ? [bbox(ev.env_pts.map(T)).y0, bbox(ev.env_pts.map(T)).y1] : []));
    if (rearB) ys.push(rearB.box.y0, rearB.box.y1);
    ys.push(LB.y1);
    for (var yi = 1; yi < ys.length; yi++) if (ys[yi] - ys[yi - 1] > 0.3) dimV(ys[yi - 1], ys[yi], chainX, null, true);
    var chainY = LB.y0 - 2.0, xs = [LB.x0];
    if (like === "side_by_side" && blds.length === 2) { var bl = blds.slice().sort(function (p, q) { return p.box.x0 - q.box.x0; }); xs.push(bl[0].box.x0, bl[0].box.x1, bl[1].box.x0, bl[1].box.x1); }
    else if (frontB.length) xs.push(frontB[0].box.x0, frontB[0].box.x1);
    else if (ev.env_pts) { var ebx = bbox(ev.env_pts.map(T)); xs.push(ebx.x0, ebx.x1); }
    xs.push(LB.x1);
    for (var xi = 1; xi < xs.length; xi++) if (xs[xi] - xs[xi - 1] > 0.3) dimH(xs[xi - 1], xs[xi], chainY, null, true);
    dimV(LB.y0, LB.y1, LB.x1 + 6.2, "SITE DEPTH", false);   // beyond the yard tags
    dimH(LB.x0, LB.x1, LB.y0 - 4.2, "FRONTAGE", true);
    parts.push("</g>");
    // 11. north arrow, scale bar
    var nx = F.d[1], ny = F.n[1], cxN = W - pad - 22, cyN = pad + 26, L = 13;
    parts.push('<circle cx="' + cxN + '" cy="' + cyN + '" r="17" fill="#ffffff" fill-opacity=".85" stroke="' + LIGHT + '" stroke-width="0.6"/>');
    parts.push('<line x1="' + (cxN - nx * L * 0.6).toFixed(1) + '" y1="' + (cyN - ny * L * 0.6).toFixed(1) + '" x2="' + (cxN + nx * L).toFixed(1) + '" y2="' + (cyN + ny * L).toFixed(1) + '" stroke="' + INK + '" stroke-width="1.2" marker-end="url(#sarr)"/>');
    parts.push(text(cxN + nx * (L + 9), cyN + ny * (L + 9) + 3, "N", 'text-anchor="middle" font-size="9" font-weight="700" fill="' + INK + '"'));
    var sbx = pad + 8, sby = H - pad - 8;
    parts.push('<line x1="' + sbx + '" y1="' + sby + '" x2="' + (sbx + 10 * k) + '" y2="' + sby + '" stroke="' + INK + '" stroke-width="2"/>');
    for (var s5 = 0; s5 <= 10; s5 += 5) parts.push('<line x1="' + (sbx + s5 * k) + '" y1="' + (sby - 5) + '" x2="' + (sbx + s5 * k) + '" y2="' + sby + '" stroke="' + INK + '" stroke-width="1"/>');
    parts.push(text(sbx + 10 * k + 5, sby + 1, "0 to 10 m; dimensions in mm", 'font-size="' + fs2 + '" fill="' + LIGHT + '"'));
    // the schedule and the notes
    var footprint = blds.reduce(function (t, e) { return t + e.b.footprint_m2; }, 0), sharedArea = shared.reduce(function (t, z) { return t + (z.x1 - z.x0) * (z.y1 - z.y0); }, 0), dwellings = o ? o.units : 0;
    rows.push(["Site", fmt(ev.area, 1) + " m2, " + fmt(ev.frontage, 2) + " m frontage x " + fmt(ev.site_depth, 2) + " m deep"]);
    if (blds.length) rows.push(["Footprint", blds.map(function (e) { return e.b.name + " " + fmt(e.b.width_m, 1) + " x " + fmt(e.b.depth_m, 1) + " m"; }).join("; ") + " = " + fmt(footprint, 1) + " m2, " + Math.round(100 * footprint / ev.area) + "% of the site"]);
    rows.push([shared.length && shared[0].name === "SHARED COURTYARD" ? "Shared courtyard" : "Shared outdoor space", Math.round(sharedArea) + " m2" + (dwellings ? " = " + Math.round(sharedArea / dwellings) + " m2 per dwelling" : "") + (shared.length ? " (" + fmt(shared[0].x1 - shared[0].x0, 1) + " x " + fmt(shared[0].y1 - shared[0].y0, 1) + " m" + (shared.length > 1 ? " + " + fmt(shared[1].x1 - shared[1].x0, 1) + " x " + fmt(shared[1].y1 - shared[1].y0, 1) + " m beside the stalls" : "") + ")" : "")]);
    if (patios.length) rows.push(["Private patios", patios.length + " x " + PATIO_D + " m deep behind " + patios.map(function (p) { return p.unit; }).join(", ")]);
    rows.push(["Car share", stalls.length ? stalls.length + " stall" + (stalls.length > 1 ? "s" : "") + " of " + STALL.w + " x " + STALL.d + " m at the rear lot line, entered from the lane" : (stallNote || "none shown")]);
    if (access) { var al = R1Access.lines(access); rows.push(["Access", al.length ? al.join(" ") : "Every unit is entered at grade" + (sidePathAt ? "; a " + PATH_W + " m path in the " + sidePathAt + " side yard leads to the rear yard" : "") + "."]); }
    if (paths.length) rows.push(["Paths", (frontEntries.length ? FRONT_WALK_W + " m walk from the street to the front entries" : FRONT_WALK_W + " m walk to the front face") + (sidePathAt ? "; " + PATH_W + " m path along the " + sidePathAt + " side yard to the rear" : (like === "side_by_side" ? "; the gap between the buildings leads to the rear" : "")) + "."]);
    if (o) rows.push(["Units", o.units + " (" + R1Cmhc.unitMix(o) + ")"]);
    notes.push(NOTES.outdoor, NOTES.parking);
    if (acc.length) notes.push(NOTES.projections);
    if (stallNote) notes.push(stallNote);
    var legend = '<span class="lg"><i style="background:#dbe9d0;border:1px solid #8fae7e"></i>shared outdoor space</span>' + (patios.length ? '<span class="lg"><i style="background:#e9c46a;opacity:.5"></i>private patio</span>' : "") +
      '<span class="lg"><i style="background:#dedfd9;border:1px solid #b8bab3"></i>path</span>' + (stalls.length ? '<span class="lg"><i style="background:#e2e3df;border:1px solid ' + INK + '"></i>car-share stall</span>' : "") +
      (acc.length ? '<span class="lg"><i style="background:#f1f2ef;border:1px solid ' + INK + '"></i>exit stair</span><span class="lg"><i style="background:none;border:1px dashed ' + INK + '"></i>walkway over</span>' : "") +
      '<span class="lg"><i style="background:none;border-bottom:2px dashed ' + SETBACK + '"></i>yard line</span><span class="lg"><i style="background:' + RED + '"></i>entry</span>';
    return { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.round(W) + '" height="' + Math.round(H) + '" viewBox="0 0 ' + Math.round(W) + " " + Math.round(H) + '" role="img" aria-label="Site plan" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">' + parts.join("") + "</svg>",
      width: Math.round(W), height: Math.round(H), rows: rows, notes: notes, legend: legend, mirror: F.mirror, shared_m2: sharedArea, stalls: stalls.length, patios: patios.length };
  }
  return { sheet: sheet, frame: frame, STALL: STALL, PATIO_D: PATIO_D, NOTES: NOTES };
})();
