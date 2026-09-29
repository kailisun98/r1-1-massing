/* core.js -- R1-1 by-law logic for the web app: a line-for-line port of lib/r1_1_core.py.
   RULES is the only place a reviewer should need to look to check a number. Metres throughout. */
var R1Core = (function () {
  "use strict";

  var RULES = {
    source: {
      document: "Zoning and Development By-law No. 3575, R1-1 District Schedule, s.3.1 Multiple dwelling",
      version: "June 2026 consolidation",
      accessed: "2026-09-20",
      url: "https://bylaws.vancouver.ca/zoning/zoning-by-law-district-schedule-r1-1.pdf",
      note: "Transcribed from the primary source. Re-verify if the schedule is amended."
    },
    bands: [
      { min_area: 557.0, min_frontage: 15.1, max_units: 6, clause: "3.1.2.1 (6+ units; 8 if 100% rental per 3.1.1.3(a))" },
      { min_area: 464.0, min_frontage: 13.4, max_units: 5, clause: "3.1.2.2 (5 units)" },
      { min_area: 306.0, min_frontage: 10.0, max_units: 4, clause: "3.1.2.3(a)(b) (3 or 4 units)" }
    ],
    three_unit_max: { max_area: 463.0, max_frontage: 13.3, clause: "3.1.2.3(c)(d)" },
    min_site_depth_m: { value: 30.4, clause: "3.1.2.4(b)" },
    front_yard_m: { value: 4.9, clause: "3.1.2.6" },
    side_yard_m: { value: 1.2, clause: "3.1.2.7" },
    rear_yard_m: { value: 10.7, clause: "3.1.2.8(b) (all other buildings)" },
    max_depth_m: { value: 19.8, clause: "3.1.2.9; measured per 4.2.3 (front to rear exterior wall, balconies/porches excluded). Corner relaxation 3.1.2.12 EXCLUDED" },
    max_width_m: { value: 17.4, clause: "3.1.2.10" },
    max_height_m: { value: 11.5, storeys: 3, clause: "3.1.2.5(b) (all other buildings: 11.5 m and 3 storeys)" },
    assumptions: [
      "Site is a single lot on record before 17 Oct 2023 or created by subdivision (2.2.7(a)).",
      "Site has vehicular access from the rear (lane) (2.2.7(b)).",
      "Site is NOT partially or fully within a designated flood plain (2.2.7(c)).",
      "Site is an INTERIOR lot. Corner-site depth increase (3.1.2.12) is excluded.",
      "Single principal building. More than one building needs Director approval (2.2.9); courtyard yards (3.1.2.8(a)) excluded.",
      "Yards are minimums. No Director of Planning relaxations are modelled.",
      "Envelope is NOT floor area. FSR (3.1.1.2, max 1.00), unit mix (2.2.8), trees (2.2.1), outdoor space (4.3.5) are out of scope."
    ]
  };

  function v(a, b) { return [b[0] - a[0], b[1] - a[1]]; }
  function len(d) { return Math.hypot(d[0], d[1]); }
  function unit(d) { var l = len(d); return [d[0] / l, d[1] / l]; }
  function signedArea(pts) {
    var s = 0, n = pts.length;
    for (var i = 0; i < n; i++) {
      var p = pts[i], q = pts[(i + 1) % n];
      s += p[0] * q[1] - q[0] * p[1];
    }
    return s / 2;
  }
  function inwardNormal(d, ccw) { return ccw ? unit([-d[1], d[0]]) : unit([d[1], -d[0]]); }
  function intersect(p1, d1, p2, d2) {
    var den = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(den) < 1e-9) return null;
    var dx = p2[0] - p1[0], dy = p2[1] - p1[1];
    var t = (dx * d2[1] - dy * d2[0]) / den;
    return [p1[0] + t * d1[0], p1[1] + t * d1[1]];
  }
  function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
  function polygonArea(pts) { return Math.abs(signedArea(pts)); }

  function evaluate(pts, click) {
    var res = { status: null, pts: pts.slice(), click: click.slice() };
    if (pts.length !== 4) { res.status = "out_of_scope"; res.n_vertices = pts.length; return res; }
    var ccw = signedArea(pts) > 0;
    var edges = [];
    for (var i = 0; i < 4; i++) {
      var a = pts[i], b = pts[(i + 1) % 4], d = v(a, b);
      edges.push({ a: a, b: b, d: unit(d), n: inwardNormal(d, ccw), len: len(d) });
    }
    res.edges = edges;
    var dists = edges.map(function (e) { return len(v(mid(e.a, e.b), click)); });
    var f = dists.indexOf(Math.min.apply(null, dists));
    var r = (f + 2) % 4, s1 = (f + 1) % 4, s2 = (f + 3) % 4;
    res.idx = { front: f, rear: r, side1: s1, side2: s2 };
    var frontage = edges[f].len, area = polygonArea(pts);
    var rm = mid(edges[r].a, edges[r].b), fa = edges[f].a;
    var depth = Math.abs((rm[0] - fa[0]) * edges[f].n[0] + (rm[1] - fa[1]) * edges[f].n[1]);
    res.area = area; res.frontage = frontage; res.site_depth = depth;

    var band = null, rows = [];
    RULES.bands.forEach(function (b) {
      var okA = area >= b.min_area, okF = frontage >= b.min_frontage;
      rows.push({ max_units: b.max_units, min_area: b.min_area, ok_area: okA, min_frontage: b.min_frontage, ok_frontage: okF, clause: b.clause });
      if (band === null && okA && okF) band = b;
    });
    res.eligibility = rows; res.band = band;
    if (band === null) {
      var smallest = RULES.bands[RULES.bands.length - 1];
      var failA = area < smallest.min_area, failF = frontage < smallest.min_frontage;
      res.status = "not_permitted";
      res.controlling = (failA && failF) ? "site area AND frontage" : (failA ? "site area" : "frontage");
      return res;
    }
    var md = RULES.min_site_depth_m;
    if (depth < md.value) { res.status = "depth_fail"; res.controlling = "site depth"; return res; }
    var tu = RULES.three_unit_max;
    res.three_unit_excluded = (area > tu.max_area || frontage > tu.max_frontage);

    var fy = RULES.front_yard_m.value, ry = RULES.rear_yard_m.value, sy = RULES.side_yard_m.value;
    var setbacks = {}; setbacks[f] = fy; setbacks[r] = ry; setbacks[s1] = sy; setbacks[s2] = sy;
    res.setbacks = setbacks;
    var off = [];
    for (i = 0; i < 4; i++) {
      var e = edges[i];
      off.push({ p: [e.a[0] + e.n[0] * setbacks[i], e.a[1] + e.n[1] * setbacks[i]], d: e.d });
    }
    var maxD = RULES.max_depth_m.value;
    var envDepth = depth - fy - ry, depthBy = "rear yard";
    if (envDepth > maxD) {
      var nf = edges[f].n;
      off[r].p = [off[f].p[0] + nf[0] * maxD, off[f].p[1] + nf[1] * maxD];
      envDepth = maxD; depthBy = "max building depth";
    }
    var envPts = [];
    for (i = 0; i < 4; i++) {
      var pt = intersect(off[i].p, off[i].d, off[(i + 1) % 4].p, off[(i + 1) % 4].d);
      if (pt === null) { res.status = "degenerate"; return res; }
      envPts.push(pt);
    }
    var envWidth = frontage - 2 * sy;
    res.env_depth = envDepth; res.env_width = envWidth; res.depth_controlled_by = depthBy;
    res.width_exceeds_max = envWidth > RULES.max_width_m.value;
    if (envDepth <= 0 || envWidth <= 0) { res.status = "no_envelope"; res.controlling = "site dimensions"; return res; }
    res.env_pts = envPts;
    res.height = RULES.max_height_m.value;
    res.storeys = RULES.max_height_m.storeys;
    res.footprint_area = envDepth * envWidth;
    var labels = [];
    [[f, "FRONT"], [r, "REAR"], [s1, "SIDE"], [s2, "SIDE"]].forEach(function (pair) {
      var e = edges[pair[0]], m = mid(e.a, e.b);
      labels.push({ kind: pair[1], value_m: setbacks[pair[0]], pt: [m[0] + e.n[0] * setbacks[pair[0]] / 2, m[1] + e.n[1] * setbacks[pair[0]] / 2] });
    });
    res.labels = labels;
    res.status = "ok";
    return res;
  }

  function fmtLen(vm, unitName, decimals) {
    if (unitName === "mm") return Math.round(vm * 1000) + " mm (" + vm.toFixed(decimals) + " m)";
    return vm.toFixed(decimals) + " m";
  }

  function reportLines(res, unitName) {
    unitName = unitName || "m";
    var L = [], R = RULES;
    var rule = function (x) { return fmtLen(x, unitName, 1); }, meas = function (x) { return fmtLen(x, unitName, 2); };
    var bar = new Array(71).join("=");
    L.push(bar, "R1-1 MULTIPLEX SETBACK-TO-ENVELOPE MAPPER", "Source: " + R.source.document,
      "Version: " + R.source.version + " | Accessed: " + R.source.accessed, "URL: " + R.source.url, "NOTE: " + R.source.note,
      "Units: by-law values are in metres; model values shown in " + unitName + ".", bar);
    if (res.status === "out_of_scope") {
      L.push("STOP (out of scope): this tool handles 4-sided interior lots only. Boundary has " + res.n_vertices + " vertices.");
      return L;
    }
    L.push("", "ASSUMPTIONS (not checked by this tool):");
    R.assumptions.forEach(function (a) { L.push("  - " + a); });
    L.push("", "DERIVED SITE VALUES:", "  Site area      = " + res.area.toFixed(1) + " m2",
      "  Frontage       = " + meas(res.frontage) + "  (length of street-facing edge)",
      "  Site depth     = " + meas(res.site_depth) + "  (perpendicular, front to rear)");
    L.push("", "ELIGIBILITY (3.1.2 -- both area AND frontage must be met):");
    res.eligibility.forEach(function (row) {
      L.push("  up to " + row.max_units + " units: area " + (row.ok_area ? ">=" : "< ") + " " + row.min_area.toFixed(0) + " m2 [" + (row.ok_area ? "OK" : "no") +
        "]  frontage " + (row.ok_frontage ? ">=" : "< ") + " " + rule(row.min_frontage) + " [" + (row.ok_frontage ? "OK" : "no") + "]   " + row.clause);
    });
    if (res.status === "not_permitted") {
      L.push("", "RESULT: Multiplex NOT permitted -- site is below the smallest 3.1.2 band.", "  Controlling constraint: " + res.controlling,
        "  Duplex / single detached fall under section 3.2 (also 306 m2 min, 3.2.2.1,",
        "  relaxable by the Director under 3.2.2.9). OUTSIDE this tool's scope. No envelope drawn.");
      return L;
    }
    var md = R.min_site_depth_m;
    if (res.status === "depth_fail") {
      L.push("", "RESULT: Site area and frontage qualify, but site depth " + meas(res.site_depth) + " is below the " + rule(md.value) + " minimum for a single building  [" + md.clause + "].",
        "  Controlling constraint: site depth. No envelope drawn. Human interpretation needed.");
      return L;
    }
    var band = res.band;
    L.push("", "RESULT: Multiplex permitted, up to " + band.max_units + " units  [" + band.clause + "]",
      "  Site depth " + meas(res.site_depth) + " >= " + rule(md.value) + " minimum  [" + md.clause + "]");
    if (res.three_unit_excluded) {
      var tu = R.three_unit_max;
      L.push("  Note: a 3-unit building is NOT permitted on this site (site exceeds " + tu.max_area.toFixed(0) + " m2 / " + rule(tu.max_frontage) + ")  [" + tu.clause + "]");
    }
    if (res.status === "degenerate") { L.push("STOP: adjacent edges are parallel; cannot build envelope."); return L; }
    if (res.status === "no_envelope") { L.push("", "RESULT: Yards consume the whole site -- no buildable envelope. Controlling constraint: site dimensions."); return L; }
    var fy = R.front_yard_m, ry = R.rear_yard_m, sy = R.side_yard_m;
    L.push("", "YARDS APPLIED (single principal building):", "  Front  " + rule(fy.value) + "   [" + fy.clause + "]",
      "  Side   " + rule(sy.value) + "   flat; s.3.2.2.11 reduction does not apply to multiple dwelling  [" + sy.clause + "]",
      "  Rear   " + rule(ry.value) + "   [" + ry.clause + "]");
    var maxD = R.max_depth_m;
    var depthClause = res.depth_controlled_by === "max building depth" ? maxD.clause :
      (ry.clause + " + " + fy.clause + "; " + rule(maxD.value) + " max depth (3.1.2.9) not reached");
    L.push("", "ENVELOPE:", "  Depth  " + meas(res.env_depth) + "   controlled by: " + res.depth_controlled_by + "  [" + depthClause + "]",
      "  Width  " + meas(res.env_width) + "   " + (res.width_exceeds_max ? "EXCEEDS max width -- human decision needed" : "within max width") + "  [" + R.max_width_m.clause + "]",
      "  Height " + rule(res.height) + " / " + res.storeys + " storeys   [" + R.max_height_m.clause + "]",
      "  Footprint area " + res.footprint_area.toFixed(1) + " m2 (envelope plan area, NOT floor area / FSR)", "",
      "Controlling constraints: site area & frontage (eligibility); " + res.depth_controlled_by + " (depth); side yards (width).");
    return L;
  }

  function summaryLine(res, unitName) {
    unitName = unitName || "mm";
    if (res.status !== "ok") return "R1-1: " + res.status;
    return "R1-1 envelope: up to " + res.band.max_units + " units [" + res.band.clause.split(" ")[0] + "]; front " + fmtLen(RULES.front_yard_m.value, unitName, 1) +
      " [" + RULES.front_yard_m.clause + "]; side " + fmtLen(RULES.side_yard_m.value, unitName, 1) + " [" + RULES.side_yard_m.clause + "]; rear " +
      fmtLen(RULES.rear_yard_m.value, unitName, 1) + " [" + RULES.rear_yard_m.clause.split(" ")[0] + "]; depth " + fmtLen(res.env_depth, unitName, 2) + " by " +
      res.depth_controlled_by + "; height " + fmtLen(res.height, unitName, 1) + " / " + res.storeys + " st [" + RULES.max_height_m.clause.split(" ")[0] + "]; source " + RULES.source.version;
  }

  return { RULES: RULES, evaluate: evaluate, reportLines: reportLines, summaryLine: summaryLine,
    intersect: intersect, mid: mid, polygonArea: polygonArea, signedArea: signedArea, unit: unit };
})();
