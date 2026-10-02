/* summary.js -- the development summary at the end of the flow: the key statistics of the drawn option (site,
   envelope, coverage, gross floor area and FSR, units and family units, access, car share, outdoor space), the
   compliance checks, the unit schedule, and an A4 PDF report of them with the 3D view, site plan, section and
   floor plans. stats() is pure (testable); pdf() needs jsPDF 2.5 with the AutoTable plugin on window.jspdf. */
var R1Summary = (function () {
  "use strict";
  function fmt(x, d) { return Number(x).toFixed(d); }
  function cap1(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* stats(ctx): ctx = { ev, form, option, parcel, zone, address, site: {stalls, shared_m2, patios} | null, planIssues: [] | null }
     -> { address, date, option, fsr, gfa_m2, coverage, groups: [{title, rows: [[label, value, clause]]}], checks: [[name, detail, clause, "ok"|"fail"]], units: [{cells, color}], source } */
  function stats(ctx) {
    var ev = ctx.ev, form = ctx.form, o = ctx.option, U = R1Units, R = U.RULES, FR = R1Massing.FORM_RULES;
    var site = [], env = [], prop = [], units = [], checks = [];
    var address = ctx.address || (ctx.parcel ? ctx.parcel.civic + " " + ctx.parcel.street : "");
    site.push(["Address", address]);
    if (ctx.zone) site.push(["Zoning district", ctx.zone.district || "?"]);
    site.push(["Site area", fmt(ev.area, 1) + " m²"], ["Frontage", fmt(ev.frontage, 2) + " m"], ["Site depth", fmt(ev.site_depth, 2) + " m"]);
    if (ev.band) site.push(["Unit band", "up to " + ev.band.max_units + " units", ev.band.clause.split(" ")[0]]);
    env.push(["Permitted envelope", fmt(ev.env_width, 2) + " × " + fmt(ev.env_depth, 2) + " m, " + ev.height + " m / " + ev.storeys + " storeys"]);
    env.push(["Controlling constraint", ev.controlling || ev.depth_controlled_by || ""]);
    env.push(["Yards", "front " + R1Core.RULES.front_yard_m.value + " m, sides " + R1Core.RULES.side_yard_m.value + " m, rear " + R1Core.RULES.rear_yard_m.value + " m", R1Core.RULES.front_yard_m.clause.split(" ")[0] + ", " + R1Core.RULES.side_yard_m.clause.split(" ")[0] + ", " + R1Core.RULES.rear_yard_m.clause.split(" ")[0]]);
    var fp = 0, gfa = 0;
    if (form) form.buildings.forEach(function (b) { fp += b.footprint_m2; });
    if (o) { o.blocks.forEach(function (b) { gfa += b.gfa_m2 || 0; }); if (!gfa && o.blocks[0] && o.blocks[0].design) gfa = o.blocks[0].design.gfa_m2 || 0; }
    else if (form) form.buildings.forEach(function (b) { gfa += b.footprint_m2 * b.storeys; });
    var optionName = o ? (o.source === "cmhc" ? "CMHC " : "") + o.name : (form ? form.name : "Permitted envelope");
    prop.push(["Option", cap1(optionName)]);
    if (form) form.buildings.forEach(function (b) { prop.push([b.name, fmt(b.width_m, 2) + " × " + fmt(b.depth_m, 2) + " m, " + fmt(b.footprint_m2, 1) + " m², " + b.height_m + " m / " + b.storeys + " storeys", b.clause]); });
    (form ? form.gaps || [] : []).forEach(function (g) { prop.push([cap1(g.name.toLowerCase()), fmt(g.value_m, 2) + " m" + (g.min_m ? " (min " + g.min_m + " m)" : ""), g.clause]); });
    prop.push(["Site coverage", fmt(fp, 1) + " m² = " + Math.round(100 * fp / ev.area) + "% of the site"]);
    prop.push(["Gross floor area", Math.round(gfa) + " m²" + (o && o.source === "cmhc" ? " (catalogue gross building area)" : " (every storey full)")]);
    var fsr = gfa / ev.area, cap = FR.fsr_max.value;
    prop.push(["FSR", fmt(fsr, 2) + " (cap " + fmt(cap, 2) + (fsr <= cap + 1e-3 ? ", within" : ", OVER the cap") + "); the by-law's exclusions are not modelled", FR.fsr_max.clause]);
    if (o) {
      var dw = []; o.blocks.forEach(function (b) { b.unit_list.forEach(function (u) { if (!u.kind) dw.push(u); }); });
      var fam = dw.filter(function (u) { return u.beds >= 2; }).length, tenure = o.tenure || "other", need = U.familyMin(o.units, tenure);
      units.push(["Dwelling units", o.units + " (" + R1Cmhc.unitMix(o) + ")"]);
      units.push(["Family units (2+ bedrooms)", fam + " of " + o.units + "; minimum " + need + " for " + o.units + " units, " + (tenure === "rental" ? "rental" : "other tenure"), R.family_min.clause]);
      units.push(["Tenure", o.source === "cmhc" ? "as drawn (strata or rental)" : U.tenureOf(tenure).name]);
      if (o.ground_use) units.push(["Ground floor", U.groundUseOf(o.ground_use).name]);
      var areas = R1Cmhc.unitAreas(o), tot = 0, n = 0; Object.keys(areas).forEach(function (k) { tot += areas[k]; n++; });
      if (n) units.push(["Average unit area", Math.round(tot / n) + " m² (share of the footprint)"]);
      var al = R1Access.lines(R1Access.plan(o)); units.push(["Access", al.length ? al.join(" ") : "Every unit is entered at grade."]);
      if (ctx.site) {
        units.push(["Car share", ctx.site.stalls ? ctx.site.stalls + " stall" + (ctx.site.stalls > 1 ? "s" : "") + " off the lane (2.5 × 5.5 m)" : "no stall fits off the lane"]);
        units.push(["Shared outdoor space", Math.round(ctx.site.shared_m2) + " m²" + (ctx.site.patios ? " + " + ctx.site.patios + " private patios" : "")]);
      }
      (o.checks || []).forEach(function (c) { checks.push([cap1(c.name), c.detail, c.clause, c.ok ? "ok" : "fail"]); });
      if (ctx.planIssues) checks.push(["Plan check", ctx.planIssues.length ? ctx.planIssues.length + " item" + (ctx.planIssues.length > 1 ? "s" : "") + " to resolve: " + ctx.planIssues.slice(0, 3).join("; ") + (ctx.planIssues.length > 3 ? "; …" : "") : "passed: doors, clearances, furniture, stairs, circulation and access", "", ctx.planIssues.length ? "fail" : "ok"]);
    }
    return { address: address, date: new Date().toISOString().slice(0, 10), option: cap1(optionName), fsr: fsr, gfa_m2: gfa, coverage: fp / ev.area,
      groups: [{ title: "Site", rows: site }, { title: "Permitted envelope", rows: env }, { title: "Proposal", rows: prop }].concat(units.length ? [{ title: "Units", rows: units }] : []),
      checks: checks, units: o ? R1Cmhc.unitRows(o) : [], source: R1Core.RULES.source };
  }

  /* pdf(data, images): an A4 landscape report. images = { three, siteplan, section, plans }, each { data (PNG data URL), w, h } or null.
     Page 1: the statistics and the checks; page 2: the 3D view; page 3: site plan, section and the unit schedule; page 4: the floor plans. */
  function pdf(data, images) {
    var J = window.jspdf && window.jspdf.jsPDF;
    if (!J || !J.API || !J.API.autoTable) throw new Error("jsPDF with AutoTable is not loaded");
    var doc = new J({ orientation: "landscape", unit: "mm", format: "a4" }), W = 297, H = 210, M = 12, INK = [44, 62, 80], MUTED = [107, 114, 128], LINE = [225, 229, 234], GROUP = [233, 238, 244];
    function header(title) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor.apply(doc, INK); doc.text("Lotwise", M, 17);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor.apply(doc, MUTED); doc.text("Development summary · " + data.address + " · " + data.date, M + 24, 17);
      doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor.apply(doc, INK); doc.text(title, M, 26); doc.setFont("helvetica", "normal");
      return 31;
    }
    function footer() {
      var n = doc.getNumberOfPages();
      for (var i = 1; i <= n; i++) {
        doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor.apply(doc, MUTED);
        doc.text(data.source.document + ", " + data.source.version + " (accessed " + data.source.accessed + "). City of Vancouver Open Data. Schematic design aid, not a permit submission.", M, H - 6);
        doc.text("Page " + i + " of " + n, W - M, H - 6, { align: "right" });
      }
    }
    function image(img, x, y, bw, bh, centre) {   // fitted into the box, top-left (or centred across it)
      if (!img || !img.data) return 0;
      var s = Math.min(bw / img.w, bh / img.h), w = img.w * s, h = img.h * s;
      doc.addImage(img.data, /^data:image\/png/.test(img.data) ? "PNG" : "JPEG", centre ? x + (bw - w) / 2 : x, y, w, h); return h;
    }
    function table(y, head, body, x, w, colStyles) {
      doc.autoTable({ startY: y, margin: { left: x, right: W - x - w, bottom: 14 }, tableWidth: w, head: [head], body: body, theme: "grid",
        styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.3, lineColor: LINE, lineWidth: 0.2, textColor: INK, overflow: "linebreak" },
        headStyles: { fillColor: GROUP, textColor: INK, fontStyle: "bold" }, columnStyles: colStyles || {} });
      return doc.lastAutoTable.finalY;
    }
    // page 1: the statistics in two columns (site, envelope and proposal on the left; units and the checks on the right)
    var y = header(data.option), cw = (W - 2 * M - 8) / 2, rx = M + cw + 8, yl = y, yr = y;
    var col = { 0: { cellWidth: 36, fontStyle: "bold" }, 1: { cellWidth: cw - 36 - 24 }, 2: { cellWidth: 24, textColor: MUTED, fontSize: 6.5 } };
    data.groups.forEach(function (g) {
      var left = g.title !== "Units", yy = table(left ? yl : yr, [g.title, "", "Clause"], g.rows.map(function (r) { return [r[0], r[1], r[2] || ""]; }), left ? M : rx, cw, col) + 3;
      if (left) yl = yy; else yr = yy;
    });
    if (data.checks.length) table(yr, ["Check", "Result", "Clause"], data.checks.map(function (c) { return [(c[3] === "ok" ? "OK  " : "FAIL  ") + c[0], c[1], c[2]]; }), rx, cw, { 0: { cellWidth: 30, fontStyle: "bold" }, 2: { cellWidth: 24, textColor: MUTED, fontSize: 6.5 } });
    // page 2: the 3D view of the development, full width
    if (images.three) {
      doc.addPage(); y = header("3D view");
      var h3 = image(images.three, M, y, W - 2 * M, H - y - 20, true);
      doc.setFontSize(8.5); doc.setTextColor.apply(doc, MUTED);
      doc.text(data.option + " on " + data.address + ": FSR " + fmt(data.fsr, 2) + ", site coverage " + Math.round(100 * data.coverage) + "%. The units as labelled boxes on the site, with the neighbouring buildings and the ground from the City's open data.", M, y + h3 + 6, { maxWidth: W - 2 * M });
    }
    // page 3: the site plan on the left, the section and the unit schedule on the right
    if (images.siteplan || images.section || data.units.length) {
      doc.addPage(); y = header("Site plan, section and unit schedule");
      var sw = 118; image(images.siteplan, M, y, sw, H - y - 14);
      var sx = M + sw + 8, srw = W - M - sx, hs = image(images.section, sx, y, srw, 72), y2 = y + (hs ? hs + 4 : 0);
      if (data.units.length) table(y2, ["Unit", "Bedrooms", "Baths", "Floors", "Area", "Note"], data.units.map(function (u) { return u.cells; }), sx, srw, { 0: { cellWidth: 12, fontStyle: "bold" }, 1: { cellWidth: 18 }, 2: { cellWidth: 14 }, 3: { cellWidth: 14 }, 4: { cellWidth: 20 } });
    }
    // page 4: the floor plans
    if (images.plans) { doc.addPage(); y = header("Schematic floor plans"); image(images.plans, M, y, W - 2 * M, H - y - 14, true); }
    footer();
    return doc;
  }
  return { stats: stats, pdf: pdf };
})();
