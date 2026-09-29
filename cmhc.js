/* cmhc.js -- CMHC Housing Design Catalogue (British Columbia designs) tested against the R1-1 envelope.
   The catalogue designs are fixed buildings; the test asks whether each one, alone or with an accessory unit
   behind it or two side by side, sits inside the permitted envelope and the form rules of the schedule, and
   what unit mix that gives. A fitting option becomes a "form" (same shape as the step-5 form options), so the
   map, the section and the 3D view draw it with the existing code; unitVolumes splits it into coloured unit
   volumes per floor, and floorPlansSvg draws schematic plans from the same layout. */
var R1Cmhc = (function () {
  "use strict";
  var core = R1Core, site = R1Site, M = R1Massing;
  function fmt(x, d) { return Number(x).toFixed(d); }

  var SOURCE = {
    name: "CMHC Housing Design Catalogue, British Columbia designs",
    url: "https://www.housingcatalogue.cmhc-schl.gc.ca/designs?region=a5628ce4-6a13-4f6b-9a27-cdb6b8b6892b",
    accessed: "2026-09-28",
    note: "Building summary values transcribed from page 1 of each design's summary package (number of units and storeys, footprint, width, depth, " +
      "roof-peak and mid-slope heights, unit list); the unit layout per floor read from the plan pages; gross building area from the catalogue " +
      "listing. CMHC: the designs are illustrative and not for permit; CMHC's website terms apply."
  };
  var BASE = "https://www.housingcatalogue.cmhc-schl.gc.ca/designs/bc/";
  var UNIT_COLORS = ["#2a9d8f", "#e76f51", "#e9c46a", "#457b9d", "#8ab17d", "#f4a261", "#6d597a", "#b56576"];
  function U(key, beds, baths, extra) { var u = { key: key, beds: beds, baths: baths }; if (extra) Object.keys(extra).forEach(function (k) { u[k] = extra[k]; }); return u; }
  function F(name, units, split) { return { name: name, units: units, split: split || "across" }; }   // split: across the width, deep (front to back) or grid (2 x 2)

  /* role: principal = a main building; accessory = a secondary unit placed as the rear building of a courtyard
     configuration; courtyard = the catalogue's own front + rear pair. Dimensions in metres, areas in m2. */
  var DESIGNS = [
    { key: "adu_01", name: "Accessory Dwelling Unit 01", slug: "accessory-dwelling-unit-01", role: "accessory", units: 1, storeys: 1, gfa_m2: 50,
      footprint_m2: 51.5, width_m: 6.7, depth_m: 8.0, height_peak_m: 4.6, height_mid_m: 3.5,
      unit_list: [U("U1", 1, 1, { adaptable_alt: true })], floors: [F("Ground", ["U1"])],
      layout: "One-storey secondary unit; U1a is the adaptable version (BCBC 2024, 3.8.5)." },
    { key: "adu_02", name: "Accessory Dwelling Unit 02", slug: "accessory-dwelling-unit-02", role: "accessory", units: 1, storeys: 2, gfa_m2: 94,
      footprint_m2: 45.7, width_m: 5.6, depth_m: 8.2, height_peak_m: 7.9, height_mid_m: 6.7,
      unit_list: [U("U1", 2, 1.5)], floors: [F("Ground", ["U1"]), F("Second", ["U1"])],
      layout: "Two-storey secondary unit." },
    { key: "duplex", name: "Duplex", slug: "duplex", role: "principal", units: 2, storeys: 2.5, gfa_m2: 272,
      footprint_m2: 102.2, width_m: 7.3, depth_m: 17.4, height_peak_m: 10.15, height_mid_m: 9.2,
      unit_list: [U("U1", 3, 2.5, { den: true }), U("U2", 3, 2.5, { den: true })],
      floors: [F("Ground", ["U1", "U2"], "deep"), F("Second", ["U1", "U2"], "deep"), F("Third", ["U1", "U2"], "deep")],
      layout: "Two units front and back, each on three levels (the third within the roof)." },
    { key: "fourplex_01", name: "Fourplex 01", slug: "fourplex-01", role: "principal", units: 4, storeys: 2.5, gfa_m2: 374,
      footprint_m2: 134.1, width_m: 6.8, depth_m: 19.8, height_peak_m: 11.0, height_mid_m: 9.6,
      unit_list: [U("U1", 1, 1, { adaptable_alt: true }), U("U2", 1, 1, { adaptable_alt: true }), U("U3", 3, 2.5), U("U4", 3, 2.5)],
      floors: [F("Ground", ["U1", "U2"], "deep"), F("Second", ["U3", "U4"], "deep"), F("Third", ["U3", "U4"], "deep")],
      layout: "Two one-bedroom flats on the ground floor (adaptable versions U1a, U2a) under two three-bedroom units on the two floors above; drawn for narrow lots." },
    { key: "fourplex_02", name: "Fourplex 02", slug: "fourplex-02", role: "principal", units: 4, storeys: 3, gfa_m2: 556,
      footprint_m2: 197.1, width_m: 11.3, depth_m: 19.3, height_peak_m: 10.7, height_mid_m: 8.8,
      unit_list: [U("U1", 3, 2.5, { den: true }), U("U2", 3, 2.5, { den: true }), U("U3", 3, 2.5, { den: true }), U("U4", 3, 2.5, { den: true })],
      floors: [F("Ground", ["U1", "U2", "U3", "U4"], "grid"), F("Second", ["U1", "U2", "U3", "U4"], "grid"), F("Third", ["U1", "U2", "U3", "U4"], "grid")],
      layout: "Four three-storey units, two across by two deep." },
    { key: "rowhouse", name: "Rowhouse", slug: "rowhouse", role: "principal", units: 2, storeys: 2, gfa_m2: 253,
      footprint_m2: 122.9, width_m: 11.4, depth_m: 12.8, height_peak_m: 8.5, height_mid_m: 7.1,
      unit_list: [U("U1", 3, 2.5, { adaptable_alt: true }), U("U2", 3, 2.5, { adaptable_alt: true })],
      floors: [F("Ground", ["U1", "U2"]), F("Second", ["U1", "U2"])],
      layout: "Two side-by-side two-storey units of 5.7 m each (adaptable versions U1a, U2a); the row extends a unit at a time.",
      repeat: { unit_width_m: 5.7, unit_gfa_m2: 126.5, unit_footprint_m2: 61.45, max_units: 6 } },
    { key: "courtyard_sixplex", name: "Courtyard Sixplex", slug: "courtyard-sixplex", role: "courtyard", units: 6, gfa_m2: 577, footprint_m2: 212.9,
      front: { name: "Front building", storeys: 3, footprint_m2: 131.4, width_m: 12.5, depth_m: 11.1, height_peak_m: 11.0, height_mid_m: 9.7,
        unit_list: [U("U1", 1, 1, { adaptable_alt: true }), U("U2", 1, 1, { adaptable_alt: true }), U("U3", 3, 2.5), U("U4", 3, 2.5)],
        floors: [F("Ground", ["U1", "U2"]), F("Second", ["U3", "U4"]), F("Third", ["U3", "U4"])] },
      rear: { name: "Rear building", storeys: 2, footprint_m2: 81.5, width_m: 12.2, depth_m: 7.7, height_peak_m: 7.9, height_mid_m: 6.6,
        unit_list: [U("U5", 2, 1), U("U6", 2, 1)], floors: [F("Ground", ["U5", "U6"]), F("Second", ["U5", "U6"])] },
      layout: "A three-storey front building (two one-bedroom flats under two three-bedroom units) and a two-storey rear building of two two-bedroom units, across a courtyard." }
  ];
  function design(key) { return DESIGNS.filter(function (d) { return d.key === key; })[0] || null; }
  function url(d) { return BASE + d.slug; }

  // ------------------------------------------------------------------ blocks and checks
  // A block is one building of an option: the design (or one part of the sixplex) with the size it is placed at.
  function block(key, name, d, part, opts) {
    var src = part || d, b = { key: key, name: name, design: d, part: part ? part.name : null, width_m: src.width_m, depth_m: src.depth_m, storeys: src.storeys,
      height_m: src.height_peak_m, height_mid_m: src.height_mid_m, footprint_m2: src.footprint_m2, gfa_m2: part ? null : d.gfa_m2, units: part ? src.unit_list.length : d.units,
      unit_list: src.unit_list, floors: src.floors, rotated: false, n: null };
    if (opts) Object.keys(opts).forEach(function (k) { b[k] = opts[k]; });
    return b;
  }
  function rowBlock(d, n) {
    var r = d.repeat, units = [], floors = [];
    for (var i = 1; i <= n; i++) units.push(U("U" + i, d.unit_list[0].beds, d.unit_list[0].baths, { adaptable_alt: true }));
    d.floors.forEach(function (f) { floors.push(F(f.name, units.map(function (u) { return u.key; }), "across")); });
    return block("single", d.name + (n === 2 ? "" : " x " + n), d, null, { width_m: r.unit_width_m * n, footprint_m2: r.unit_footprint_m2 * n, gfa_m2: r.unit_gfa_m2 * n, units: n, unit_list: units, floors: floors, n: n });
  }
  function check(name, ok, detail, clause) { return { name: name, ok: !!ok, detail: detail, clause: clause || "" }; }
  function cl(rule) { return rule.clause.split(" ")[0]; }
  function mainChecks(ev, b, label) {
    var R = core.RULES, hm = R.max_height_m, out = [];
    out.push(check(label + " width", b.width_m <= ev.env_width + 1e-6, fmt(b.width_m, 2) + " m in a " + fmt(ev.env_width, 2) + " m envelope", cl(R.side_yard_m)));
    out.push(check(label + " depth", b.depth_m <= ev.env_depth + 1e-6, fmt(b.depth_m, 2) + " m in a " + fmt(ev.env_depth, 2) + " m envelope (max building depth " + R.max_depth_m.value + " m)", "3.1.2.9"));
    out.push(check(label + " storeys", b.storeys <= hm.storeys, b.storeys + " of " + hm.storeys + " storeys", cl(hm)));
    out.push(check(label + " height", b.height_m <= hm.value + 1e-6, "roof peak " + b.height_m + " m (mid-slope " + b.height_mid_m + " m) under " + hm.value + " m", cl(hm)));
    return out;
  }
  function rearChecks(ev, b, label) {
    var rh = M.FORM_RULES.rear_building_height_m, R = core.RULES, out = [];
    out.push(check(label + " width", b.width_m <= ev.env_width + 1e-6, fmt(b.width_m, 2) + " m in a " + fmt(ev.env_width, 2) + " m envelope", cl(R.side_yard_m)));
    out.push(check(label + " storeys", b.storeys <= rh.storeys, b.storeys + " of " + rh.storeys + " storeys for a rear building", cl(rh)));
    out.push(check(label + " height", b.height_m <= rh.value + 1e-6, "roof peak " + b.height_m + " m under " + rh.value + " m for a rear building", cl(rh)));
    return out;
  }
  function courtyardChecks(ev, frontDepth, rearDepth) {
    var FR = M.FORM_RULES, R = core.RULES, fy = R.front_yard_m.value, ry = FR.courtyard_rear_yard_m.value, sep = FR.courtyard_separation_m.value, cd = FR.courtyard_min_site_depth_m;
    var need = fy + frontDepth + sep + rearDepth + ry, out = [];
    out.push(check("site depth for a courtyard", ev.site_depth >= cd.value, "site " + fmt(ev.site_depth, 2) + " m, minimum " + cd.value + " m", cl(cd)));
    out.push(check("front + courtyard + rear", need <= ev.site_depth + 1e-6, "front yard " + fy + " + " + fmt(frontDepth, 2) + " + courtyard " + sep + " + " + fmt(rearDepth, 2) + " + rear yard " + ry + " = " + fmt(need, 2) + " m of " + fmt(ev.site_depth, 2) + " m", cl(FR.courtyard_separation_m)));
    return { checks: out, spare: ev.site_depth - need };
  }
  function siteChecks(ev, units, gfa) {
    var FR = M.FORM_RULES, band = ev.band, fsr = gfa / ev.area;
    return [check("units", units <= band.max_units, units + " units; this site's band allows up to " + band.max_units, cl(band)),
      check("floor area", fsr <= FR.fsr_max.value + 1e-6, "catalogue gross building area " + Math.round(gfa) + " m2 on " + Math.round(ev.area) + " m2 = FSR " + fmt(fsr, 2) + " (cap " + FR.fsr_max.value + "; the by-law's exclusions are not modelled)", FR.fsr_max.clause)];
  }
  function finish(o) {
    o.ok = o.checks.every(function (c) { return c.ok; });
    var bad = o.checks.filter(function (c) { return !c.ok; });
    o.reason = bad.length ? bad.map(function (c) { return c.name + ": " + c.detail + " [" + c.clause + "]"; }).join("; ") : "fits";
    o.units = o.blocks.reduce(function (n, b) { return n + b.units; }, 0);
    return o;
  }

  /* fits(ev): every option worth listing, fitting ones first (most units, then most floor area).
     Singles: each principal design as drawn (the rowhouse also at every longer row that fits). The catalogue's own
     courtyard sixplex. Each fitting principal plus an accessory unit as the rear building of a courtyard
     configuration. Side-by-side pairs of principals are listed only when they fit. */
  function fits(ev) {
    var out = { source: SOURCE, options: [], site: null };
    if (!ev || ev.status !== "ok") return out;
    var FR = M.FORM_RULES, gap = FR.side_separation_m.value;
    out.site = { env_width: ev.env_width, env_depth: ev.env_depth, site_depth: ev.site_depth, area: ev.area, max_units: ev.band.max_units };
    var principals = DESIGNS.filter(function (d) { return d.role === "principal"; }), adus = DESIGNS.filter(function (d) { return d.role === "accessory"; });
    var six = DESIGNS.filter(function (d) { return d.role === "courtyard"; })[0], singles = {};
    principals.forEach(function (d) {
      var ns = d.repeat ? [2] : [null];
      if (d.repeat) for (var n = 3; n <= Math.min(d.repeat.max_units, ev.band.max_units); n++) if (d.repeat.unit_width_m * n <= ev.env_width + 1e-6) ns.push(n);
      ns.forEach(function (n) {
        var b = n ? rowBlock(d, n) : block("single", d.name, d, null);
        var o = { key: d.key + (n && n !== 2 ? "_x" + n : ""), name: b.name, kind: "single", dims_like: "single", blocks: [b], gaps: [], checks: mainChecks(ev, b, "building").concat(siteChecks(ev, b.units, b.gfa_m2)) };
        out.options.push(finish(o));
        if (!n || n === 2) singles[d.key] = o;
      });
    });
    if (six) {
      var fb = block("front", six.front.name, six, six.front), rb = block("rear", six.rear.name, six, six.rear), cy = courtyardChecks(ev, fb.depth_m, rb.depth_m);
      var o6 = { key: six.key, name: six.name, kind: "courtyard", dims_like: "courtyard", blocks: [fb, rb], gaps: [], spare_depth: cy.spare,
        checks: cy.checks.concat(mainChecks(ev, fb, "front building"), rearChecks(ev, rb, "rear building"), siteChecks(ev, six.units, six.gfa_m2)) };
      out.options.push(finish(o6));
    }
    principals.forEach(function (d) {
      var base = singles[d.key];
      if (!base || !base.checks.slice(0, 4).every(function (c) { return c.ok; })) return;   // the principal itself must sit in the envelope
      adus.forEach(function (a) {
        var ab = block("rear", a.name, a, null), fbk = block("front", d.name, d, null), b0 = base.blocks[0];
        if (b0.n) ["name", "width_m", "footprint_m2", "gfa_m2", "units", "unit_list", "floors", "n"].forEach(function (k) { fbk[k] = b0[k]; });   // the rowhouse pair as drawn
        if (ab.width_m > ev.env_width + 1e-6 && ab.depth_m <= ev.env_width + 1e-6) { ab = block("rear", a.name + " (turned)", a, null, { width_m: a.depth_m, depth_m: a.width_m, rotated: true }); }
        var cy2 = courtyardChecks(ev, fbk.depth_m, ab.depth_m);
        var o = { key: d.key + "+" + a.key, name: d.name + " + " + a.name, kind: "front_rear", dims_like: "courtyard", blocks: [fbk, ab], gaps: [], spare_depth: cy2.spare,
          checks: cy2.checks.concat(rearChecks(ev, ab, "accessory unit"), siteChecks(ev, fbk.units + ab.units, fbk.gfa_m2 + ab.gfa_m2)) };
        out.options.push(finish(o));
      });
    });
    var pairs = principals.filter(function (d) { return !d.repeat; });
    pairs.forEach(function (d1, i) {
      pairs.forEach(function (d2, j) {
        if (j < i) return;
        var A = block("A", d1.name, d1, null), B = block("B", d2.name, d2, null), w = A.width_m + gap + B.width_m;
        var o = { key: d1.key + "|" + d2.key, name: d1.name + " beside " + d2.name, kind: "side_by_side", dims_like: "side_by_side", blocks: [A, B], gaps: [],
          checks: [check("two buildings across", w <= ev.env_width + 1e-6, fmt(A.width_m, 2) + " + " + gap + " + " + fmt(B.width_m, 2) + " = " + fmt(w, 2) + " m in a " + fmt(ev.env_width, 2) + " m envelope", cl(FR.side_separation_m))]
            .concat(mainChecks(ev, A, "building A").slice(1), mainChecks(ev, B, "building B").slice(1), siteChecks(ev, A.units + B.units, A.gfa_m2 + B.gfa_m2)) };
        finish(o);
        if (o.ok) out.options.push(o);
      });
    });
    out.options.sort(function (a, b) { return (b.ok - a.ok) || (b.units - a.units) || (optionGfa(b) - optionGfa(a)); });
    return out;
  }
  function optionGfa(o) { var g = o.blocks.reduce(function (s, b) { return s + (b.gfa_m2 || 0); }, 0); return g || o.blocks[0].design.gfa_m2; }

  // ------------------------------------------------------------------ geometry: the option as a form (same shape as R1Massing.formScheme)
  // Building points are ordered [front-side1, rear-side1, rear-side2, front-side2]: "front" faces the street (or,
  // for a rear building, the courtyard), side 1 is the envelope's side 1.
  function shrink(pts, w, ef, fromS1) {
    var W = M.quadDims(pts, ef)[0], d = ef.d, s = ((pts[3][0] - pts[0][0]) * d[0] + (pts[3][1] - pts[0][1]) * d[1]) > 0 ? 1 : -1;
    var d1 = fromS1 === undefined ? (W - w) / 2 : fromS1, d2 = W - w - d1;
    function mv(p, k) { return [p[0] + d[0] * s * k, p[1] + d[1] * s * k]; }
    return [mv(pts[0], d1), mv(pts[1], d1), mv(pts[2], -d2), mv(pts[3], -d2)];
  }
  function form(ev, o) {
    var R = core.RULES, FR = M.FORM_RULES, E = ev.edges, idx = ev.idx, f = idx.front, r = idx.rear, s1 = idx.side1, s2 = idx.side2;
    var fy = R.front_yard_m.value, sy = R.side_yard_m.value, ry = FR.courtyard_rear_yard_m.value, sep = FR.courtyard_separation_m.value, gap = FR.side_separation_m.value;
    var Ls1 = M.offsetLine(E[s1], sy), Ls2 = M.offsetLine(E[s2], sy), ef = E[f];
    var out = { scheme: "cmhc", dims_like: o.dims_like, name: "CMHC " + o.name, status: "ok", reason: null, buildings: [], gaps: [], labels: [], notes: [], params: {}, option: o };
    function frontStrip(t, depth) { return M.quad([M.offsetLine(E[f], t), Ls1, M.offsetLine(E[f], t + depth), Ls2]); }
    function rearStrip(t, depth) { return M.quad([M.offsetLine(E[r], t + depth), Ls1, M.offsetLine(E[r], t), Ls2]); }
    function add(b, pts, clause) { if (!pts) return; out.buildings.push(M.building(b.key, b.name, shrink(pts, b.width_m, ef), b.height_m, b.storeys, clause, ef)); }
    var ref = "CMHC " + o.blocks[0].design.name;
    if (o.kind === "single") add(o.blocks[0], frontStrip(fy, o.blocks[0].depth_m), ref);
    else if (o.kind === "courtyard" || o.kind === "front_rear") {
      var fb = o.blocks[0], rb = o.blocks[1];
      add(fb, frontStrip(fy, fb.depth_m), "CMHC " + fb.design.name);
      add(rb, rearStrip(ry, rb.depth_m), "CMHC " + rb.design.name + (rb.rotated ? ", turned" : ""));
      if (out.buildings.length === 2) {
        var sepNow = Math.min(M.distToLine(out.buildings[1].pts[0], [out.buildings[0].pts[1], ef.d]), M.distToLine(out.buildings[1].pts[3], [out.buildings[0].pts[2], ef.d]));
        out.gaps.push({ kind: "courtyard", name: "COURTYARD", value_m: sepNow, min_m: sep, clause: cl(FR.courtyard_separation_m) });
        out.gaps.push({ kind: "yard", name: "REAR YARD (courtyard)", value_m: ry, clause: cl(FR.courtyard_rear_yard_m) });
      }
    } else if (o.kind === "side_by_side") {
      var A = o.blocks[0], B = o.blocks[1], strip = frontStrip(fy, Math.max(A.depth_m, B.depth_m));
      if (strip) {
        var W = M.quadDims(strip, ef)[0], total = A.width_m + gap + B.width_m, x0 = (W - total) / 2;
        var sA = frontStrip(fy, A.depth_m), sB = frontStrip(fy, B.depth_m);
        out.buildings.push(M.building("A", A.name + " (A)", shrink(sA, A.width_m, ef, x0), A.height_m, A.storeys, "CMHC " + A.design.name, ef));
        out.buildings.push(M.building("B", B.name + " (B)", shrink(sB, B.width_m, ef, x0 + A.width_m + gap), B.height_m, B.storeys, "CMHC " + B.design.name, ef));
        out.gaps.push({ kind: "side", name: "GAP", value_m: gap, min_m: gap, clause: cl(FR.side_separation_m) });
      }
    }
    if (!out.buildings.length) { out.status = "not_feasible"; out.reason = "Adjacent lot lines are parallel; the catalogue block could not be placed."; return out; }
    out.notes.push("Catalogue: " + o.blocks.map(function (b) { return b.design.name + (b.part ? " (" + b.part.toLowerCase() + ")" : "") + " " + fmt(b.width_m, 1) + " x " + fmt(b.depth_m, 1) + " m, " + b.storeys + " storeys, " + b.units + " unit" + (b.units === 1 ? "" : "s"); }).join("; ") +
      ". Gross building area " + Math.round(optionGfa(o)) + " m2 = FSR " + fmt(optionGfa(o) / ev.area, 2) + " on this site. Blocks are drawn to the roof peak; the catalogue roofs are pitched.");
    out.notes.push("Placed centred between the side yards, the front building on the front yard line" + (o.blocks.length > 1 && o.kind !== "side_by_side" ? ", the rear building " + ry + " m off the lane" : "") + ". The catalogue plans set the unit mix; see the unit configuration.");
    if (o.kind !== "single") out.notes.push(FR.multiple_buildings.value + " for more than one principal building [" + FR.multiple_buildings.clause + "].");
    return out;
  }

  // ------------------------------------------------------------------ units: index, colours, volumes per floor
  function unitIndex(o) {
    var idx = {}, n = 0;
    o.blocks.forEach(function (b) { b.unit_list.forEach(function (u) { idx[u.key + "@" + b.key] = n++; }); });
    return idx;
  }
  function unitColor(o, unitKey, blockKey) { var i = unitIndex(o)[unitKey + "@" + blockKey]; return UNIT_COLORS[(i === undefined ? 0 : i) % UNIT_COLORS.length]; }
  function unitOf(b, key) { return b.unit_list.filter(function (u) { return u.key === key; })[0] || null; }
  // cells of one floor in the unit square: a across from side 1 (0..1), b deep from the front (0..1)
  function unitCells(units, split) {
    var n = units.length, cells = [];
    if (split === "grid" && n === 4) {
      [[0, 0.5, 0, 0.5], [0.5, 1, 0, 0.5], [0, 0.5, 0.5, 1], [0.5, 1, 0.5, 1]].forEach(function (c, i) { cells.push({ key: units[i], a0: c[0], a1: c[1], b0: c[2], b1: c[3] }); });
      return cells;
    }
    units.forEach(function (u, i) {
      if (split === "deep") cells.push({ key: u, a0: 0, a1: 1, b0: i / n, b1: (i + 1) / n });
      else cells.push({ key: u, a0: i / n, a1: (i + 1) / n, b0: 0, b1: 1 });
    });
    return cells;
  }
  function bilinear(pts, a, b) {
    var f = [pts[0][0] + (pts[3][0] - pts[0][0]) * a, pts[0][1] + (pts[3][1] - pts[0][1]) * a], r = [pts[1][0] + (pts[2][0] - pts[1][0]) * a, pts[1][1] + (pts[2][1] - pts[1][1]) * a];
    return [f[0] + (r[0] - f[0]) * b, f[1] + (r[1] - f[1]) * b];
  }
  /* unitVolumes(option, form): one box per unit per floor, in site coordinates, z from the building's own base
     (the app adds the ground level). Floors divide the roof-peak height equally. */
  function unitVolumes(o, form) {
    var out = [];
    o.blocks.forEach(function (b) {
      var bld = form.buildings.filter(function (x) { return x.key === b.key; })[0];
      if (!bld) return;
      var nf = b.floors.length, fh = b.height_m / nf;
      b.floors.forEach(function (f, fi) {
        unitCells(f.units, f.split).forEach(function (c) {
          var pts = [bilinear(bld.pts, c.a0, c.b0), bilinear(bld.pts, c.a0, c.b1), bilinear(bld.pts, c.a1, c.b1), bilinear(bld.pts, c.a1, c.b0)], u = unitOf(b, c.key);
          out.push({ block: b.key, block_name: b.name, unit: c.key, beds: u ? u.beds : null, baths: u ? u.baths : null, floor: f.name, floor_index: fi, pts: pts, z0: fi * fh, z1: (fi + 1) * fh,
            color: unitColor(o, c.key, b.key), area_m2: b.footprint_m2 * (c.a1 - c.a0) * (c.b1 - c.b0), centroid: site.centroid(pts) });
        });
      });
    });
    return out;
  }
  function unitAreas(o) {   // approximate floor area per unit: its share of the footprint on every floor it occupies
    var areas = {};
    o.blocks.forEach(function (b) { b.floors.forEach(function (f) { unitCells(f.units, f.split).forEach(function (c) { var k = c.key + "@" + b.key; areas[k] = (areas[k] || 0) + b.footprint_m2 * (c.a1 - c.a0) * (c.b1 - c.b0); }); }); });
    return areas;
  }

  // ------------------------------------------------------------------ tables, report, diagrams
  function fitRows(res) {
    return res.options.map(function (o) {
      var size = o.blocks.map(function (b) { return fmt(b.width_m, 1) + " x " + fmt(b.depth_m, 1) + " m / " + b.storeys + " st"; }).join(" + ");
      return { option: o, cells: [o.name, String(o.units), size, o.ok ? "fits" : o.reason], ok: o.ok };
    });
  }
  function unitMix(o) {
    var beds = {};
    o.blocks.forEach(function (b) { b.unit_list.forEach(function (u) { var k = u.beds + "-bed"; beds[k] = (beds[k] || 0) + 1; }); });
    return Object.keys(beds).sort().map(function (k) { return beds[k] + " x " + k; }).join(", ");
  }
  function fitLines(res, ev) {
    var L = ["CMHC CATALOGUE FIT (" + SOURCE.name + ", accessed " + SOURCE.accessed + ")"];
    if (res.site) L.push("  Envelope " + fmt(res.site.env_width, 2) + " x " + fmt(res.site.env_depth, 2) + " m on a " + fmt(res.site.site_depth, 2) + " m deep site of " + Math.round(res.site.area) + " m2; band allows " + res.site.max_units + " units.");
    res.options.forEach(function (o) {
      L.push("  " + (o.ok ? "FITS   " : "no fit ") + o.name + ": " + o.units + " units (" + unitMix(o) + "), GFA " + Math.round(optionGfa(o)) + " m2");
      if (!o.ok) L.push("         " + o.reason);
    });
    L.push("  " + SOURCE.note);
    return L;
  }
  /* unitRows: one row per unit with its colour: [swatch colour, unit, bedrooms, bathrooms, floors, approx area, note] */
  function unitRows(o) {
    var rows = [], areas = unitAreas(o);
    o.blocks.forEach(function (b) {
      b.unit_list.forEach(function (u) {
        var floors = b.floors.filter(function (f) { return f.units.indexOf(u.key) >= 0; }).map(function (f) { return f.name; }).join(" + ");
        rows.push({ color: unitColor(o, u.key, b.key), cells: [(o.blocks.length > 1 ? b.name + ": " : "") + u.key, u.beds + " bed" + (u.den ? " + den" : ""), u.baths + " bath", floors,
          "~" + Math.round(areas[u.key + "@" + b.key] || 0) + " m2", u.adaptable_alt ? "adaptable version " + u.key + "a" : ""] });
      });
    });
    return rows;
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  /* unitSvg: the stack of floors per building, one coloured cell per unit (a section-like diagram). */
  function unitSvg(o) {
    var k = 12, fh = 20, pad = 6, gapPx = 26, x = pad, parts = [], height = 0;
    o.blocks.forEach(function (b) { height = Math.max(height, b.floors.length * fh + 34); });
    o.blocks.forEach(function (b) {
      var w = Math.max(b.width_m * k, 60), y0 = pad + 14;
      parts.push('<text x="' + x + '" y="' + (y0 - 4) + '" class="sectitle" font-size="10">' + esc(b.name) + " (" + fmt(b.width_m, 1) + " m wide)</text>");
      b.floors.slice().reverse().forEach(function (f, i) {
        var y = y0 + i * fh, cells = unitCells(f.units, f.split), across = f.split === "grid" ? 2 : (f.split === "deep" ? 1 : cells.length);
        if (f.split === "deep") {   // units behind one another: show them as stripes of the same cell
          var uw = w / cells.length;
          cells.forEach(function (c, j) { parts.push('<rect x="' + (x + j * uw) + '" y="' + y + '" width="' + uw + '" height="' + fh + '" fill="' + unitColor(o, c.key, b.key) + '" stroke="#ffffff" stroke-width="1"/>'); if (uw > 22) parts.push('<text x="' + (x + j * uw + uw / 2) + '" y="' + (y + fh / 2 + 3.5) + '" text-anchor="middle" font-size="9" fill="#ffffff" font-weight="600">' + esc(c.key) + "</text>"); });
        } else {
          var rows = Math.ceil(cells.length / across), cw = w / across, ch = fh / rows;
          cells.forEach(function (c, j) { var cx = x + (j % across) * cw, cy = y + Math.floor(j / across) * ch; parts.push('<rect x="' + cx + '" y="' + cy + '" width="' + cw + '" height="' + ch + '" fill="' + unitColor(o, c.key, b.key) + '" stroke="#ffffff" stroke-width="1"/>'); if (cw > 22 && ch > 9) parts.push('<text x="' + (cx + cw / 2) + '" y="' + (cy + ch / 2 + 3) + '" text-anchor="middle" font-size="' + (ch > 14 ? 9 : 7) + '" fill="#ffffff" font-weight="600">' + esc(c.key) + "</text>"); });
        }
        parts.push('<text x="' + (x + w + 4) + '" y="' + (y + fh / 2 + 3.5) + '" font-size="9" class="sectitle">' + esc(f.name) + "</text>");
      });
      x += w + 52 + gapPx;
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + x + '" height="' + (height + pad) + '" viewBox="0 0 ' + x + " " + (height + pad) + '" role="img" aria-label="Unit configuration by floor">' + parts.join("") + "</svg>";
  }
  /* floorPlansSvg: schematic plans of every floor of every block, the street (or courtyard) at the bottom, one
     coloured cell per unit with its key, bedrooms and approximate area. Room layouts are the catalogue's. */
  function floorPlansSvg(o) {
    var k = 9, pad = 16, gapX = 34, parts = [], y = pad, width = 0, areas = unitAreas(o);
    o.blocks.forEach(function (b, bi) {
      var W = b.width_m * k, D = b.depth_m * k, x = pad, y0 = y + 16;
      parts.push('<text x="' + x + '" y="' + (y + 4) + '" font-size="11" font-weight="600" fill="#2c3e50">' + esc(b.name) + ": " + fmt(b.width_m, 1) + " x " + fmt(b.depth_m, 1) + " m, " + b.storeys + " storeys, " + b.units + " unit" + (b.units === 1 ? "" : "s") + "</text>");
      b.floors.forEach(function (f, fi) {
        var x0 = x + fi * (W + gapX);
        unitCells(f.units, f.split).forEach(function (c) {
          var u = unitOf(b, c.key), cx = x0 + c.a0 * W, cw = (c.a1 - c.a0) * W, ch = (c.b1 - c.b0) * D, cy = y0 + D - c.b1 * D, col = unitColor(o, c.key, b.key);
          parts.push('<rect x="' + cx + '" y="' + cy + '" width="' + cw + '" height="' + ch + '" fill="' + col + '" fill-opacity="0.85" stroke="#ffffff" stroke-width="1.5"/>');
          var lines = [c.key, u ? u.beds + " bed / " + u.baths + " bath" : "", "~" + Math.round(b.footprint_m2 * (c.a1 - c.a0) * (c.b1 - c.b0)) + " m2 this floor"];
          if (ch > 40 && cw > 44) lines.forEach(function (t, li) { parts.push('<text x="' + (cx + cw / 2) + '" y="' + (cy + ch / 2 - 8 + li * 11) + '" text-anchor="middle" font-size="' + (li ? 8 : 10) + '" font-weight="' + (li ? 400 : 700) + '" fill="#ffffff">' + esc(t) + "</text>"); });
          else if (cw > 18) parts.push('<text x="' + (cx + cw / 2) + '" y="' + (cy + ch / 2 + 3) + '" text-anchor="middle" font-size="9" font-weight="700" fill="#ffffff">' + esc(c.key) + "</text>");
          // entries on the front face
          if (c.b0 === 0) parts.push('<path d="M ' + (cx + cw / 2 - 4) + " " + (y0 + D + 1) + " l 4 -6 l 4 6 z\" fill=\"#c81e1e\"/>");
        });
        parts.push('<rect x="' + x0 + '" y="' + y0 + '" width="' + W + '" height="' + D + '" fill="none" stroke="#2c3e50" stroke-width="1.5"/>');
        parts.push('<text x="' + (x0 + W / 2) + '" y="' + (y0 + D + 22) + '" text-anchor="middle" font-size="10" fill="#2c3e50">' + esc(f.name) + " floor</text>");
        parts.push('<text x="' + (x0 + W / 2) + '" y="' + (y0 + D + 34) + '" text-anchor="middle" font-size="8" fill="#6b7280" letter-spacing="1">' + (b.key === "rear" ? "COURTYARD SIDE" : "STREET SIDE") + "</text>");
        width = Math.max(width, x0 + W + pad);
      });
      // dimensions beside the first plan
      parts.push('<text x="' + (x - 4) + '" y="' + (y0 + D / 2) + '" text-anchor="end" font-size="8" fill="#6b7280" transform="rotate(-90 ' + (x - 4) + " " + (y0 + D / 2) + ')">' + fmt(b.depth_m, 1) + " m</text>");
      y = y0 + D + 52;
    });
    var totalW = Math.max(width, 240), totalH = y;
    var legend = o.blocks.map(function (b) { return b.unit_list.map(function (u) { return '<span style="display:inline-block;width:10px;height:10px;background:' + unitColor(o, u.key, b.key) + ';margin:0 4px 0 8px;vertical-align:middle"></span>' + esc(u.key) + " " + u.beds + " bed, ~" + Math.round(areas[u.key + "@" + b.key] || 0) + " m2"; }).join(""); }).join("");
    return { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="' + totalW + '" height="' + totalH + '" viewBox="0 0 ' + totalW + " " + totalH + '" role="img" aria-label="Schematic floor plans">' + parts.join("") + "</svg>", legend: legend, width: totalW, height: totalH };
  }

  return { SOURCE: SOURCE, DESIGNS: DESIGNS, UNIT_COLORS: UNIT_COLORS, design: design, url: url, fits: fits, form: form, fitRows: fitRows, fitLines: fitLines,
    unitRows: unitRows, unitSvg: unitSvg, unitMix: unitMix, optionGfa: optionGfa, unitColor: unitColor, unitVolumes: unitVolumes, unitAreas: unitAreas, floorPlansSvg: floorPlansSvg };
})();
