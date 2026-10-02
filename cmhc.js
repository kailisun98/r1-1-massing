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
  function url(d) { return d && d.slug ? BASE + d.slug : null; }

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
  var NON_DWELLING_COLOR = "#8d949c", CORE_COLOR = "#b7bdc5", CORE_KEY = "CORE";
  function blockOf(o, blockKey) { return o.blocks.filter(function (b) { return b.key === blockKey; })[0] || null; }
  function unitColor(o, unitKey, blockKey) {
    if (unitKey === CORE_KEY) return CORE_COLOR;
    var b = blockOf(o, blockKey), u = b ? unitOf(b, unitKey) : null;
    if (u && u.kind) return NON_DWELLING_COLOR;   // a common room, store or day care is not a dwelling
    var i = unitIndex(o)[unitKey + "@" + blockKey]; return UNIT_COLORS[(i === undefined ? 0 : i) % UNIT_COLORS.length];
  }
  function unitOf(b, key) { return b.unit_list.filter(function (u) { return u.key === key; })[0] || null; }
  // the across spans the columns of a floor occupy: the whole width, or either side of the stair core band
  function spans(nc, core) {
    if (!core) { var s = []; for (var i = 0; i < nc; i++) s.push([i / nc, (i + 1) / nc]); return s; }
    if (nc === 1) return [[core.a1, 1]];
    if (nc === 2) return [[0, core.a0], [core.a1, 1]];
    var out = []; for (var j = 0; j < nc; j++) out.push([j / nc, (j + 1) / nc]); return out;   // more columns than a core allows: the core is ignored
  }
  // cells of one floor in the unit square: a across from side 1 (0..1), b deep from the front (0..1);
  // "grid" lays the units out row by row, `cols` across (2 unless the floor says otherwise), front row first;
  // with a core band (floor.core = {a0, a1}) the columns sit either side of it
  function unitCells(units, split, cols, core) {
    var n = units.length, cells = [];
    if (split === "grid") {
      var nc = Math.max(1, cols || 2), nr = Math.ceil(n / nc), sp = spans(nc, core);
      units.forEach(function (u, i) { var col = i % nc, row = Math.floor(i / nc); cells.push({ key: u, a0: sp[col][0], a1: sp[col][1], b0: row / nr, b1: (row + 1) / nr }); });
    } else {
      var sp2 = spans(split === "deep" ? 1 : n, core);
      units.forEach(function (u, i) {
        if (split === "deep") cells.push({ key: u, a0: sp2[0][0], a1: sp2[0][1], b0: i / n, b1: (i + 1) / n });
        else cells.push({ key: u, a0: sp2[i][0], a1: sp2[i][1], b0: 0, b1: 1 });
      });
    }
    if (core) cells.forEach(function (c) { if (Math.abs(c.a1 - core.a0) < 1e-6) c.core_right = true; if (Math.abs(c.a0 - core.a1) < 1e-6) c.core_left = true; });   // the cell's side on the core's corridor
    return cells;
  }
  function coreCell(f) { return f.core ? { key: CORE_KEY, a0: f.core.a0, a1: f.core.a1, b0: 0, b1: 1 } : null; }
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
        var cells = unitCells(f.units, f.split, f.cols, f.core), cc = coreCell(f);
        if (cc) cells.push(cc);
        cells.forEach(function (c) {
          var pts = [bilinear(bld.pts, c.a0, c.b0), bilinear(bld.pts, c.a0, c.b1), bilinear(bld.pts, c.a1, c.b1), bilinear(bld.pts, c.a1, c.b0)], u = unitOf(b, c.key), isCore = c.key === CORE_KEY;
          out.push({ block: b.key, block_name: b.name, unit: c.key, kind: isCore ? "core" : (u && u.kind ? u.kind : null), beds: u ? u.beds : null, baths: u ? u.baths : null, floor: f.name, floor_index: fi, pts: pts, z0: fi * fh, z1: (fi + 1) * fh,
            color: unitColor(o, c.key, b.key), area_m2: b.footprint_m2 * (c.a1 - c.a0) * (c.b1 - c.b0), centroid: site.centroid(pts) });
        });
      });
    });
    return out;
  }
  function unitAreas(o) {   // approximate floor area per unit: its share of the footprint on every floor it occupies
    var areas = {};
    o.blocks.forEach(function (b) { b.floors.forEach(function (f) { unitCells(f.units, f.split, f.cols, f.core).forEach(function (c) { var k = c.key + "@" + b.key; areas[k] = (areas[k] || 0) + b.footprint_m2 * (c.a1 - c.a0) * (c.b1 - c.b0); }); }); });
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
    var beds = {}, extra = [];
    o.blocks.forEach(function (b) { b.unit_list.forEach(function (u) { if (u.kind) { extra.push(u.name.toLowerCase()); return; } var k = u.beds ? u.beds + "-bed" : "studio"; beds[k] = (beds[k] || 0) + 1; }); });
    return Object.keys(beds).sort().map(function (k) { return beds[k] + " x " + k; }).join(", ") + (extra.length ? " + " + extra.join(", ") : "");
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
        rows.push({ color: unitColor(o, u.key, b.key), kind: u.kind || null, cells: [(o.blocks.length > 1 ? b.name + ": " : "") + u.key + (u.kind ? " " + u.name : ""),
          u.kind ? "not a dwelling" : (u.beds ? u.beds + " bed" : "studio") + (u.den ? " + den" : ""), u.kind ? "" : u.baths + " bath", floors,
          "~" + Math.round(areas[u.key + "@" + b.key] || 0) + " m2", u.adaptable_alt ? "adaptable version " + u.key + "a" : (u.upgraded ? "2-bed to meet 2.2.8" : "")] });
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
        var y = y0 + i * fh, cells = unitCells(f.units, f.split, f.cols, f.core), across = f.split === "grid" ? Math.max(1, f.cols || 2) : (f.split === "deep" ? 1 : cells.length);
        if (f.core) parts.push('<rect x="' + (x + f.core.a0 * w) + '" y="' + y + '" width="' + ((f.core.a1 - f.core.a0) * w) + '" height="' + fh + '" fill="' + CORE_COLOR + '" stroke="#ffffff" stroke-width="1"/>');
        if (f.split === "deep") {   // units behind one another: show them as stripes of the same cell
          var uw = (f.core ? (1 - f.core.a1) * w : w) / cells.length, ux = x + (f.core ? f.core.a1 * w : 0);
          cells.forEach(function (c, j) { parts.push('<rect x="' + (ux + j * uw) + '" y="' + y + '" width="' + uw + '" height="' + fh + '" fill="' + unitColor(o, c.key, b.key) + '" stroke="#ffffff" stroke-width="1"/>'); if (uw > 22) parts.push('<text x="' + (ux + j * uw + uw / 2) + '" y="' + (y + fh / 2 + 3.5) + '" text-anchor="middle" font-size="9" fill="#ffffff" font-weight="600">' + esc(c.key) + "</text>"); });
        } else {
          var rows = Math.ceil(cells.length / across), ch = fh / rows;
          cells.forEach(function (c, j) { var cx = x + c.a0 * w, cw = (c.a1 - c.a0) * w, cy = y + Math.floor(j / across) * ch; parts.push('<rect x="' + cx + '" y="' + cy + '" width="' + cw + '" height="' + ch + '" fill="' + unitColor(o, c.key, b.key) + '" stroke="#ffffff" stroke-width="1"/>'); if (cw > 22 && ch > 9) parts.push('<text x="' + (cx + cw / 2) + '" y="' + (cy + ch / 2 + 3) + '" text-anchor="middle" font-size="' + (ch > 14 ? 9 : 7) + '" fill="#ffffff" font-weight="600">' + esc(c.key) + "</text>"); });
        }
        parts.push('<text x="' + (x + w + 4) + '" y="' + (y + fh / 2 + 3.5) + '" font-size="9" class="sectitle">' + esc(f.name) + "</text>");
      });
      x += w + 52 + gapPx;
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + x + '" height="' + (height + pad) + '" viewBox="0 0 ' + x + " " + (height + pad) + '" role="img" aria-label="Unit configuration by floor">' + parts.join("") + "</svg>";
  }
  // ------------------------------------------------------------------ rooms: a schematic programme per unit level
  /* A unit's levels get roles: a one-level unit is a "flat"; a two-level unit has a "living" level (entry, stair,
     living, dining, kitchen, powder room) under a "bedroom" level; a three-level unit adds an "entry" level with
     the den below (townhouse) or, for the duplex whose third level is in the roof, an "attic" level above. Each
     role is a list of bands from the street side back, each band split across the width. Fractions of the unit. */
  /* levelRoles(nLevels, design, aboveGrade): as the catalogue arranges them: a two-level unit entered at grade has its
     living level below its bedroom level (Rowhouse, Duplex, the Sixplex's rear units); one entered above grade from an
     exterior stair has its bedrooms on the entry level and the living level, with its terrace, on top (Fourplex 01,
     the Sixplex's U3 and U4); a three-level unit has living, bedrooms, then a last bedroom with a terrace in the roof
     (Duplex, Fourplex 02). */
  function levelRoles(nLevels, design, aboveGrade) {
    if (nLevels >= 3) return ["living", "bedroom", "attic"];
    if (nLevels === 2) return aboveGrade ? ["bedroom", "living"] : ["living", "bedroom"];
    return ["flat"];
  }
  // how many bedrooms a level should hold: all of them on the bedroom level, one in the attic (the bedroom level then holds the rest)
  function bedsOnLevel(u, roles, li) {
    var beds = u ? u.beds : 1, role = roles[li];
    if (role === "bedroom") return roles.indexOf("attic") >= 0 ? Math.max(1, beds - 1) : beds;
    if (role === "attic") return beds >= 1 ? 1 : 0;
    return 0;
  }
  function bedsLabel(beds) { return beds ? beds + " BED" : "STUDIO"; }
  function programme(role, u) {
    var beds = u ? u.beds : 1, baths = u ? u.baths : 1, den = !!(u && u.den);
    if (role === "flat") return beds >= 2
      ? [[0, 0.36, [["Entry", 0.22], ["Living", 0.78]]], [0.36, 0.6, [["Kitchen", 0.42], ["Dining", 0.34], ["Bath", 0.24]]], [0.6, 1, [["Bedroom 1", 0.5], ["Bedroom 2", 0.32], ["Laundry", 0.18]]]]
      : [[0, 0.38, [["Entry", 0.28], ["Living", 0.72]]], [0.38, 0.62, [["Kitchen", 0.5], ["Dining", 0.5]]], [0.62, 1, [["Bedroom", 0.56], ["Bath", 0.26], ["Laundry", 0.18]]]];
    if (role === "living") return [[0, 0.42, [["Entry", 0.2], ["Stair", 0.16], ["Living", 0.64]]], [0.42, 0.68, [["Dining", 0.58], ["WC", 0.18], ["Storage", 0.24]]], [0.68, 1, [["Kitchen", 1]]]];
    if (role === "entry") return [[0, 0.45, [["Entry", 0.28], ["Stair", 0.18], [den ? "Den" : "Flex room", 0.54]]], [0.45, 0.72, [["Bath", 0.34], ["Storage", 0.36], ["Mechanical", 0.3]]], [0.72, 1, [["Patio", 1]]]];
    if (role === "bedroom") {
      var back = beds >= 3 ? [["Bedroom 2", 0.5], ["Bedroom 3", 0.5]] : (beds === 2 ? [["Bedroom 2", 0.62], ["Storage", 0.38]] : [["Study", 0.62], ["Storage", 0.38]]);
      var mid = baths >= 2 ? [["Stair", 0.26], ["Hall", 0.22], ["Laundry", 0.22], ["Bath", 0.3]] : [["Stair", 0.3], ["Hall", 0.32], ["Laundry", 0.38]];
      return [[0, 0.4, [["Primary bedroom", 0.62], [baths >= 2 ? "Ensuite" : "Bath", 0.38]]], [0.4, 0.62, mid], [0.62, 1, back]];
    }
    if (role === "attic") return [[0, 0.48, [["Bedroom 3", 0.6], ["Bath", 0.4]]], [0.48, 0.68, [["Stair", 0.35], ["Hall", 0.65]]], [0.68, 1, [[den ? "Den" : "Study", 0.5], ["Terrace", 0.5]]]];
    if (role === "common") return [[0, 0.3, [["Entry", 0.3], ["Lobby, mail", 0.7]]], [0.3, 1, [["Common room", 0.68], ["Kitchenette", 0.17], ["WC", 0.15]]]];
    if (role === "shop") return [[0, 0.64, [["Shop floor", 1]]], [0.64, 1, [["Back of house", 0.55], ["WC", 0.15], ["Storage", 0.3]]]];
    if (role === "daycare") return [[0, 0.55, [["Entry", 0.24], ["Play room", 0.76]]], [0.55, 1, [["Nap room", 0.4], ["Kitchen", 0.25], ["WC", 0.15], ["Office", 0.2]]]];
    return [[0, 1, [["Unit", 1]]]];
  }
  // rooms of one unit level in unit metres: x across from the unit's left, y from the street side back
  function rooms(role, u, w, d) {
    var out = [];
    programme(role, u).forEach(function (band) {
      var x = 0;
      band[2].forEach(function (r) { out.push({ name: r[0], x: x, y: band[0] * d, w: r[1] * w, h: (band[1] - band[0]) * d, area_m2: r[1] * w * (band[1] - band[0]) * d }); x += r[1] * w; });
    });
    return out;
  }
  /* unitRooms(option): every room of every unit on every floor, in unit-local metres with the cell it sits in.
     The layouts put the entry at the front-left of the unit; a unit entered from the rear walkway (or the right
     side path) is flipped so that its entry sits on the face it is reached from (R1Access decides the face). */
  function unitRooms(o) {
    var out = [], ap = (typeof R1Access !== "undefined") ? R1Access.plan(o) : null;
    function r2(v) { return Math.round(v * 100) / 100; }
    o.blocks.forEach(function (b) {
      var levelsOf = {};
      b.floors.forEach(function (f, fi) { f.units.forEach(function (k) { (levelsOf[k] || (levelsOf[k] = [])).push(fi); }); });
      var nf = b.floors.length, fh = b.height_m / nf;
      b.floors.forEach(function (f, fi) {
        if (f.core) {   // the shared stair core: vestibule and corridor on the ground, landing and corridor above, one straight stair
          var cwm = f.core.width_m || (f.core.a1 - f.core.a0) * b.width_m, coreRooms = (typeof R1Rooms !== "undefined") ? R1Rooms.layout("core", null, cwm, b.depth_m, R1Rooms.unitCtx(cwm, b.depth_m, { fh: fh, level: fi, levels: nf })) : [{ name: "Core", x: 0, y: 0, w: cwm, h: b.depth_m, area_m2: cwm * b.depth_m }];
          out.push({ block: b.key, unit: CORE_KEY, floor: f.name, floor_index: fi, level_index: fi, levels: nf, role: "core", cell: coreCell(f), width_m: cwm, depth_m: b.depth_m, rooms: coreRooms, entry_face: fi === 0 ? "front" : null, entry_floor: 0, walkway: false, core: true });
        }
        unitCells(f.units, f.split, f.cols, f.core).forEach(function (c) {
          var cw = (c.a1 - c.a0) * b.width_m, cd = (c.b1 - c.b0) * b.depth_m;
          var u = unitOf(b, c.key), lv = levelsOf[c.key], li = lv.indexOf(fi), roles = u && u.kind ? [u.kind] : levelRoles(lv.length, b.design, lv[0] > 0 && cd >= 8.4), role = roles[li] || "flat";   // a shallow upper unit keeps its living level at its entry
          var ent = ap ? ap.entries[c.key + "@" + b.key] : null, face = ent ? ent.face : null;
          // which faces of the unit are exterior, in the unit's own frame (its entry face in front)
          var ext = { front: c.b0 < 0.02, rear: c.b1 > 0.98, left: c.a0 < 0.02, right: c.a1 > 0.98 };
          var win = face === "rear" ? { front: ext.rear, back: ext.front, left: ext.left, right: ext.right } : (face === "right" ? { front: ext.front, back: ext.rear, left: ext.right, right: ext.left } : { front: ext.front, back: ext.rear, left: ext.left, right: ext.right });
          // a wide, shallow one-level flat entered from a side face (the rear cell of two stacked flats, reached by the side
          // path) is laid out across its depth and transposed, so that its entry sits on that face: the shallow template
          // puts the entry between two bedrooms, away from the sides
          // a wide flat entered from a side face carries its entry in the wing on that side (R1Rooms.flatWide); a narrower one is
          // laid out across its depth and transposed so its entry sits on that face
          var sideFace = (face === "left" || face === "right") && lv.length === 1 && role === "flat", wide = cw >= 9.6 && cd >= 6.2, side = sideFace && !wide && cw > cd + 0.5;
          if (side) win = face === "left" ? { front: ext.left, back: ext.right, left: ext.front, right: ext.rear } : { front: ext.right, back: ext.left, left: ext.front, right: ext.rear };
          var lw = side ? cd : cw, ld = side ? cw : cd;
          // rooms: the layout engine (standard test fits, the same stair on every level of a unit) when it is loaded, else the band programme
          var rs = (typeof R1Rooms !== "undefined") ? R1Rooms.layout(role, u, lw, ld, R1Rooms.unitCtx(lw, ld, { fh: b.height_m / b.floors.length, win: win, walk: !!(ent && ent.walkway), entry: sideFace && wide ? face : "front", level: li, levels: lv.length, beds: u && u.kind ? 0 : bedsOnLevel(u, roles, li) })) : rooms(role, u, lw, ld);
          if (side) rs = rs.map(function (r) { return Object.assign({}, r, { x: r.y, y: r.x, w: r.h, h: r.w }); });
          if (face === "rear") rs = rs.map(function (r) { return Object.assign({}, r, { y: r2(cd - r.y - r.h) }); });
          if (face === "right") rs = rs.map(function (r) { return Object.assign({}, r, { x: r2(cw - r.x - r.w) }); });
          out.push({ block: b.key, unit: c.key, floor: f.name, floor_index: fi, level_index: li, levels: lv.length, role: role, cell: c, width_m: cw, depth_m: cd, rooms: rs,
            entry_face: face, entry_floor: ent ? ent.floor_index : lv[0], walkway: !!(ent && ent.walkway), core: !!(ent && ent.core) });
        });
      });
    });
    return out;
  }

  /* floorPlansSvg(option, opts): schematic plans, the street (or courtyard) side at the bottom, each unit in its
     colour with its rooms drawn and named, entries marked on the level a unit is entered on. opts: k px per metre
     (default 13), floors: names to draw (default all), block: one block key (default all), oneBlock: layout the
     floors of each block in a row (default) or wrap. Returns svg, legend html, width, height. */
  function floorPlansSvg(o, opts) {
    opts = opts || {};
    var k = opts.k || 13, pad = 18, gapX = Math.round(k * 2.4), parts = [], y = pad, width = 0, areas = unitAreas(o), byCell = {}, fs = Math.max(6.5, k * 0.58), fs2 = Math.max(5.5, k * 0.5);
    unitRooms(o).forEach(function (r) { byCell[r.block + "|" + r.floor_index + "|" + r.unit] = r; });
    function darker(hex) { var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return "rgb(" + Math.round(r * 0.6) + "," + Math.round(g * 0.6) + "," + Math.round(b * 0.6) + ")"; }
    o.blocks.forEach(function (b) {
      if (opts.block && b.key !== opts.block) return;
      var floors = b.floors.map(function (f, i) { return { f: f, i: i }; }).filter(function (x) { return !opts.floors || opts.floors.indexOf(x.f.name) >= 0; });
      if (!floors.length) return;
      var W = b.width_m * k, D = b.depth_m * k, x = pad + 16, y0 = y + 20;
      parts.push('<text x="' + x + '" y="' + (y + 4) + '" font-size="' + (fs + 2) + '" font-weight="600" fill="#2c3e50">' + esc(b.name) + ": " + fmt(b.width_m, 1) + " x " + fmt(b.depth_m, 1) + " m, " + b.storeys + " storeys, " + b.units + " unit" + (b.units === 1 ? "" : "s") + "</text>");
      floors.forEach(function (fx, col) {
        var f = fx.f, fi = fx.i, x0 = x + col * (W + gapX);
        unitCells(f.units, f.split, f.cols).forEach(function (c) {
          var u = unitOf(b, c.key), cx = x0 + c.a0 * W, cw = (c.a1 - c.a0) * W, ch = (c.b1 - c.b0) * D, cy = y0 + D - c.b1 * D, colr = unitColor(o, c.key, b.key), ur = byCell[b.key + "|" + fi + "|" + c.key];
          parts.push('<rect x="' + cx + '" y="' + cy + '" width="' + cw + '" height="' + ch + '" fill="' + colr + '" fill-opacity="0.3"/>');
          if (ur) ur.rooms.forEach(function (r) {
            var rx = cx + r.x * k, rw = r.w * k, rh = r.h * k, ry = cy + ch - (r.y + r.h) * k, stair = r.name === "Stair", outdoor = r.name === "Terrace" || r.name === "Patio";
            parts.push('<rect x="' + rx + '" y="' + ry + '" width="' + rw + '" height="' + rh + '" fill="#ffffff" fill-opacity="' + (outdoor ? 0.25 : 0.55) + '" stroke="' + darker(colr) + '" stroke-width="0.8"' + (outdoor ? ' stroke-dasharray="3 2"' : "") + "/>");
            if (stair) for (var s = 1; s < 6; s++) parts.push('<line x1="' + rx + '" y1="' + (ry + rh * s / 6) + '" x2="' + (rx + rw) + '" y2="' + (ry + rh * s / 6) + '" stroke="' + darker(colr) + '" stroke-width="0.6"/>');
            if (rw >= fs * 3.4 && rh >= fs * 1.8) {
              var short = rw < fs * 6 ? r.name.replace("Primary bedroom", "Primary bed").replace("Mechanical", "Mech.").replace("Flex room", "Flex").replace("Back of house", "Back") : r.name;
              parts.push('<text x="' + (rx + rw / 2) + '" y="' + (ry + rh / 2 + (rh >= fs * 4 ? -1 : fs * 0.4)) + '" text-anchor="middle" font-size="' + fs + '" fill="#2c3e50">' + esc(short) + "</text>");
              if (rh >= fs * 4 && rw >= fs * 4.5) parts.push('<text x="' + (rx + rw / 2) + '" y="' + (ry + rh / 2 + fs * 1.2) + '" text-anchor="middle" font-size="' + fs2 + '" fill="#6b7280">' + Math.round(r.area_m2) + " m2</text>");
            }
          });
          parts.push('<rect x="' + cx + '" y="' + cy + '" width="' + cw + '" height="' + ch + '" fill="none" stroke="' + darker(colr) + '" stroke-width="1.6"/>');
          var tagW = Math.min(cw - 4, fs * 4.4);
          parts.push('<rect x="' + (cx + 2) + '" y="' + (cy + 2) + '" width="' + tagW + '" height="' + (fs * 1.5) + '" rx="2" fill="' + colr + '"/>');
          parts.push('<text x="' + (cx + 4) + '" y="' + (cy + 2 + fs * 1.1) + '" font-size="' + fs + '" font-weight="700" fill="#ffffff">' + esc(c.key) + "</text>");
          if (u && cw > tagW + fs * 8) parts.push('<text x="' + (cx + tagW + 6) + '" y="' + (cy + 2 + fs * 1.1) + '" font-size="' + fs2 + '" fill="#2c3e50">' + (u.kind ? esc(u.name) : u.beds + " bed / " + u.baths + " bath") + "</text>");
          if (ur && ur.level_index === 0) {
            if (c.b0 === 0) parts.push('<path d="M ' + (cx + cw * 0.12) + " " + (y0 + D + 1) + ' l 4 -7 l 4 7 z" fill="#c81e1e"/>');
            else parts.push('<path d="M ' + (cx - 1) + " " + (cy + ch * 0.8) + ' l -7 -4 l 0 8 z" fill="#c81e1e"/>');
          }
        });
        parts.push('<rect x="' + x0 + '" y="' + y0 + '" width="' + W + '" height="' + D + '" fill="none" stroke="#2c3e50" stroke-width="1.8"/>');
        parts.push('<text x="' + (x0 + W / 2) + '" y="' + (y0 + D + fs * 2.2) + '" text-anchor="middle" font-size="' + (fs + 1.5) + '" font-weight="600" fill="#2c3e50">' + esc(f.name) + " floor</text>");
        parts.push('<text x="' + (x0 + W / 2) + '" y="' + (y0 + D + fs * 3.6) + '" text-anchor="middle" font-size="' + fs2 + '" fill="#6b7280" letter-spacing="1">' + (b.key === "rear" ? "COURTYARD SIDE" : "STREET SIDE") + "</text>");
        width = Math.max(width, x0 + W + pad);
      });
      parts.push('<text x="' + (x - 6) + '" y="' + (y0 + D / 2) + '" text-anchor="middle" font-size="' + fs2 + '" fill="#6b7280" transform="rotate(-90 ' + (x - 6) + " " + (y0 + D / 2) + ')">' + fmt(b.depth_m, 1) + " m</text>");
      parts.push('<text x="' + (x + W / 2) + '" y="' + (y0 - 5) + '" text-anchor="middle" font-size="' + fs2 + '" fill="#6b7280">' + fmt(b.width_m, 1) + " m</text>");
      y = y0 + D + fs * 4.6 + 12;
    });
    // scale bar: 5 m
    parts.push('<line x1="' + (pad + 16) + '" y1="' + (y - 4) + '" x2="' + (pad + 16 + 5 * k) + '" y2="' + (y - 4) + '" stroke="#2c3e50" stroke-width="2"/>');
    parts.push('<text x="' + (pad + 16 + 5 * k + 4) + '" y="' + (y - 1) + '" font-size="' + fs2 + '" fill="#6b7280">5 m</text>');
    y += 10;
    var totalW = Math.max(width, 260), totalH = y;
    var legend = o.blocks.map(function (b) { return b.unit_list.map(function (u) { return '<span class="lg"><i style="background:' + unitColor(o, u.key, b.key) + '"></i>' + esc(u.key) + " " + (u.kind ? esc(u.name) : u.beds + " bed") + ", ~" + Math.round(areas[u.key + "@" + b.key] || 0) + " m2</span>"; }).join(""); }).join("") +
      '<span class="lg"><i style="background:#c81e1e"></i>entry</span>';
    return { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="' + totalW + '" height="' + totalH + '" viewBox="0 0 ' + totalW + " " + totalH + '" role="img" aria-label="Schematic floor plans">' + parts.join("") + "</svg>", legend: legend, width: totalW, height: totalH };
  }

  return { SOURCE: SOURCE, DESIGNS: DESIGNS, UNIT_COLORS: UNIT_COLORS, design: design, url: url, fits: fits, form: form, fitRows: fitRows, fitLines: fitLines,
    unitRows: unitRows, unitSvg: unitSvg, unitMix: unitMix, optionGfa: optionGfa, unitColor: unitColor, unitVolumes: unitVolumes, unitAreas: unitAreas,
    levelRoles: levelRoles, bedsOnLevel: bedsOnLevel, bedsLabel: bedsLabel, programme: programme, rooms: rooms, unitRooms: unitRooms, unitCells: unitCells, coreCell: coreCell, CORE_KEY: CORE_KEY, CORE_COLOR: CORE_COLOR, blockOf: blockOf, unitOf: unitOf, bilinear: bilinear, floorPlansSvg: floorPlansSvg };
})();
