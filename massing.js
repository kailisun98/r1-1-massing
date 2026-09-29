/* massing.js -- workflow logic for the web app: a port of lib/r1_1_massing.py.
   Parcel choice, the site square and clipping, street-edge detection, ground, roads, the
   dimension strings, the form options (FORM_RULES), the section plan and the panel tables.
   Metres throughout; no drawing here. */
var R1Massing = (function () {
  "use strict";
  var core = R1Core, site = R1Site;

  var APP_ID = "ARCH540.R1-1.Massing";
  var NEIGHBOUR_PROBE_M = 0.5, PROBE_STEP_M = 0.5, PROBE_MAX_M = 60.0, STREET_MIN_GAP_M = 8.0, FRONT_TO_REAR_RATIO = 1.5;

  function fmt(x, d) { return Number(x).toFixed(d); }

  // ------------------------------------------------------------------ site selection
  function parcelLabel(p, centre) {
    centre = centre || [0, 0];
    var wd = site.approxDims(p.ring);
    return (p.civic || "?") + " " + (p.street || "?") + "   " + fmt(wd[0], 1) + " x " + fmt(wd[1], 1) + " m   " + Math.round(site.dist(p.centroid, centre)) + " m from centre";
  }
  function parcelChoices(res) {
    return res.parcels.slice().sort(function (a, b) { return site.dist(a.centroid, [0, 0]) - site.dist(b.centroid, [0, 0]); })
      .map(function (p) { return { label: parcelLabel(p), parcel: p }; });
  }
  function siteLines(parcel) {
    var wd = site.approxDims(parcel.ring), area = Math.abs(site.signedArea(parcel.ring));
    return ["SITE SELECTED: " + parcel.civic + " " + parcel.street + "  (site_id " + parcel.site_id + ", tax_coord " + parcel.tax_coord + ")",
      "  " + parcel.ring.length + " vertices, about " + fmt(wd[0], 2) + " x " + fmt(wd[1], 2) + " m, " + fmt(area, 1) + " m2  (assessment parcel, not a legal survey)"];
  }

  // ------------------------------------------------------------------ the site square
  var CUT_SIDES_M = [100, 150, 200, 300], CUT_DEFAULT_SIDE_M = 200, CUT_FETCH_MARGIN_M = 20, CUT_EDGE_STEP_M = 4.0, CUT_EDGE_INSET_M = 0.3;
  function fetchRadiusFor(side) { return side / 2 * Math.SQRT2 + CUT_FETCH_MARGIN_M; }
  function siteSquare(parcel, side, centre) {
    side = side || CUT_DEFAULT_SIDE_M;
    var ring = parcel ? parcel.ring : null;
    centre = centre || (parcel ? parcel.centroid : [0, 0]);
    var ux = 1, uy = 0;
    if (ring && ring.length >= 3) {
      var best = null;
      for (var i = 0; i < ring.length; i++) {
        var a = ring[i], b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (best === null || L > best[0]) best = [L, a, b];
      }
      ux = (best[2][0] - best[1][0]) / best[0]; uy = (best[2][1] - best[1][1]) / best[0];
      if (Math.abs(uy) > Math.abs(ux)) { var t = ux; ux = uy; uy = -t; }
      if (ux < 0) { ux = -ux; uy = -uy; }
    }
    return { c: [centre[0], centre[1]], u: [ux, uy], v: [-uy, ux], half: side / 2, side: side, angle_deg: Math.atan2(uy, ux) * 180 / Math.PI };
  }
  function toUV(sq, p) { var dx = p[0] - sq.c[0], dy = p[1] - sq.c[1]; return [dx * sq.u[0] + dy * sq.u[1], dx * sq.v[0] + dy * sq.v[1]]; }
  function fromUV(sq, uv) { return [sq.c[0] + sq.u[0] * uv[0] + sq.v[0] * uv[1], sq.c[1] + sq.u[1] * uv[0] + sq.v[1] * uv[1]]; }
  function squareRing(sq) { var h = sq.half; return [[-h, -h], [h, -h], [h, h], [-h, h]].map(function (uv) { return fromUV(sq, uv); }); }
  function inSquare(sq, p, margin) { var uv = toUV(sq, p), h = sq.half + (margin || 0); return -h <= uv[0] && uv[0] <= h && -h <= uv[1] && uv[1] <= h; }
  function crossAt(a, b, axis, sign, h) {
    var da = sign * a[axis] - h, db = sign * b[axis] - h, t = Math.abs(da - db) > 1e-12 ? da / (da - db) : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  function clipHalf(poly, axis, sign, h) {
    var out = [], n = poly.length;
    for (var i = 0; i < n; i++) {
      var cur = poly[i], prev = poly[(i - 1 + n) % n];
      var ci = sign * cur[axis] <= h + 1e-9, pi = sign * prev[axis] <= h + 1e-9;
      if (ci) { if (!pi) out.push(crossAt(prev, cur, axis, sign, h)); out.push(cur); }
      else if (pi) out.push(crossAt(prev, cur, axis, sign, h));
    }
    return out;
  }
  function clipRing(ring, sq) {
    var poly = ring.map(function (p) { return toUV(sq, p); }), h = sq.half;
    for (var axis = 0; axis < 2; axis++) for (var s = 0; s < 2; s++) {
      poly = clipHalf(poly, axis, s === 0 ? 1 : -1, h);
      if (poly.length < 3) return [];
    }
    var cleaned = [];
    poly.forEach(function (p) { if (!cleaned.length || Math.hypot(p[0] - cleaned[cleaned.length - 1][0], p[1] - cleaned[cleaned.length - 1][1]) > 1e-6) cleaned.push(p); });
    while (cleaned.length > 1 && Math.hypot(cleaned[0][0] - cleaned[cleaned.length - 1][0], cleaned[0][1] - cleaned[cleaned.length - 1][1]) <= 1e-6) cleaned.pop();
    if (cleaned.length < 3) return [];
    return cleaned.map(function (p) { return fromUV(sq, p); });
  }
  function clipSegment(a, b, h) {
    var t0 = 0, t1 = 1, dx = b[0] - a[0], dy = b[1] - a[1];
    var tests = [[-dx, a[0] + h], [dx, h - a[0]], [-dy, a[1] + h], [dy, h - a[1]]];
    for (var i = 0; i < 4; i++) {
      var p = tests[i][0], q = tests[i][1];
      if (Math.abs(p) < 1e-12) { if (q < 0) return null; continue; }
      var t = q / p;
      if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
      else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
    if (t1 - t0 < 1e-9) return null;
    return [[a[0] + dx * t0, a[1] + dy * t0], [a[0] + dx * t1, a[1] + dy * t1]];
  }
  function clipPolyline(pts, sq, closed) {
    var h = sq.half, uv = pts.map(function (p) { return toUV(sq, p); });
    if (closed && uv.length > 1) uv = uv.concat([uv[0]]);
    var pieces = [], cur = [];
    for (var i = 0; i < uv.length - 1; i++) {
      var seg = clipSegment(uv[i], uv[i + 1], h);
      if (seg === null) { if (cur.length >= 2) pieces.push(cur); cur = []; continue; }
      if (cur.length && Math.hypot(seg[0][0] - cur[cur.length - 1][0], seg[0][1] - cur[cur.length - 1][1]) < 1e-6) cur.push(seg[1]);
      else { if (cur.length >= 2) pieces.push(cur); cur = [seg[0], seg[1]]; }
    }
    if (cur.length >= 2) pieces.push(cur);
    return pieces.map(function (pc) { return pc.map(function (p) { return fromUV(sq, p); }); });
  }
  function cutLines(sq) {
    return ["SITE CUT: " + sq.side + " x " + sq.side + " m square centred on the site parcel, turned " + (sq.angle_deg >= 0 ? "+" : "") + fmt(sq.angle_deg, 1) +
      " deg to run parallel with the lot lines; topography, parcels, buildings, roads and contours are clipped to it."];
  }

  // ------------------------------------------------------------------ street edge detection
  function compass(dx, dy) {
    var ang = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.floor((ang + 22.5) / 45) % 8];
  }
  function edges(ring) {
    var ccw = site.signedArea(ring) > 0, out = [], n = ring.length;
    for (var i = 0; i < n; i++) {
      var a = ring[i], b = ring[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      if (L < 1e-9) continue;
      var ux = dx / L, uy = dy / L, nx = ccw ? uy : -uy, ny = ccw ? -ux : ux;
      out.push({ i: i, a: a, b: b, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], len: L, out: [nx, ny], facing: compass(nx, ny) });
    }
    return out;
  }
  function inAny(p, rings) { for (var i = 0; i < rings.length; i++) if (site.pointInRing(p, rings[i])) return true; return false; }

  function detectFrontage(ring, parcels, radiusM, exclude) {
    var others = [];
    parcels.forEach(function (p) { if (p === exclude) return; var r = p.ring; if (!r || r === ring || r.length < 3) return; others.push(r); });
    var E = edges(ring);
    E.forEach(function (e) {
      var mx = e.mid[0], my = e.mid[1], nx = e.out[0], ny = e.out[1];
      e.gap_m = null; e.beyond_data = false;
      if (inAny([mx + nx * NEIGHBOUR_PROBE_M, my + ny * NEIGHBOUR_PROBE_M], others)) { e.kind = "neighbour"; e.gap_m = 0; return; }
      e.kind = "open";
      for (var s = PROBE_STEP_M; s <= PROBE_MAX_M + 1e-9; s += PROBE_STEP_M) {
        var p = [mx + nx * s, my + ny * s];
        if (radiusM !== null && radiusM !== undefined && Math.hypot(p[0], p[1]) > radiusM) { e.beyond_data = true; break; }
        if (inAny(p, others)) { e.gap_m = s; break; }
      }
    });
    var res = { edges: E, front: null, rear: null, click: null, confidence: "none", notes: [] };
    var open = E.filter(function (e) { return e.kind === "open"; }), known = open.filter(function (e) { return e.gap_m !== null; });
    open.forEach(function (e) {
      if (e.beyond_data) res.notes.push("Edge facing " + e.facing + ": probe left the fetched radius before finding a parcel; a larger import radius would settle it.");
      else if (e.gap_m === null) res.notes.push("Edge facing " + e.facing + ": no parcel within " + PROBE_MAX_M + " m (water, or data missing).");
    });
    if (!open.length) { res.notes.push("Every edge has a parcel directly across it; no right-of-way found. Click the street edge."); return res; }
    if (!known.length) { res.notes.push("Open edges found but none with a measurable gap. Click the street edge."); return res; }
    var ranked = known.slice().sort(function (a, b) { return b.gap_m - a.gap_m; });
    var streets = known.filter(function (e) { return e.gap_m >= STREET_MIN_GAP_M; });
    var front;
    if (!streets.length) {
      front = ranked[0];
      res.notes.push("Widest open edge (" + fmt(front.gap_m, 1) + " m gap, facing " + front.facing + ") is narrower than a street (" + STREET_MIN_GAP_M + " m). Click the street edge.");
      return res;
    }
    if (streets.length >= 2) {
      front = streets.reduce(function (a, b) { return b.len < a.len ? b : a; });
      res.notes.push(streets.length + " street-width gaps: CORNER site. The shorter street edge (facing " + front.facing + ", " + fmt(front.len, 2) + " m) is taken as the front; corner sites are out of this tool's scope (3.1.2.12). Confirm the street edge.");
    } else front = streets[0];
    res.front = front; res.click = front.mid;
    var nOpen = open.length;
    if (streets.length >= 2) {
      res.confidence = "low";
      if (E.length === 4) { var opp = E[(E.indexOf(front) + 2) % 4]; if (opp.kind === "open") res.rear = opp; }
    } else if (nOpen === 2) {
      var rear = open.filter(function (e) { return e !== front; })[0];
      res.rear = rear;
      if (rear.gap_m === null) { res.confidence = "low"; res.notes.push("Rear gap unknown; front chosen as the only measurable open edge."); }
      else if (front.gap_m > FRONT_TO_REAR_RATIO * Math.max(rear.gap_m, PROBE_STEP_M)) res.confidence = "high";
      else { res.confidence = "low"; res.notes.push("Front (" + fmt(front.gap_m, 1) + " m) and rear (" + fmt(rear.gap_m, 1) + " m) gaps are similar; confirm which is the street."); }
    } else if (nOpen === 1) {
      res.confidence = "low";
      res.notes.push("Only one open edge: no lane detected behind the site. Multiplex needs rear vehicular access (2.2.7(b)); check the site.");
    } else {
      res.confidence = "low";
      res.notes.push(nOpen + " open edges: possibly a CORNER site (3.1.2.12 relaxation; corner sites are out of this tool's scope) or parcel data missing on one side. Confirm the street edge.");
      if (E.length === 4) { var opp2 = E[(E.indexOf(front) + 2) % 4]; if (opp2.kind === "open") res.rear = opp2; }
    }
    return res;
  }
  function frontageLines(det) {
    var L = ["STREET EDGE (probed outward from each edge through the fetched parcels):"];
    det.edges.forEach(function (e) {
      var what = e.kind === "neighbour" ? "neighbouring parcel across the line (side)" : e.gap_m !== null ? "open, " + fmt(e.gap_m, 1) + " m to the next parcel" :
        e.beyond_data ? "open, beyond the fetched radius" : "open, nothing within " + PROBE_MAX_M + " m";
      L.push("  edge " + e.i + " (" + fmt(e.len, 2) + " m) faces " + e.facing + ": " + what);
    });
    if (det.front) {
      var line = "  -> FRONT = edge facing " + det.front.facing + " (" + det.confidence + " confidence)";
      if (det.rear && det.rear.gap_m !== null) line += "; REAR = edge facing " + det.rear.facing + " (" + fmt(det.rear.gap_m, 1) + " m gap = lane)";
      L.push(line);
    } else L.push("  -> no street edge detected");
    det.notes.forEach(function (n) { L.push("  note: " + n); });
    return L;
  }

  // ------------------------------------------------------------------ ground
  /* Ground model. The elevation points are sparse and banded (every point of a 1 m contour has the same z, plus
     the 2009 building bases), so averaging the nearest few gives terraces and bumps. groundAt fits a plane
     z = a + b dx + c dy through the points around (x, y), Gaussian-weighted, and returns a: the slope between
     contours is followed instead of stepped. The neighbourhood grows (16, 40, 80 m) until the points spread in
     two directions (a single contour line is collinear and cannot fix a plane); if nothing is in reach the five
     nearest points are averaged by inverse distance as before. A spatial hash cached on the array keeps it fast. */
  var GROUND_SCALES = [[16, 6], [40, 15], [80, 30]], GROUND_CELL_M = 8.0, GROUND_MIN_SPREAD_M = 1.5, GROUND_CLAMP_M = 1.0;
  function groundIndex(topo) {
    if (topo._index && topo._index.n === topo.length) return topo._index;
    var cells = {};
    topo.forEach(function (p, i) { var k = Math.floor(p[0] / GROUND_CELL_M) + "," + Math.floor(p[1] / GROUND_CELL_M); (cells[k] || (cells[k] = [])).push(i); });
    topo._index = { n: topo.length, cells: cells };
    return topo._index;
  }
  function groundNear(topo, x, y, r) {
    var idx = groundIndex(topo), out = [], c = Math.ceil(r / GROUND_CELL_M), cx = Math.floor(x / GROUND_CELL_M), cy = Math.floor(y / GROUND_CELL_M);
    for (var i = -c; i <= c; i++) for (var j = -c; j <= c; j++) {
      var b = idx.cells[(cx + i) + "," + (cy + j)];
      if (b) for (var k = 0; k < b.length; k++) { var p = topo[b[k]]; if (Math.hypot(p[0] - x, p[1] - y) <= r) out.push(p); }
    }
    return out;
  }
  function groundFit(pts, x, y, sigma) {
    var s2 = 2 * sigma * sigma, sw = 0, sx = 0, sy = 0, sz = 0, sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0, zmin = Infinity, zmax = -Infinity;
    pts.forEach(function (p) {
      var dx = p[0] - x, dy = p[1] - y, w = Math.exp(-(dx * dx + dy * dy) / s2);
      sw += w; sx += w * dx; sy += w * dy; sz += w * p[2]; sxx += w * dx * dx; sxy += w * dx * dy; syy += w * dy * dy; sxz += w * dx * p[2]; syz += w * dy * p[2];
      if (p[2] < zmin) zmin = p[2]; if (p[2] > zmax) zmax = p[2];
    });
    if (sw <= 0) return null;
    var mx = sx / sw, my = sy / sw, cxx = sxx / sw - mx * mx, cxy = sxy / sw - mx * my, cyy = syy / sw - my * my;
    var tr = cxx + cyy, dt = cxx * cyy - cxy * cxy, lmin = tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - dt));
    if (pts.length < 4 || Math.sqrt(Math.max(lmin, 0)) < GROUND_MIN_SPREAD_M) return { z: sz / sw, planar: false };
    var det = sw * (sxx * syy - sxy * sxy) - sx * (sx * syy - sxy * sy) + sy * (sx * sxy - sxx * sy);
    if (Math.abs(det) < 1e-9) return { z: sz / sw, planar: false };
    var a = (sz * (sxx * syy - sxy * sxy) - sx * (sxz * syy - sxy * syz) + sy * (sxz * sxy - sxx * syz)) / det;
    return { z: Math.min(zmax + GROUND_CLAMP_M, Math.max(zmin - GROUND_CLAMP_M, a)), planar: true };
  }
  function groundAt(topo, x, y) {
    if (!topo || !topo.length) return null;
    var first = null;
    for (var s = 0; s < GROUND_SCALES.length; s++) {
      var pts = groundNear(topo, x, y, GROUND_SCALES[s][0]);
      if (!pts.length) continue;
      var fit = groundFit(pts, x, y, GROUND_SCALES[s][1]);
      if (fit && fit.planar) return fit.z;
      if (fit && first === null) first = fit.z;
    }
    if (first !== null) return first;
    var near = topo.slice().sort(function (a, b) { return Math.hypot(a[0] - x, a[1] - y) - Math.hypot(b[0] - x, b[1] - y); }).slice(0, 5), ws = 0, zs = 0;
    near.forEach(function (p) { var w = 1 / Math.max(Math.hypot(p[0] - x, p[1] - y), 0.5); ws += w; zs += w * p[2]; });
    return zs / ws;
  }
  function envelopeBase(res, envPts) {
    if (!res || !res.topo_points || !res.topo_points.length) return null;
    var zs = envPts.map(function (p) { return site.localZ(res, groundAt(res.topo_points, p[0], p[1])); });
    var mean = zs.reduce(function (a, b) { return a + b; }, 0) / zs.length;
    return { corner_z: zs, mean: mean, min: Math.min.apply(null, zs), max: Math.max.apply(null, zs), range: Math.max.apply(null, zs) - Math.min.apply(null, zs) };
  }
  function groundLines(base) {
    if (!base) return ["GROUND: no imported topography; envelope base at the boundary's elevation."];
    return ["GROUND UNDER ENVELOPE (imported topography, about +/-0.5 m):",
      "  corners " + base.corner_z.map(function (z) { return (z >= 0 ? "+" : "") + fmt(z, 2); }).join(", ") + "  ->  mean " + (base.mean >= 0 ? "+" : "") + fmt(base.mean, 2) + " m, range " + fmt(base.range, 2) + " m",
      "  Envelope base placed at the mean. The 11.5 m height is measured from that mean existing grade here;",
      "  the by-law's own height datum is not modelled -- confirm on a survey."];
  }
  function groundZ(res, x, y) { if (!res || !res.topo_points || !res.topo_points.length) return 0; return site.localZ(res, groundAt(res.topo_points, x, y)); }

  // ------------------------------------------------------------------ zoning
  var ZONING_DATASET = "zoning-districts-and-labels", R1_1_PREFIX = "R1-1";
  function zoningAt(lat, lon) {
    return site.getJSON(site.exportUrl(ZONING_DATASET, site.within(lon, lat, 1))).then(function (json) {
      var feats = site.features(json);
      if (!feats.length) return null;
      var pr = feats[0].properties || {};
      return { district: pr.zoning_district, category: pr.zoning_category, classification: pr.zoning_classification, dataset: ZONING_DATASET };
    });
  }
  function zoningLines(zone) {
    if (!zone) return ["ZONING: could not be determined from " + ZONING_DATASET + "; confirm the site is in R1-1 before relying on this."];
    var d = zone.district || "?";
    if (d.indexOf(R1_1_PREFIX) === 0) return ["ZONING: " + d + " (" + zone.category + ", " + zone.classification + ") per " + zone.dataset + " -- the R1-1 schedule applies."];
    return ["ZONING WARNING: this site is in " + d + " (" + zone.category + ", " + zone.classification + ") per " + zone.dataset + ", NOT R1-1.",
      "  The R1-1 schedule applied below does not govern this site; its numbers are for comparison only."];
  }
  function envelopeComment(parcel, base, zone) {
    var parts = [];
    if (parcel) parts.push("site " + parcel.civic + " " + parcel.street + " (site_id " + parcel.site_id + ", " + site.DATASETS.parcels.id + ")");
    if (zone) { var d = zone.district || "?"; parts.push("zoning " + d + (d.indexOf(R1_1_PREFIX) === 0 ? "" : " - NOT R1-1") + " (" + ZONING_DATASET + ")"); }
    if (base) parts.push("base Z " + (base.mean >= 0 ? "+" : "") + fmt(base.mean, 2) + " m = mean ground at footprint corners (imported topography)");
    return parts.join("; ");
  }

  // ------------------------------------------------------------------ roads
  var ROAD_DATASETS = { street: { id: "public-streets", note: "Public street centrelines (hblock = hundred block + street, streetuse)." },
    lane: { id: "lanes", note: "Lane centrelines (std_street = the street the lane serves, from_hundred_block)." } };
  var ROAD_HALF_DEFAULT_M = { street: 10.0, lane: 3.0 }, ROAD_HALF_MAX_M = { street: 20.0, lane: 6.0 }, ROAD_PROBE_STEP_M = 0.5, ROAD_NAME_MIN_LEN_M = 25.0;
  function probeSide(p, n, rings, maxM) {
    var hit = null;
    for (var s = ROAD_PROBE_STEP_M; s <= maxM + 1e-9; s += ROAD_PROBE_STEP_M) if (inAny([p[0] + n[0] * s, p[1] + n[1] * s], rings)) { hit = s; break; }
    if (hit === null) return null;
    var lo = hit - ROAD_PROBE_STEP_M, hi = hit;
    for (var i = 0; i < 5; i++) { var m = (lo + hi) / 2; if (inAny([p[0] + n[0] * m, p[1] + n[1] * m], rings)) hi = m; else lo = m; }
    return hi;
  }
  function roadPieces(pts, rings, kind) {
    var pieces = [];
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      if (L < 0.5) continue;
      var d = [dx / L, dy / L], n = [-d[1], d[0]], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      var left = probeSide(m, n, rings, ROAD_HALF_MAX_M[kind]), right = probeSide(m, [-n[0], -n[1]], rings, ROAD_HALF_MAX_M[kind]);
      if (left === null && right === null) left = right = ROAD_HALF_DEFAULT_M[kind];
      else if (left === null) left = right; else if (right === null) right = left;
      var quad = [[a[0] + n[0] * left, a[1] + n[1] * left], [b[0] + n[0] * left, b[1] + n[1] * left], [b[0] - n[0] * right, b[1] - n[1] * right], [a[0] - n[0] * right, a[1] - n[1] * right]];
      pieces.push({ a: a, b: b, d: d, n: n, len: L, left: left, right: right, width: left + right, quad: quad });
    }
    return pieces;
  }
  function fetchRoads(res, extraM) {
    extraM = extraM === undefined ? 30 : extraM;
    var lat = res.centre[0], lon = res.centre[1], frame = res.frame, r = res.radius_m + extraM;
    var rings = res.parcels.filter(function (p) { return p.ring && p.ring.length >= 3; }).map(function (p) { return p.ring; });
    var out = { segments: [], provenance: [] };
    return Promise.all(["street", "lane"].map(function (kind) {
      return site.getJSON(site.exportUrl(ROAD_DATASETS[kind].id, site.within(lon, lat, r))).then(function (json) {
        site.features(json).forEach(function (f) {
          var pr = f.properties || {}, name, use;
          if (kind === "street") { name = pr.hblock || "street"; use = pr.streetuse || ""; }
          else { name = ("lane, " + (pr.from_hundred_block || "") + " " + (pr.std_street || "")).trim(); use = "Lane"; }
          site.rings(f.geometry).forEach(function (line) {
            var pts = line.map(function (c) { return frame.toXY(c[0], c[1]); });
            if (pts.length < 2) return;
            out.segments.push({ kind: kind, name: name, use: use, pts: pts, pieces: roadPieces(pts, rings, kind) });
          });
        });
        out.provenance.push(kind + "s: " + ROAD_DATASETS[kind].id + ". " + ROAD_DATASETS[kind].note + " Right-of-way widths measured to the parcels.");
      });
    })).then(function () { return out; });
  }
  function roadNameNear(roads, p, maxM) {
    maxM = maxM || 15;
    var best = null;
    ((roads && roads.segments) || []).forEach(function (seg) {
      seg.pieces.forEach(function (pc) { var d = site.pointToSegment(p, pc.a, pc.b); if (d <= maxM && (best === null || d < best[0])) best = [d, seg]; });
    });
    return best ? best[1] : null;
  }
  function roadsLines(roads) {
    if (!roads || !roads.segments.length) return ["ROADS: none fetched."];
    var streets = roads.segments.filter(function (s) { return s.kind === "street"; }), lanes = roads.segments.filter(function (s) { return s.kind === "lane"; });
    var L = ["ROADS: " + streets.length + " street segments, " + lanes.length + " lane segments (right-of-way widths measured to the parcels):"];
    var names = {};
    streets.forEach(function (s) { var w = s.pieces.map(function (pc) { return pc.width; }); if (w.length) { var k = s.name + " (" + s.use + ")"; names[k] = (names[k] || []).concat(w); } });
    Object.keys(names).sort().forEach(function (k) { var ws = names[k]; L.push("  " + k + ": " + fmt(ws.reduce(function (a, b) { return a + b; }, 0) / ws.length, 1) + " m wide"); });
    var lw = []; lanes.forEach(function (s) { s.pieces.forEach(function (pc) { lw.push(pc.width); }); });
    if (lw.length) L.push("  lanes: " + fmt(lw.reduce(function (a, b) { return a + b; }, 0) / lw.length, 1) + " m wide on average");
    return L;
  }

  // ------------------------------------------------------------------ setbacks, envelope edges, edge choices
  function edgeChoices(ring, det, roads) {
    var E = det ? det.edges : edges(ring);
    return E.map(function (e) {
      var what = "";
      if (det && e.kind) {
        if (e.kind === "neighbour") what = "   neighbouring parcel (side)";
        else if (e.gap_m !== null) {
          what = "   open, " + fmt(e.gap_m, 1) + " m gap (" + (e.gap_m >= STREET_MIN_GAP_M ? "street" : "lane") + ")";
          if (roads) { var seg = roadNameNear(roads, [e.mid[0] + e.out[0] * e.gap_m / 2, e.mid[1] + e.out[1] * e.gap_m / 2]); if (seg) what += "   " + seg.name; }
        } else if (e.beyond_data) what = "   open, beyond the fetched radius";
        else what = "   open, nothing within " + PROBE_MAX_M + " m";
      }
      return { label: "Edge " + e.i + "   faces " + e.facing + "   " + fmt(e.len, 2) + " m" + what, edge: e };
    });
  }
  function setbackSegments(ev) {
    var E = ev.edges, n = E.length, sb = ev.setbacks, idx = ev.idx, kinds = {};
    kinds[idx.front] = "FRONT"; kinds[idx.rear] = "REAR"; kinds[idx.side1] = "SIDE"; kinds[idx.side2] = "SIDE";
    var segs = [];
    for (var i = 0; i < n; i++) {
      var e = E[i], s = sb[i], p = [e.a[0] + e.n[0] * s, e.a[1] + e.n[1] * s];
      var prev = E[(i - 1 + n) % n], next = E[(i + 1) % n];
      var a = core.intersect(p, e.d, prev.a, prev.d), b = core.intersect(p, e.d, next.a, next.d);
      if (!a || !b) continue;
      segs.push({ edge: i, kind: kinds[i], value_m: s, a: a, b: b });
    }
    return segs;
  }
  function envelopeEdges(ev) {
    var pts = ev.env_pts, n = pts.length, out = {};
    for (var i = 0; i < n; i++) out[i] = [pts[(i - 1 + n) % n], pts[i]];
    return out;
  }

  // ------------------------------------------------------------------ dimension strings
  var DIM_OFFSET_PAPER_M = 0.012, DIM_OFFSET_MIN_M = 1.0;
  function dimOffsetM(scale) { return Math.max(DIM_OFFSET_MIN_M, scale * DIM_OFFSET_PAPER_M); }
  function anchor(ev, i, off) { var e = ev.edges[i], m = core.mid(e.a, e.b); return [m[0] - e.n[0] * off, m[1] - e.n[1] * off]; }
  function seg(p, d) { return [[p[0] - d[0], p[1] - d[1]], [p[0] + d[0], p[1] + d[1]]]; }
  function envelopeDimensionPlan(ev, off) {
    if (!ev || ev.status !== "ok") return [];
    var idx = ev.idx, E = ev.edges, pts = ev.env_pts, f = idx.front, r = idx.rear, s1 = idx.side1, s2 = idx.side2;
    var q2 = anchor(ev, s2, off), qf = anchor(ev, f, off);
    return [
      { name: "FRONT YARD", string: "depth", refs: [["boundary", f], ["setback", f]], line: seg(q2, E[f].n) },
      { name: "ENVELOPE DEPTH", string: "depth", refs: [["outline_pt", pts[s2]], ["outline_pt", pts[r]]], line: seg(q2, E[f].n) },
      { name: "REAR YARD", string: "depth", refs: [["setback", r], ["boundary", r]], line: seg(q2, E[r].n) },
      { name: "SIDE YARD", string: "width", refs: [["boundary", s1], ["setback", s1]], line: seg(qf, E[s1].n) },
      { name: "ENVELOPE WIDTH", string: "width", refs: [["outline_pt", pts[s2]], ["outline_pt", pts[f]]], line: seg(qf, E[f].d) },
      { name: "SIDE YARD", string: "width", refs: [["setback", s2], ["boundary", s2]], line: seg(qf, E[s2].n) }
    ];
  }
  function formDimensionPlan(ev, form, off) {
    if (!ev || ev.status !== "ok" || !form || form.status !== "ok") return [];
    var idx = ev.idx, E = ev.edges, f = idx.front, r = idx.rear, s1 = idx.side1, by = {}, like = form.dims_like || form.scheme;
    form.buildings.forEach(function (b) { by[b.key] = b; });
    if (like === "single" && by.single) {   // one catalogue block inside the envelope: its depth beside side 1, its width behind the rear yard
      var qs = anchor(ev, s1, off), qr0 = anchor(ev, r, off), sp = by.single.pts;
      return [
        { name: "BUILDING DEPTH", string: "form depth", refs: [["form", "single", 3], ["form", "single", 1]], line: seg(qs, E[f].n) },
        { name: "BUILDING WIDTH", string: "form width", refs: [["form_pt", "single", sp[1]], ["form_pt", "single", sp[2]]], line: seg(qr0, E[f].d) }
      ];
    }
    if (like === "courtyard") {
      var q1 = anchor(ev, s1, off), fb = by.front.pts, rb = by.rear.pts;
      return [
        { name: "FRONT BUILDING", string: "form depth", refs: [["form", "front", 3], ["form", "front", 1]], line: seg(q1, E[f].n) },
        { name: "COURTYARD", string: "form depth", refs: [["form_pt", "front", fb[1]], ["form_pt", "rear", rb[0]]], line: seg(q1, E[f].n) },
        { name: "REAR BUILDING", string: "form depth", refs: [["form", "rear", 3], ["form", "rear", 1]], line: seg(q1, E[r].n) },
        { name: "REAR YARD (courtyard)", string: "form depth", refs: [["form", "rear", 1], ["boundary", r]], line: seg(q1, E[r].n) }
      ];
    }
    if (like === "side_by_side") {
      var qr = anchor(ev, r, off), A = by.A.pts, B = by.B.pts;
      return [
        { name: "BUILDING A", string: "form width", refs: [["form_pt", "A", A[1]], ["form_pt", "A", A[2]]], line: seg(qr, E[f].d) },
        { name: "GAP", string: "form width", refs: [["form_pt", "A", A[2]], ["form_pt", "B", B[1]]], line: seg(qr, E[f].d) },
        { name: "BUILDING B", string: "form width", refs: [["form_pt", "B", B[1]], ["form_pt", "B", B[2]]], line: seg(qr, E[f].d) }
      ];
    }
    return [];
  }

  // ------------------------------------------------------------------ form options
  var FORM_RULES = {
    source: { document: "R1-1 District Schedule (June 2026 consolidation), s.3.1.2 table and s.2.2.9",
      checked: "transcribed from source/r1-1_extract.md on 2026-09-24 and cross-checked against three secondary summaries",
      note: "Re-verify if the schedule is amended; more than one principal building is at the Director of Planning's discretion (2.2.9)." },
    courtyard_min_site_depth_m: { value: 33.5, clause: "3.1.2.4(a) (buildings in a courtyard configuration)" },
    courtyard_rear_yard_m: { value: 0.9, clause: "3.1.2.8(a) (buildings in a courtyard configuration)" },
    courtyard_separation_m: { value: 6.1, clause: "3.1.2.11(c) (buildings located on a site frontage and rear buildings)" },
    side_separation_m: { value: 2.4, clause: "3.1.2.11(a) (buildings located on a site frontage; (b) rear buildings, also 2.4 m)" },
    rear_building_height_m: { value: 8.5, storeys: 2, clause: "3.1.2.5(a) (rear buildings)" },
    multiple_buildings: { value: "Director of Planning approval", clause: "2.2.9" },
    fsr_max: { value: 1.0, clause: "3.1.1.2" }
  };
  var SCHEMES = [
    { key: "single", name: "Single building", desc: "One building in the permitted envelope: front 4.9 m, sides 1.2 m, rear 10.7 m; 11.5 m / 3 storeys." },
    { key: "courtyard", name: "Courtyard: front + rear building", desc: "A front building from the front yard line and a rear building 0.9 m off the lane (8.5 m / 2 storeys), with a courtyard of at least 6.1 m between them. Needs a site at least 33.5 m deep." },
    { key: "side_by_side", name: "Side by side: two buildings", desc: "Two buildings across the frontage, 2.4 m apart, each within the single-building envelope (11.5 m / 3 storeys)." }
  ];
  var REAR_DEPTHS_M = [6.0, 7.5, 9.0, 10.5, 12.0], REAR_DEPTH_DEFAULT_M = 7.5, COURTYARDS_M = [6.1, 7.5, 9.0, 12.0], MIN_BUILDING_DEPTH_M = 6.0, MIN_BUILDING_WIDTH_M = 4.5;
  function schemeName(key) { var s = SCHEMES.filter(function (x) { return x.key === key; })[0]; return s ? s.name : key; }
  function lineOf(sg) { var p = sg[0], q = sg[1], L = Math.hypot(q[0] - p[0], q[1] - p[1]); return [p, [(q[0] - p[0]) / L, (q[1] - p[1]) / L]]; }
  function offsetLine(e, d) { return [[e.a[0] + e.n[0] * d, e.a[1] + e.n[1] * d], e.d]; }
  function quad(lines) {
    var pts = [];
    for (var i = 0; i < 4; i++) { var p = core.intersect(lines[i][0], lines[i][1], lines[(i + 1) % 4][0], lines[(i + 1) % 4][1]); if (!p) return null; pts.push(p); }
    return pts;
  }
  function distToLine(p, line) { var q = line[0], d = line[1]; return Math.abs((p[0] - q[0]) * d[1] - (p[1] - q[1]) * d[0]); }
  function quadDims(pts, ef) {
    var d = ef.d, n = ef.n;
    var us = pts.map(function (p) { return (p[0] - pts[0][0]) * d[0] + (p[1] - pts[0][1]) * d[1]; });
    var vs = pts.map(function (p) { return (p[0] - pts[0][0]) * n[0] + (p[1] - pts[0][1]) * n[1]; });
    return [Math.max.apply(null, us) - Math.min.apply(null, us), Math.max.apply(null, vs) - Math.min.apply(null, vs)];
  }
  function building(key, name, pts, h, storeys, clause, ef) {
    var wd = quadDims(pts, ef);
    return { key: key, name: name, pts: pts, height_m: h, storeys: storeys, clause: clause, width_m: wd[0], depth_m: wd[1], footprint_m2: core.polygonArea(pts), centroid: site.centroid(pts) };
  }
  function formScheme(ev, scheme, courtyardM, rearDepthM) {
    var FR = FORM_RULES, R = core.RULES;
    courtyardM = courtyardM || FR.courtyard_separation_m.value; rearDepthM = rearDepthM || REAR_DEPTH_DEFAULT_M;
    var out = { scheme: scheme, name: schemeName(scheme), status: null, reason: null, buildings: [], gaps: [], labels: [], notes: [], params: { courtyard_m: courtyardM, rear_depth_m: rearDepthM } };
    if (!ev || ev.status !== "ok") { out.status = "no_envelope"; out.reason = "Generate the permitted envelope first."; return out; }
    var idx = ev.idx, E = ev.edges, f = idx.front, r = idx.rear, s1 = idx.side1, s2 = idx.side2;
    var fy = R.front_yard_m.value, sy = R.side_yard_m.value, maxD = R.max_depth_m.value, hm = R.max_height_m, mainClause = hm.clause.split(" ")[0];
    var L_f = offsetLine(E[f], fy), L_s1 = offsetLine(E[s1], sy), L_s2 = offsetLine(E[s2], sy);
    if (scheme === "single") {
      out.status = "single";
      out.buildings.push(building("single", "Single building", ev.env_pts, hm.value, hm.storeys, mainClause, E[f]));
      out.reason = "The permitted envelope is the single-building form; nothing extra is drawn.";
      return out;
    }
    if (scheme === "courtyard") {
      var cd = FR.courtyard_min_site_depth_m;
      if (ev.site_depth < cd.value) { out.status = "not_permitted"; out.reason = "Site depth " + fmt(ev.site_depth, 2) + " m is below the " + cd.value + " m minimum for a courtyard configuration [" + cd.clause + "]."; return out; }
      var ry = FR.courtyard_rear_yard_m, rh = FR.rear_building_height_m;
      var L_r1 = offsetLine(E[r], ry.value), L_r2 = offsetLine(E[r], ry.value + rearDepthM);
      var rearPts = quad([L_r2, L_s1, L_r1, L_s2]);
      if (!rearPts) { out.status = "not_feasible"; out.reason = "Adjacent lot lines are parallel; cannot build the rear building."; return out; }
      var frontLine = [E[f].a, E[f].d];
      var dMin = Math.min(distToLine(rearPts[0], frontLine), distToLine(rearPts[3], frontLine));
      var depth = Math.min(dMin - courtyardM - fy, maxD);
      if (depth < MIN_BUILDING_DEPTH_M) {
        out.status = "not_feasible";
        out.reason = "Only " + fmt(Math.max(depth, 0), 2) + " m of depth is left for the front building (site " + fmt(ev.site_depth, 2) + " m - front yard " + fy + " m - courtyard " + courtyardM + " m - rear building " + rearDepthM + " m - rear yard " + ry.value + " m); try a shallower rear building or courtyard.";
        return out;
      }
      var L_fr = offsetLine(E[f], fy + depth), frontPts = quad([L_f, L_s1, L_fr, L_s2]);
      if (!frontPts) { out.status = "not_feasible"; out.reason = "Adjacent lot lines are parallel; cannot build the front building."; return out; }
      var sep = Math.min(distToLine(frontPts[1], L_r2), distToLine(frontPts[2], L_r2), distToLine(rearPts[0], L_fr), distToLine(rearPts[3], L_fr));
      var fb = building("front", "Front building", frontPts, hm.value, hm.storeys, mainClause, E[f]);
      var rb = building("rear", "Rear building", rearPts, rh.value, rh.storeys, rh.clause.split(" ")[0], E[f]);
      out.buildings = [fb, rb];
      if (depth === maxD && depth < dMin - courtyardM - fy - 1e-9) out.notes.push("Front building capped at the " + maxD + " m maximum depth [" + R.max_depth_m.clause.split(";")[0] + "]; the courtyard grows to " + fmt(sep, 2) + " m.");
      out.gaps.push({ kind: "courtyard", name: "COURTYARD", value_m: sep, min_m: courtyardM, clause: FR.courtyard_separation_m.clause.split(" ")[0] });
      out.gaps.push({ kind: "yard", name: "REAR YARD (courtyard)", value_m: ry.value, clause: ry.clause.split(" ")[0] });
      out.status = "ok";
      return out;
    }
    if (scheme === "side_by_side") {
      var env = envelopeEdges(ev), Lf = lineOf(env[f]), Lr = lineOf(env[r]), Ls1 = lineOf(env[s1]), Ls2 = lineOf(env[s2]);
      var midF = core.mid(env[f][0], env[f][1]), midR = core.mid(env[r][0], env[r][1]);
      var mL = Math.hypot(midR[0] - midF[0], midR[1] - midF[1]), m = [(midR[0] - midF[0]) / mL, (midR[1] - midF[1]) / mL];
      var g = FR.side_separation_m.value, dF = E[f].d, ms1 = core.mid(env[s1][0], env[s1][1]);
      var sgn = ((ms1[0] - midF[0]) * dF[0] + (ms1[1] - midF[1]) * dF[1]) > 0 ? 1 : -1;
      var G1 = [[midF[0] + dF[0] * sgn * g / 2, midF[1] + dF[1] * sgn * g / 2], m], G2 = [[midF[0] - dF[0] * sgn * g / 2, midF[1] - dF[1] * sgn * g / 2], m];
      var A = quad([Lf, Ls1, Lr, G1]), B = quad([Lf, G2, Lr, Ls2]);
      if (!A || !B) { out.status = "not_feasible"; out.reason = "Envelope edges are parallel to the gap; cannot split the envelope."; return out; }
      var ba = building("A", "Building A (side 1)", A, hm.value, hm.storeys, mainClause, E[f]), bb = building("B", "Building B (side 2)", B, hm.value, hm.storeys, mainClause, E[f]);
      if (Math.min(ba.width_m, bb.width_m) < MIN_BUILDING_WIDTH_M) { out.status = "not_feasible"; out.reason = "Two buildings " + g + " m apart leave only " + fmt(Math.min(ba.width_m, bb.width_m), 2) + " m of width each in a " + fmt(ev.env_width, 2) + " m envelope."; return out; }
      out.buildings = [ba, bb];
      out.gaps.push({ kind: "side", name: "GAP", value_m: g, min_m: g, clause: FR.side_separation_m.clause.split(" ")[0] });
      out.status = "ok";
      return out;
    }
    out.status = "not_feasible"; out.reason = "Unknown form '" + scheme + "'.";
    return out;
  }
  function formBases(res, form, fallback) {
    var bases = {};
    (form.buildings || []).forEach(function (b) { var bz = res ? envelopeBase(res, b.pts) : null; bases[b.key] = bz ? bz.mean : fallback; });
    return bases;
  }
  function formRows(form, ev) {
    var FR = FORM_RULES, rows = [["Form", form.name]];
    if (form.status !== "ok") {
      rows.push(["Status", form.reason || form.status]);
      if (form.status === "single" && ev) rows.push(["Single building", fmt(ev.env_width, 2) + " x " + fmt(ev.env_depth, 2) + " m, " + fmt(ev.footprint_area, 1) + " m2, " + ev.height + " m / " + ev.storeys + " storeys"]);
      return rows;
    }
    var fp = 0, fa = 0;
    form.buildings.forEach(function (b) {
      rows.push([b.name, fmt(b.width_m, 2) + " x " + fmt(b.depth_m, 2) + " m, " + fmt(b.footprint_m2, 1) + " m2, " + b.height_m + " m / " + b.storeys + " storeys [" + b.clause + "]"]);
      fp += b.footprint_m2; fa += b.footprint_m2 * b.storeys;
    });
    form.gaps.forEach(function (g) {
      var name = g.name.charAt(0) + g.name.slice(1).toLowerCase();
      rows.push([name, g.kind === "yard" ? g.value_m + " m [" + g.clause + "]" : fmt(g.value_m, 2) + " m (min " + g.min_m + " m) [" + g.clause + "]"]);
    });
    if (ev && ev.area) {
      rows.push(["Footprints", fmt(fp, 1) + " m2 = " + Math.round(100 * fp / ev.area) + "% of the site"]);
      rows.push(["Floor area if every storey is full", Math.round(fa) + " m2 = FSR " + fmt(fa / ev.area, 2) + "; cap " + fmt(FR.fsr_max.value, 2) + " [" + FR.fsr_max.clause + "]; the by-law's exclusions are not modelled"]);
    }
    rows.push(["Approval", FR.multiple_buildings.value + " for more than one principal building [" + FR.multiple_buildings.clause + "]"]);
    form.notes.forEach(function (n) { rows.push(["Note", n]); });
    return rows;
  }
  function formLines(form, ev) {
    var L = ["FORM OPTION: " + form.name];
    formRows(form, ev).slice(1).forEach(function (r) { L.push("  " + r[0] + ": " + r[1]); });
    L.push("  Source: " + FORM_RULES.source.document + "; " + FORM_RULES.source.checked + ". " + FORM_RULES.source.note);
    return L;
  }

  // ------------------------------------------------------------------ section
  var SECTION_HEAD_M = 2.0;
  function lineSpan(c, d, poly) {
    var ss = [], n = poly.length;
    for (var i = 0; i < n; i++) {
      var a = poly[i], b = poly[(i + 1) % n], e = [b[0] - a[0], b[1] - a[1]], den = d[0] * e[1] - d[1] * e[0];
      if (Math.abs(den) < 1e-12) continue;
      var dx = a[0] - c[0], dy = a[1] - c[1], s = (dx * e[1] - dy * e[0]) / den, t = (dx * d[1] - dy * d[0]) / den;
      if (-1e-9 <= t && t <= 1 + 1e-9) ss.push(s);
    }
    if (ss.length < 2) return null;
    return [Math.min.apply(null, ss), Math.max.apply(null, ss)];
  }
  /* sectionPlan(ev, form, bases, baseZ, off, option): the section line runs front to rear through the site; with a
     unit option it passes through the middle of the first building's first ground-floor cell (never along a party
     wall), and the result carries one box per unit per floor that the line cuts, the exterior stair and walkways
     it crosses, the property lines, the yard lines of the schedule and the height limits, all labelled. */
  function sectionPlan(ev, form, bases, baseZ, off, option) {
    if (!ev || ev.status !== "ok") return null;
    baseZ = baseZ || 0; off = off || 2.4;
    var E = ev.edges, f = ev.idx.front, nIn = E[f].n, c = site.centroid(ev.pts), R = core.RULES, FR = FORM_RULES;
    var hasForm = form && form.status === "ok" && form.buildings && form.buildings.length, like = hasForm ? (form.dims_like || form.scheme) : null;
    var units = [], access = [], cellOf = null;
    if (hasForm && like === "side_by_side") c = form.buildings[0].centroid;
    if (hasForm && option && typeof R1Cmhc !== "undefined") {
      var b0 = form.buildings[0], blk = option.blocks.filter(function (x) { return x.key === b0.key; })[0];
      if (blk && blk.floors.length) {
        var cells = R1Cmhc.unitCells(blk.floors[0].units, blk.floors[0].split, blk.floors[0].cols), c0 = cells[0];
        c = R1Cmhc.bilinear(b0.pts, (c0.a0 + c0.a1) / 2, 0.5); cellOf = { block: b0.key, unit: c0.key };
      }
    }
    var lot = lineSpan(c, nIn, ev.pts);
    if (!lot) return null;
    var blds = [], gapName = "GAP";
    if (hasForm) {
      gapName = like === "courtyard" ? "COURTYARD" : "GAP";
      form.buildings.forEach(function (b) {
        var span = lineSpan(c, nIn, b.pts); if (!span) return;
        var z0 = bases && bases[b.key] !== undefined ? bases[b.key] : baseZ;
        blds.push({ key: b.key, name: b.name.toUpperCase(), s0: span[0], s1: span[1], z0: z0, z1: z0 + b.height_m, storeys: b.storeys, max_h: b.key === "rear" ? FR.rear_building_height_m.value : R.max_height_m.value,
          max_clause: (b.key === "rear" ? FR.rear_building_height_m.clause : R.max_height_m.clause).split(" ")[0] });
      });
      if (option && typeof R1Cmhc !== "undefined") {
        R1Cmhc.unitVolumes(option, form).forEach(function (v) {
          var span = lineSpan(c, nIn, v.pts); if (!span || span[1] - span[0] < 0.3) return;
          var z0 = bases && bases[v.block] !== undefined ? bases[v.block] : baseZ, u = R1Cmhc.unitOf(R1Cmhc.blockOf(option, v.block), v.unit) || {};
          units.push({ block: v.block, unit: v.unit, floor_index: v.floor_index, s0: span[0], s1: span[1], z0: z0 + v.z0, z1: z0 + v.z1, color: v.color, kind: v.kind || null,
            label: v.unit, sub: v.kind ? (u.name || "").toUpperCase() : v.beds + " BED" });
        });
        if (typeof R1Access !== "undefined") {
          var ap = R1Access.plan(option);
          form.buildings.forEach(function (bld) {
            var B = ap.blocks[bld.key], span = lineSpan(c, nIn, bld.pts); if (!B || !span) return;
            var z0 = bases && bases[bld.key] !== undefined ? bases[bld.key] : baseZ;
            var ax = bld.pts[3][0] - bld.pts[0][0], ay = bld.pts[3][1] - bld.pts[0][1], xa = ((c[0] - bld.pts[0][0]) * ax + (c[1] - bld.pts[0][1]) * ay) / (ax * ax + ay * ay) * B.width_m;   // where across the block the line runs
            B.walkways.forEach(function (w) {
              if (xa < w.x0 || xa > w.x1) return;
              access.push({ kind: "walkway", block: bld.key, face: w.face, floor_index: w.floor_index, s0: w.face === "rear" ? span[1] + (w.y0 - B.depth_m) : span[0] + w.y0, s1: w.face === "rear" ? span[1] + (w.y1 - B.depth_m) : span[0] + w.y1, z: z0 + w.z });
            });
            B.stairs.forEach(function (st) {
              if (xa < st.x0 || xa > st.x1) return;
              access.push({ kind: "stair", block: bld.key, face: st.face, s0: st.face === "rear" ? span[1] + (st.y0 - B.depth_m) : span[0] + st.y0, s1: st.face === "rear" ? span[1] + (st.y1 - B.depth_m) : span[0] + st.y1, z0: z0, z1: z0 + st.z_top + R1Access.GUARD_H });
            });
          });
        }
      }
    } else {
      var span2 = lineSpan(c, nIn, ev.env_pts);
      if (span2) blds.push({ key: "envelope", name: "ENVELOPE", s0: span2[0], s1: span2[1], z0: baseZ, z1: baseZ + ev.height, storeys: ev.storeys, max_h: R.max_height_m.value, max_clause: R.max_height_m.clause.split(" ")[0] });
    }
    blds.sort(function (a, b) { return a.s0 - b.s0; });
    var zTop = Math.max.apply(null, blds.map(function (b) { return Math.max(b.z1, b.z0 + b.max_h); }).concat([baseZ])), zString = zTop + off;
    var zLow = Math.min.apply(null, blds.map(function (b) { return b.z0; }).concat([baseZ])) - SECTION_HEAD_M;
    var lines = [], dims = [], marks = [];
    function vline(key, s, style) { lines.push({ key: key, style: style, a: [s, zLow], b: [s, zString + off * 0.4] }); }
    vline("v|lot_front", lot[0], "site"); vline("v|lot_rear", lot[1], "site");
    marks.push({ kind: "property", s: lot[0], label: "PROPERTY LINE" }, { kind: "property", s: lot[1], label: "PROPERTY LINE" });
    // the yard lines of the schedule (independent of where the buildings stand)
    var fy = R.front_yard_m.value, ry = R.rear_yard_m.value;
    marks.push({ kind: "setback", s: lot[0] + fy, label: "FRONT YARD " + fy + " m", clause: R.front_yard_m.clause.split(" ")[0] });
    marks.push({ kind: "setback", s: lot[1] - ry, label: "REAR YARD " + ry + " m" + (blds.some(function (b) { return b.key === "rear"; }) ? ", single building" : ""), clause: R.rear_yard_m.clause.split(" ")[0] });
    if (blds.some(function (b) { return b.key === "rear"; })) marks.push({ kind: "setback", s: lot[1] - FR.courtyard_rear_yard_m.value, label: "REAR YARD " + FR.courtyard_rear_yard_m.value + " m, rear building", clause: FR.courtyard_rear_yard_m.clause.split(" ")[0] });
    var prevS = lot[0];
    blds.forEach(function (b, i) {
      vline("v|" + b.key + "|0", b.s0, "face"); vline("v|" + b.key + "|1", b.s1, "face");
      lines.push({ key: "h|" + b.key + "|base", style: "marks", a: [b.s1, b.z0], b: [b.s1 + off, b.z0] });
      lines.push({ key: "h|" + b.key + "|top", style: "marks", a: [b.s1, b.z1], b: [b.s1 + off, b.z1] });
      marks.push({ kind: "height", s0: b.s0 - off * 0.3, s1: b.s1 + off * 0.3, z: b.z0 + b.max_h, label: "MAX HEIGHT " + b.max_h + " m", clause: b.max_clause });
      if (b.s0 - prevS > 0.05) dims.push({ name: i === 0 ? "FRONT YARD" : gapName, s: [prevS, b.s0], z: zString, value_m: b.s0 - prevS });
      dims.push({ name: b.name, s: [b.s0, b.s1], z: zString, value_m: b.s1 - b.s0 });
      prevS = b.s1;
    });
    if (lot[1] - prevS > 0.05) dims.push({ name: "REAR YARD", s: [prevS, lot[1]], z: zString, value_m: lot[1] - prevS });
    blds.forEach(function (b) {   // the height string stands behind the building and behind any stair or walkway on its rear face
      var behind = Math.max.apply(null, [b.s1].concat(access.filter(function (a) { return a.block === b.key && a.s1 > b.s1; }).map(function (a) { return a.s1; })));
      dims.push({ name: b.name + " HEIGHT", s: behind + off * 0.6, z: [b.z0, b.z1], value_m: b.z1 - b.z0, vertical: true });
    });
    return { c: c, dir: nIn, lot: lot, buildings: blds, units: units, access: access, marks: marks, cell: cellOf, lines: lines, dims: dims, z_low: zLow, z_high: zString + off * 0.4 + SECTION_HEAD_M, z_string: zString };
  }

  // ------------------------------------------------------------------ tables
  function rulesRows(ev, form) {
    var R = core.RULES, rows = [], elig = {};
    if (ev && ev.eligibility) ev.eligibility.forEach(function (row) { elig[row.max_units] = row; });
    var band = ev ? ev.band : null;
    R.bands.forEach(function (b) {
      var st = "", row = elig[b.max_units];
      if (row) {
        if (row.ok_area && row.ok_frontage) st = "qualifies" + (band === b ? "  <- band applied" : "");
        else st = "no (" + [["area", row.ok_area], ["frontage", row.ok_frontage]].filter(function (x) { return !x[1]; }).map(function (x) { return x[0]; }).join(" and ") + ")";
      }
      rows.push(["Up to " + b.max_units + " units: min site area / frontage", b.min_area.toFixed(0) + " m2 / " + b.min_frontage + " m", b.clause.split(" ")[0], st]);
    });
    var tu = R.three_unit_max, st3 = "";
    if (ev && "three_unit_excluded" in ev) st3 = ev.three_unit_excluded ? "3-unit building excluded (site larger)" : "3-unit building possible";
    rows.push(["3 units: max site area / frontage", tu.max_area.toFixed(0) + " m2 / " + tu.max_frontage + " m", tu.clause, st3]);
    var md = R.min_site_depth_m, std = "";
    if (ev && "site_depth" in ev) std = "site " + fmt(ev.site_depth, 2) + " m: " + (ev.site_depth >= md.value ? "OK" : "FAILS");
    rows.push(["Min site depth, single building", md.value + " m", md.clause, std]);
    var applied = (ev && ev.status === "ok") ? "applied" : "";
    [["front_yard_m", "Front yard, minimum"], ["side_yard_m", "Side yard, minimum (each)"], ["rear_yard_m", "Rear yard, minimum (single building)"]].forEach(function (pair) {
      var rule = R[pair[0]]; rows.push([pair[1], rule.value + " m", rule.clause.split(" ")[0], applied]);
    });
    var mdp = R.max_depth_m, stdp = "";
    if (ev && ev.depth_controlled_by) stdp = ev.depth_controlled_by === "max building depth" ? "CONTROLS: envelope depth " + fmt(ev.env_depth, 2) + " m" : "not reached; rear yard controls (" + fmt(ev.env_depth, 2) + " m)";
    rows.push(["Max building depth", mdp.value + " m", "3.1.2.9 (4.2.3)", stdp]);
    var mw = R.max_width_m, stw = "";
    if (ev && "env_width" in ev) stw = "envelope width " + fmt(ev.env_width, 2) + " m: " + (ev.width_exceeds_max ? "EXCEEDS" : "within");
    rows.push(["Max building width", mw.value + " m", mw.clause, stw]);
    var mh = R.max_height_m;
    rows.push(["Max height, single building", mh.value + " m / " + mh.storeys + " storeys", mh.clause.split(" ")[0], applied]);
    var FR = FORM_RULES, scheme = (form && form.status === "ok") ? (form.dims_like || form.scheme) : null;
    var cd = FR.courtyard_min_site_depth_m, stc = "";
    if (ev && "site_depth" in ev) stc = "site " + fmt(ev.site_depth, 2) + " m: " + (ev.site_depth >= cd.value ? "OK" : "FAILS");
    rows.push(["Min site depth, courtyard (front + rear building)", cd.value + " m", cd.clause.split(" ")[0], stc]);
    var cy = scheme === "courtyard" ? "applied (courtyard form)" : "";
    rows.push(["Rear yard, rear building in a courtyard", FR.courtyard_rear_yard_m.value + " m", FR.courtyard_rear_yard_m.clause.split(" ")[0], cy]);
    var sts = cy;
    if (scheme === "courtyard") { var g = form.gaps.filter(function (x) { return x.kind === "courtyard"; }); if (g.length) sts = "courtyard " + fmt(g[0].value_m, 2) + " m"; }
    rows.push(["Separation, front building to rear building", FR.courtyard_separation_m.value + " m", FR.courtyard_separation_m.clause.split(" ")[0], sts]);
    var rh = FR.rear_building_height_m;
    rows.push(["Max height, rear building in a courtyard", rh.value + " m / " + rh.storeys + " storeys", rh.clause.split(" ")[0], cy]);
    rows.push(["Separation, buildings side by side", FR.side_separation_m.value + " m", FR.side_separation_m.clause.split(" ")[0], scheme === "side_by_side" ? "applied (side-by-side form)" : ""]);
    rows.push(["More than one principal building", FR.multiple_buildings.value, FR.multiple_buildings.clause, (scheme === "courtyard" || scheme === "side_by_side") ? "needed for this form" : ""]);
    return rows;
  }
  var RULE_GROUPS = [["Site area and frontage", ["3.1.2.1", "3.1.2.2", "3.1.2.3"]], ["Site depth", ["3.1.2.4"]], ["Yards", ["3.1.2.6", "3.1.2.7", "3.1.2.8"]],
    ["Building depth and width", ["3.1.2.9", "3.1.2.10"]], ["Height", ["3.1.2.5"]], ["Separation between buildings", ["3.1.2.11"]], ["More than one principal building", ["2.2.9"]]];
  function clauseKey(clause) { return clause.split(" ")[0].split("(")[0]; }
  function rulesGroups(ev, form) {
    var rows = rulesRows(ev, form), groups = RULE_GROUPS.map(function (g) { return { title: g[0], keys: g[1], rows: [] }; }), other = [];
    rows.forEach(function (row) {
      var key = clauseKey(row[2]), placed = false;
      for (var i = 0; i < groups.length; i++) if (groups[i].keys.indexOf(key) >= 0) { groups[i].rows.push(row); placed = true; break; }
      if (!placed) other.push(row);
    });
    var out = groups.filter(function (g) { return g.rows.length; }).map(function (g) { return { title: g.title, rows: g.rows }; });
    if (other.length) out.push({ title: "Other", rows: other });
    return out;
  }
  function resultsRows(ev, base, zone, parcel) {
    var rows = [];
    if (parcel) { var wd = site.approxDims(parcel.ring); rows.push(["Site", parcel.civic + " " + parcel.street + "   " + fmt(wd[0], 2) + " x " + fmt(wd[1], 2) + " m"]); }
    if (zone) { var d = zone.district || "?"; rows.push(["Zoning district", d + (d.indexOf(R1_1_PREFIX) === 0 ? "" : "   NOT R1-1: numbers for comparison only")]); }
    if (!ev) return rows;
    rows.push(["Status", ev.status]);
    if ("area" in ev) {
      rows.push(["Site area", fmt(ev.area, 1) + " m2"], ["Frontage", fmt(ev.frontage, 2) + " m  (" + Math.round(ev.frontage * 1000) + " mm)"], ["Site depth", fmt(ev.site_depth, 2) + " m  (" + Math.round(ev.site_depth * 1000) + " mm)"]);
    }
    if (ev.band) rows.push(["Max units", ev.band.max_units + "   [" + ev.band.clause + "]"]);
    if (ev.controlling) rows.push(["Controlling constraint", ev.controlling]);
    if (ev.status === "ok") {
      rows.push(["Envelope width", fmt(ev.env_width, 2) + " m  (" + Math.round(ev.env_width * 1000) + " mm)   side yards"],
        ["Envelope depth", fmt(ev.env_depth, 2) + " m  (" + Math.round(ev.env_depth * 1000) + " mm)   " + ev.depth_controlled_by],
        ["Envelope height", ev.height + " m / " + ev.storeys + " storeys"], ["Footprint area", fmt(ev.footprint_area, 1) + " m2 (not floor area)"]);
      if (ev.width_exceeds_max) rows.push(["Width check", "EXCEEDS max building width; human decision needed"]);
    }
    if (base) rows.push(["Envelope base", (base.mean >= 0 ? "+" : "") + fmt(base.mean, 2) + " m = mean ground under the corners (range " + fmt(base.range, 2) + " m)"]);
    return rows;
  }

  return { APP_ID: APP_ID, STREET_MIN_GAP_M: STREET_MIN_GAP_M, parcelLabel: parcelLabel, parcelChoices: parcelChoices, siteLines: siteLines,
    CUT_SIDES_M: CUT_SIDES_M, CUT_DEFAULT_SIDE_M: CUT_DEFAULT_SIDE_M, fetchRadiusFor: fetchRadiusFor, siteSquare: siteSquare, toUV: toUV, fromUV: fromUV,
    squareRing: squareRing, inSquare: inSquare, clipRing: clipRing, clipPolyline: clipPolyline, cutLines: cutLines,
    compass: compass, edges: edges, detectFrontage: detectFrontage, frontageLines: frontageLines, groundAt: groundAt, envelopeBase: envelopeBase,
    groundLines: groundLines, groundZ: groundZ, zoningAt: zoningAt, zoningLines: zoningLines, envelopeComment: envelopeComment, R1_1_PREFIX: R1_1_PREFIX,
    ROAD_NAME_MIN_LEN_M: ROAD_NAME_MIN_LEN_M, roadPieces: roadPieces, fetchRoads: fetchRoads, roadNameNear: roadNameNear, roadsLines: roadsLines,
    edgeChoices: edgeChoices, setbackSegments: setbackSegments, envelopeEdges: envelopeEdges, dimOffsetM: dimOffsetM,
    envelopeDimensionPlan: envelopeDimensionPlan, formDimensionPlan: formDimensionPlan,
    FORM_RULES: FORM_RULES, SCHEMES: SCHEMES, REAR_DEPTHS_M: REAR_DEPTHS_M, REAR_DEPTH_DEFAULT_M: REAR_DEPTH_DEFAULT_M, COURTYARDS_M: COURTYARDS_M,
    schemeName: schemeName, formScheme: formScheme, formBases: formBases, formRows: formRows, formLines: formLines,
    building: building, quad: quad, offsetLine: offsetLine, quadDims: quadDims, distToLine: distToLine, lineOf: lineOf, anchor: anchor, seg: seg,
    lineSpan: lineSpan, sectionPlan: sectionPlan, rulesRows: rulesRows, rulesGroups: rulesGroups, resultsRows: resultsRows };
})();
