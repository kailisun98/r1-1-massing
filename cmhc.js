/* cmhc.js -- CMHC Housing Design Catalogue (British Columbia designs) tested against the R1-1 envelope.
   The catalogue designs are fixed buildings; the test asks whether each one, alone or with an accessory unit
   behind it or two side by side, sits inside the permitted envelope and the form rules of the schedule, and
   what unit mix that gives. A fitting option becomes a "form" (same shape as the step-5 form options), so the
   map, the section and the 3D view draw it with the existing code. */
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
  function U(key, beds, baths, extra) { var u = { key: key, beds: beds, baths: baths }; if (extra) Object.keys(extra).forEach(function (k) { u[k] = extra[k]; }); return u; }

  /* role: principal = a main building; accessory = a secondary unit placed as the rear building of a courtyard
     configuration; courtyard = the catalogue's own front + rear pair. Dimensions in metres, areas in m2. */
  var DESIGNS = [
    { key: "adu_01", name: "Accessory Dwelling Unit 01", slug: "accessory-dwelling-unit-01", role: "accessory", units: 1, storeys: 1, gfa_m2: 50,
      footprint_m2: 51.5, width_m: 6.7, depth_m: 8.0, height_peak_m: 4.6, height_mid_m: 3.5,
      unit_list: [U("U1", 1, 1, { adaptable_alt: true })], floors: [{ name: "Ground", units: ["U1"] }],
      layout: "One-storey secondary unit; U1a is the adaptable version (BCBC 2024, 3.8.5)." },
    { key: "adu_02", name: "Accessory Dwelling Unit 02", slug: "accessory-dwelling-unit-02", role: "accessory", units: 1, storeys: 2, gfa_m2: 94,
      footprint_m2: 45.7, width_m: 5.6, depth_m: 8.2, height_peak_m: 7.9, height_mid_m: 6.7,
      unit_list: [U("U1", 2, 1.5)], floors: [{ name: "Ground", units: ["U1"] }, { name: "Second", units: ["U1"] }],
      layout: "Two-storey secondary unit." },
    { key: "duplex", name: "Duplex", slug: "duplex", role: "principal", units: 2, storeys: 2.5, gfa_m2: 272,
      footprint_m2: 102.2, width_m: 7.3, depth_m: 17.4, height_peak_m: 10.15, height_mid_m: 9.2,
      unit_list: [U("U1", 3, 2.5, { den: true }), U("U2", 3, 2.5, { den: true })],
      floors: [{ name: "Ground", units: ["U1", "U2"] }, { name: "Second", units: ["U1", "U2"] }, { name: "Third", units: ["U1", "U2"] }],
      layout: "Two units front and back, each on three levels (the third within the roof)." },
    { key: "fourplex_01", name: "Fourplex 01", slug: "fourplex-01", role: "principal", units: 4, storeys: 2.5, gfa_m2: 374,
      footprint_m2: 134.1, width_m: 6.8, depth_m: 19.8, height_peak_m: 11.0, height_mid_m: 9.6,
      unit_list: [U("U1", 1, 1, { adaptable_alt: true }), U("U2", 1, 1, { adaptable_alt: true }), U("U3", 3, 2.5), U("U4", 3, 2.5)],
      floors: [{ name: "Ground", units: ["U1", "U2"] }, { name: "Second", units: ["U3", "U4"] }, { name: "Third", units: ["U3", "U4"] }],
      layout: "Two one-bedroom flats on the ground floor (adaptable versions U1a, U2a) under two three-bedroom units on the two floors above; drawn for narrow lots." },
    { key: "fourplex_02", name: "Fourplex 02", slug: "fourplex-02", role: "principal", units: 4, storeys: 3, gfa_m2: 556,
      footprint_m2: 197.1, width_m: 11.3, depth_m: 19.3, height_peak_m: 10.7, height_mid_m: 8.8,
      unit_list: [U("U1", 3, 2.5, { den: true }), U("U2", 3, 2.5, { den: true }), U("U3", 3, 2.5, { den: true }), U("U4", 3, 2.5, { den: true })],
      floors: [{ name: "Ground", units: ["U1", "U2", "U3", "U4"] }, { name: "Second", units: ["U1", "U2", "U3", "U4"] }, { name: "Third", units: ["U1", "U2", "U3", "U4"] }],
      layout: "Four three-storey units, two across by two deep." },
    { key: "rowhouse", name: "Rowhouse", slug: "rowhouse", role: "principal", units: 2, storeys: 2, gfa_m2: 253,
      footprint_m2: 122.9, width_m: 11.4, depth_m: 12.8, height_peak_m: 8.5, height_mid_m: 7.1,
      unit_list: [U("U1", 3, 2.5, { adaptable_alt: true }), U("U2", 3, 2.5, { adaptable_alt: true })],
      floors: [{ name: "Ground", units: ["U1", "U2"] }, { name: "Second", units: ["U1", "U2"] }],
      layout: "Two side-by-side two-storey units of 5.7 m each (adaptable versions U1a, U2a); the row extends a unit at a time.",
      repeat: { unit_width_m: 5.7, unit_gfa_m2: 126.5, unit_footprint_m2: 61.45, max_units: 6 } },
    { key: "courtyard_sixplex", name: "Courtyard Sixplex", slug: "courtyard-sixplex", role: "courtyard", units: 6, gfa_m2: 577, footprint_m2: 212.9,
      front: { name: "Front building", storeys: 3, footprint_m2: 131.4, width_m: 12.5, depth_m: 11.1, height_peak_m: 11.0, height_mid_m: 9.7,
        unit_list: [U("U1", 1, 1, { adaptable_alt: true }), U("U2", 1, 1, { adaptable_alt: true }), U("U3", 3, 2.5), U("U4", 3, 2.5)],
        floors: [{ name: "Ground", units: ["U1", "U2"] }, { name: "Second", units: ["U3", "U4"] }, { name: "Third", units: ["U3", "U4"] }] },
      rear: { name: "Rear building", storeys: 2, footprint_m2: 81.5, width_m: 12.2, depth_m: 7.7, height_peak_m: 7.9, height_mid_m: 6.6,
        unit_list: [U("U5", 2, 1), U("U6", 2, 1)], floors: [{ name: "Ground", units: ["U5", "U6"] }, { name: "Second", units: ["U5", "U6"] }] },
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
    d.floors.forEach(function (f) { floors.push({ name: f.name, units: units.map(function (u) { return u.key; }) }); });
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
    var FR = M.FORM_RULES, gap = FR.side_separation_m.value, R = core.RULES;
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
    out.options.sort(function (a, b) { return (b.ok - a.ok) || (b.units - a.units) || (gfaOf(b) - gfaOf(a)); });
    return out;
  }
  function gfaOf(o) { return o.blocks.reduce(function (s, b) { return s + (b.gfa_m2 || 0); }, 0) || (o.blocks[0].design.gfa_m2 || 0); }
  function optionGfa(o) { var g = o.blocks.reduce(function (s, b) { return s + (b.gfa_m2 || 0); }, 0); return g || o.blocks[0].design.gfa_m2; }

  // ------------------------------------------------------------------ geometry: the option as a form (same shape as R1Massing.formScheme)
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

  // ------------------------------------------------------------------ tables, report, unit diagram
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
  function unitRows(o) {
    var rows = [];
    o.blocks.forEach(function (b) {
      b.unit_list.forEach(function (u) {
        var floors = b.floors.filter(function (f) { return f.units.indexOf(u.key) >= 0; }).map(function (f) { return f.name; }).join(" + ");
        rows.push([(o.blocks.length > 1 ? b.name + ": " : "") + u.key, u.beds + " bed" + (u.den ? " + den" : ""), u.baths + " bath", floors, u.adaptable_alt ? "adaptable version " + u.key + "a" : ""]);
      });
    });
    return rows;
  }
  var UNIT_FILLS = ["#2a9d8f", "#5fb3a6", "#8fcabf", "#1f7a70", "#b5dcd4", "#3f8f84", "#7fc0b4", "#256e66"];
  function unitSvg(o) {
    var k = 12, fh = 20, pad = 6, gapPx = 26, x = pad, parts = [], height = 0;
    o.blocks.forEach(function (b) { height = Math.max(height, b.floors.length * fh + 34); });
    var allUnits = [];
    o.blocks.forEach(function (b) { b.unit_list.forEach(function (u) { allUnits.push(u.key + "@" + b.key); }); });
    o.blocks.forEach(function (b) {
      var w = Math.max(b.width_m * k, 60), y0 = pad + 14;
      parts.push('<text x="' + x + '" y="' + (y0 - 4) + '" class="sectitle" font-size="10">' + esc(b.name) + " (" + fmt(b.width_m, 1) + " m wide)</text>");
      b.floors.slice().reverse().forEach(function (f, i) {
        var y = y0 + i * fh, n = f.units.length, uw = w / n;
        f.units.forEach(function (uk, j) {
          var ui = allUnits.indexOf(uk + "@" + b.key), fill = UNIT_FILLS[(ui < 0 ? j : ui) % UNIT_FILLS.length];
          parts.push('<rect x="' + (x + j * uw) + '" y="' + y + '" width="' + uw + '" height="' + fh + '" fill="' + fill + '" stroke="#ffffff" stroke-width="1"/>');
          if (uw > 22) parts.push('<text x="' + (x + j * uw + uw / 2) + '" y="' + (y + fh / 2 + 3.5) + '" text-anchor="middle" font-size="9" fill="#ffffff" font-weight="600">' + esc(uk) + "</text>");
        });
        parts.push('<text x="' + (x + w + 4) + '" y="' + (y + fh / 2 + 3.5) + '" font-size="9" class="sectitle">' + esc(f.name) + "</text>");
      });
      x += w + 52 + gapPx;
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + x + '" height="' + (height + pad) + '" viewBox="0 0 ' + x + " " + (height + pad) + '" role="img" aria-label="Unit configuration by floor">' + parts.join("") + "</svg>";
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  return { SOURCE: SOURCE, DESIGNS: DESIGNS, design: design, url: url, fits: fits, form: form, fitRows: fitRows, fitLines: fitLines, unitRows: unitRows, unitSvg: unitSvg, unitMix: unitMix, optionGfa: optionGfa };
})();
