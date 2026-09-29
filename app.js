/* app.js -- the R1-1 Massing web app: the five-step sidebar, the map/plan, the 3D view and
   the site section. Same workflow as the Revit panel (lib/r1_1_massing_ui.py). */
var App = (function () {
  "use strict";
  var core = R1Core, site = R1Site, M = R1Massing;

  var COLORS = { site: "#c81e1e", parcel: "#7d8590", street: "#8e8e8e", lane: "#bdbdbd", building: "#f4f4f2", buildingLine: "#6b7280",
    topo: "#9fb07f", cut: "#4a4a4a", setback: "#b42828", envelope: "#3c8cdc", form: "#d99a2b", cmhc: "#2a9d8f", dim: "#2c3e50", section: "#2c3e50" };
  var EXAMPLE_ADDRESS = "3567 W 27th Ave", PLAN_SCALE = 500, SECTION_SCALE = 200;
  // The shared (artifact) copy cannot reach the City portal or the map tile server: it replays site files stored
  // with the page (data/index.json lists them) and reads tiles from tiles/{z}/{x}/{y}.png. See tools/build_artifact.py.
  var BUNDLED = !!window.R1_BUNDLED, BLANK_TILE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  var presets = [], bundles = {}, openedFile = null, activePreset = null, tileHalfM = 180;

  var S = {};           // workflow state
  var ui = {};          // DOM handles
  var map, layers = {}, tileLayer = null, presetLayer = null, three = null, pickMode = false, sitePickMode = false, sectionDirty = true, threeDirty = true;

  // ------------------------------------------------------------------ small helpers
  function $(id) { return document.getElementById(id); }
  function fmt(x, d) { return Number(x).toFixed(d); }
  function mm(x) { return Math.round(x * 1000); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function ll(p) { return S.res.frame.toLatLng(p); }
  function unit(d) { var L = Math.hypot(d[0], d[1]); return [d[0] / L, d[1] / L]; }

  function resetState() {
    S = { res: null, zone: null, choices: [], parcel: null, square: null, det: null, click: null, ev: null, base: null, placed: false,
      form: null, formBases: null, scheme: null, existingIds: [], cutSide: M.CUT_DEFAULT_SIDE_M, cmhc: null, cmhcPick: null, unitsOption: null };
  }

  // ------------------------------------------------------------------ status / report
  function status(text, level) {
    ui.status.textContent = text;
    ui.status.className = "status " + (level || "info");
  }
  function report(lines) {
    if (typeof lines === "string") lines = [lines];
    ui.report.textContent += lines.join("\n") + "\n";
    ui.report.scrollTop = ui.report.scrollHeight;
  }
  function reportReset() {
    var R = core.RULES.source;
    ui.report.textContent = "";
    report(["R1-1 MASSING", "Source: " + R.document, "Version: " + R.version + " | Accessed: " + R.accessed, "URL: " + R.url, "NOTE: " + R.note, ""]);
  }

  // ------------------------------------------------------------------ tables
  function fillTable(table, header, rows, opts) {
    opts = opts || {};
    table.innerHTML = "";
    var thead = el("thead"), tr = el("tr");
    header.forEach(function (h) { tr.appendChild(el("th", null, h)); });
    thead.appendChild(tr); table.appendChild(thead);
    var tbody = el("tbody");
    rows.forEach(function (r) {
      var row = el("tr");
      if (r.header) { row.className = "group"; var td = el("td", null, r.header); td.colSpan = header.length; row.appendChild(td); tbody.appendChild(row); return; }
      r.forEach(function (c, i) {
        var td = el("td", i === opts.clauseCol ? "clause" : (i === opts.statusCol ? "status-cell" : null), c === null || c === undefined ? "" : String(c));
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
  }
  function fillRules() {
    var form = S.form && S.form.status === "ok" ? S.form : null, rows = [];
    M.rulesGroups(S.ev, form).forEach(function (g) { rows.push({ header: g.title }); g.rows.forEach(function (r) { rows.push(r); }); });
    fillTable(ui.rules, ["Regulation", "R1-1", "Clause", "This site"], rows, { clauseCol: 2, statusCol: 3 });
  }
  function fillResults() { fillTable(ui.results, ["Item", "Value"], M.resultsRows(S.ev, S.base, S.zone, S.parcel)); }
  function fillForm() { fillTable(ui.formTable, ["Item", "Value"], S.form ? M.formRows(S.form, S.ev) : []); }

  // ------------------------------------------------------------------ enabling by state
  function setReady() {
    var haveSite = !!S.parcel, haveModel = !!S.square, haveEnv = !!(S.ev && S.ev.status === "ok" && S.placed);
    ui.edgeSelect.disabled = !haveSite; ui.btnPick.disabled = !haveSite;
    ["single", "courtyard", "side_by_side"].forEach(function (k) { ui.schemeBtns[k].disabled = !haveEnv; });
    var bylawUp = !!(S.form && S.form.status === "ok" && S.form.scheme !== "cmhc");
    ui.btnFormClear.disabled = !bylawUp; ui.unitParams.disabled = !bylawUp; ui.btnFormPlans.disabled = !(bylawUp && S.unitsOption);
    ui.btnCmhcClear.disabled = !(S.form && S.form.scheme === "cmhc"); ui.btnCmhcPlans.disabled = !S.cmhcPick;
    ui.tab3d.disabled = !haveModel; ui.tabSection.disabled = !haveSite; ui.tabPlans.disabled = !S.unitsOption;
    ui.stepBadges.forEach(function (b, i) {
      var done = [haveModel, !!S.ev, haveEnv, !!(S.form && S.form.status === "ok")][i];
      b.classList.toggle("done", !!done);
    });
  }
  function setScheme(key) {
    S.scheme = key;
    Object.keys(ui.schemeBtns).forEach(function (k) { ui.schemeBtns[k].classList.toggle("on", k === key); ui.schemeBtns[k].setAttribute("aria-pressed", k === key ? "true" : "false"); });
    ui.courtyardParams.hidden = key !== "courtyard";
    var s = M.SCHEMES.filter(function (x) { return x.key === key; })[0];
    ui.formDesc.textContent = s ? s.desc : "";
  }

  // ------------------------------------------------------------------ map drawing
  function initMap() {
    map = L.map("map", { zoomControl: true, attributionControl: true, maxBoundsViscosity: 1.0 }).setView([49.2483, -123.1841], 17);
    // the shared copy only has tiles around its stored sites: anywhere else the layer shows a blank tile without asking the server
    var StoredTiles = L.TileLayer.extend({ getTileUrl: function (coords) {
      var b = this._tileCoordsToBounds(coords), hit = presets.some(function (p) { return p.centre && siteBox(p.centre).overlaps(b); });
      return hit ? L.TileLayer.prototype.getTileUrl.call(this, coords) : BLANK_TILE;
    } });
    tileLayer = BUNDLED
      ? new StoredTiles("tiles/{z}/{x}/{y}.png", { minZoom: 12, maxNativeZoom: 18, maxZoom: 20, errorTileUrl: BLANK_TILE, attribution: "&copy; OpenStreetMap contributors (tiles stored with this page around the preloaded sites)" })
      : L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 20, attribution: "&copy; OpenStreetMap contributors" });
    tileLayer.addTo(map);
    presetLayer = L.layerGroup().addTo(map);
    ["topo", "roads", "parcels", "buildings", "cut", "site", "envelope", "forms", "dims", "section"].forEach(function (k) { layers[k] = L.layerGroup().addTo(map); });
    map.on("click", function (e) {
      if (sitePickMode) {
        sitePickMode = false; ui.btnPickSite.classList.remove("on"); map.getContainer().classList.remove("leaflet-crosshair");
        pickSiteAt(e.latlng.lat, e.latlng.lng); return;
      }
      if (!pickMode || !S.parcel) return;
      var xy = S.res.frame.toXY(e.latlng.lng, e.latlng.lat);
      pickMode = false; ui.btnPick.classList.remove("on");
      var E = S.det ? S.det.edges : M.edges(S.parcel.ring), best = 0, bestD = Infinity;
      E.forEach(function (ed, i) { var d = site.pointToSegment(xy, ed.a, ed.b); if (d < bestD) { bestD = d; best = i; } });
      ui.edgeSelect.value = String(best); S.click = E[best].mid;
      ui.edgeNote.textContent = "Street edge picked on the map: edge " + E[best].i + " (faces " + E[best].facing + ").";
      onGenerate();
    });
  }
  function clearLayers(keys) { keys.forEach(function (k) { layers[k].clearLayers(); }); }
  function poly(pts, style, layer) { var p = L.polygon(pts.map(ll), style); p.addTo(layers[layer]); return p; }
  function line(pts, style, layer) { var p = L.polyline(pts.map(ll), style); p.addTo(layers[layer]); return p; }
  function label(p, text, angleDeg, cls, layer) {
    var html = '<div class="' + (cls || "maplbl") + '" style="transform:translate(-50%,-50%) rotate(' + (-angleDeg || 0) + 'deg)">' + text + "</div>";
    L.marker(ll(p), { icon: L.divIcon({ className: "lblwrap", html: html, iconSize: [0, 0] }), interactive: false }).addTo(layers[layer]);
  }
  function angleOf(d) { return Math.atan2(d[1], d[0]) * 180 / Math.PI; }

  function drawContext() {
    clearLayers(["topo", "roads", "parcels", "buildings", "cut", "site"]);
    var res = S.res, sq = S.square;
    // the site square: a green ground plate, clipped drawing on top
    poly(M.squareRing(sq), { color: COLORS.cut, weight: 2, fillColor: COLORS.topo, fillOpacity: 0.55, interactive: false }, "topo");
    if (ui.chkRoads.checked && res.roads) {
      res.roads.segments.forEach(function (seg) {
        var col = seg.kind === "street" ? COLORS.street : COLORS.lane;
        seg.pieces.forEach(function (pc) { var q = M.clipRing(pc.quad, sq); if (q.length) poly(q, { stroke: false, fillColor: col, fillOpacity: 0.9, interactive: false }, "roads"); });
        M.clipPolyline(seg.pts, sq).forEach(function (pl) { line(pl, { color: "#555", weight: 1, dashArray: "6 3 1 3", interactive: false }, "roads"); });
        if (seg.kind === "street") {
          var best = null;
          seg.pieces.forEach(function (pc) { M.clipPolyline([pc.a, pc.b], sq).forEach(function (pl) { var Ln = site.dist(pl[0], pl[pl.length - 1]); if (!best || Ln > best[0]) best = [Ln, pl[0], pl[pl.length - 1], pc]; }); });
          if (best && best[0] >= M.ROAD_NAME_MIN_LEN_M) label(core.mid(best[1], best[2]), seg.name, angleOf(best[3].d) > 90 || angleOf(best[3].d) < -90 ? angleOf(best[3].d) + 180 : angleOf(best[3].d), "streetlbl", "roads");
        }
      });
    }
    if (ui.chkParcels.checked) res.parcels.forEach(function (p) {
      if (p === S.parcel) return;
      M.clipPolyline(p.ring, sq, true).forEach(function (pl) { line(pl, { color: COLORS.parcel, weight: 1, interactive: false }, "parcels"); });
    });
    S.existingIds = [];
    if (ui.chkBuildings.checked) res.buildings.forEach(function (b, i) {
      var onSite = S.parcel && site.pointInRing(b.centroid, S.parcel.ring), ring = M.clipRing(b.ring, sq);
      if (!ring.length) return;
      var p = poly(ring, { color: COLORS.buildingLine, weight: 1, fillColor: COLORS.building, fillOpacity: 0.95, interactive: false }, "buildings");
      if (onSite) { S.existingIds.push(i); p._r1Existing = true; if (S.placed && ui.chkHide.checked) p.remove(); }
    });
    var ring = S.parcel.ring;
    poly(ring, { color: COLORS.site, weight: 3, fill: false, interactive: false }, "site");
    zoomToSite();
  }
  function zoomToSite() {
    if (!S.parcel) return;
    map.invalidateSize();
    if (map.getSize().y < 50) { setTimeout(zoomToSite, 400); return; }   // the pane is not laid out (or hidden) yet
    var b = L.latLngBounds(S.parcel.ring.map(ll)).pad(1.2);
    map.fitBounds(b, { padding: [24, 24], maxZoom: 19, animate: false });
  }
  function setExistingVisible(show) {
    layers.buildings.eachLayer(function (p) { if (p._r1Existing) { if (show) { if (!map.hasLayer(p)) p.addTo(layers.buildings); } else p.remove(); } });
  }

  // dimensions: refs -> geometry in metres; the dimension line is spec.line (position + direction)
  function resolveRef(ref, ctx) {
    var kind = ref[0];
    if (kind === "boundary") { var e = ctx.edges[ref[1]]; return { line: [e.a, e.d] }; }
    if (kind === "setback") { var sg = ctx.setbacks[ref[1]]; return sg ? { line: [sg.a, ctx.edges[ref[1]].d] } : null; }
    if (kind === "outline_pt") return { pt: ref[1] };
    if (kind === "form") { var b = ctx.form[ref[1]]; if (!b) return null; var j = ref[2], p = b.pts[j], q = b.pts[(j + 1) % b.pts.length]; return { line: [p, unit([q[0] - p[0], q[1] - p[1]])] }; }
    if (kind === "form_pt") return { pt: ref[2] };
    return null;
  }
  function refPoint(r) { return r.pt || r.line[0]; }
  function drawDimension(spec, ctx, layer, opts) {
    opts = opts || {};
    var ra = resolveRef(spec.refs[0], ctx), rb = resolveRef(spec.refs[1], ctx);
    if (!ra || !rb) return null;
    var q = spec.line[0], d = unit([spec.line[1][0] - spec.line[0][0], spec.line[1][1] - spec.line[0][1]]), n = [-d[1], d[0]];
    function proj(p) { return (p[0] - q[0]) * d[0] + (p[1] - q[1]) * d[1]; }
    var ta = proj(refPoint(ra)), tb = proj(refPoint(rb));
    if (ta > tb) { var tmp = ta; ta = tb; tb = tmp; var r = ra; ra = rb; rb = r; }
    var A = [q[0] + d[0] * ta, q[1] + d[1] * ta], B = [q[0] + d[0] * tb, q[1] + d[1] * tb];
    var value = tb - ta, col = opts.color || COLORS.dim;
    line([A, B], { color: col, weight: 1, interactive: false }, layer);
    [[A, ra], [B, rb]].forEach(function (pair) {
      var tick = pair[0], ref = pair[1], foot;
      if (ref.pt) foot = ref.pt; else foot = core.intersect(tick, n, ref.line[0], ref.line[1]) || tick;
      line([tick, foot], { color: col, weight: 0.8, opacity: 0.7, interactive: false }, layer);
      var t = 0.5; line([[tick[0] - (d[0] + n[0]) * t, tick[1] - (d[1] + n[1]) * t], [tick[0] + (d[0] + n[0]) * t, tick[1] + (d[1] + n[1]) * t]], { color: col, weight: 1.5, interactive: false }, layer);
    });
    var ang = angleOf(d); if (ang > 90 || ang < -90) ang += 180;
    label(core.mid(A, B), mm(value), ang, "dimlbl", layer);
    return value;
  }
  function dimContext() {
    var ctx = { edges: S.ev.edges, setbacks: {}, form: {} };
    M.setbackSegments(S.ev).forEach(function (sg) { ctx.setbacks[sg.edge] = sg; });
    if (S.form && S.form.status === "ok") S.form.buildings.forEach(function (b) { ctx.form[b.key] = b; });
    return ctx;
  }

  function drawEnvelope() {
    clearLayers(["envelope", "dims"]);
    var ev = S.ev, ctx = dimContext(), off = M.dimOffsetM(PLAN_SCALE);
    M.setbackSegments(ev).forEach(function (sg) { line([sg.a, sg.b], { color: COLORS.setback, weight: 1.5, dashArray: "8 5", interactive: false }, "envelope"); });
    S.envelopeLayer = poly(ev.env_pts, { color: COLORS.envelope, weight: 2, fillColor: COLORS.envelope, fillOpacity: 0.35, interactive: false }, "envelope");
    M.envelopeDimensionPlan(ev, off).forEach(function (spec) { drawDimension(spec, ctx, "dims"); });
  }
  function drawForm() {
    clearLayers(["forms"]);
    if (!(S.form && S.form.status === "ok")) { if (S.envelopeLayer && !map.hasLayer(S.envelopeLayer)) S.envelopeLayer.addTo(layers.envelope); return; }
    var ctx = dimContext(), off = M.dimOffsetM(PLAN_SCALE), col = S.form.scheme === "cmhc" ? COLORS.cmhc : COLORS.form;
    S.form.buildings.forEach(function (b) { poly(b.pts, { color: col, weight: 2, fillColor: col, fillOpacity: S.unitsOption ? 0.15 : 0.55, interactive: false }, "forms"); });
    if (S.unitsOption) {   // ground-floor units in their colours, labelled
      R1Cmhc.unitVolumes(S.unitsOption, S.form).filter(function (v) { return v.floor_index === 0; }).forEach(function (v) {
        poly(v.pts, { color: "#ffffff", weight: 1, fillColor: v.color, fillOpacity: 0.7, interactive: false }, "forms");
        label(v.centroid, v.unit, 0, "unitlbl", "forms");
      });
    }
    M.formDimensionPlan(S.ev, S.form, off).forEach(function (spec) { drawDimension(spec, ctx, "forms", { color: COLORS.dim }); });
    if (S.envelopeLayer) S.envelopeLayer.remove();     // the envelope would show through where the form is smaller
  }
  function drawSectionMarker() {
    clearLayers(["section"]);
    if (!S.ev || S.ev.status !== "ok") return;
    var sp = M.sectionPlan(S.ev, S.form && S.form.status === "ok" ? S.form : null, S.formBases, envelopeBaseZ(), M.dimOffsetM(SECTION_SCALE));
    if (!sp) return;
    var c = sp.c, d = sp.dir, half = (sp.lot[1] - sp.lot[0]) / 2 + 15;
    var a = [c[0] - d[0] * half, c[1] - d[1] * half], b = [c[0] + d[0] * half, c[1] + d[1] * half];
    line([a, b], { color: COLORS.section, weight: 1.5, dashArray: "10 6", interactive: false }, "section");
    label(a, "A", 0, "seclbl", "section"); label(b, "A", 0, "seclbl", "section");
  }

  // ------------------------------------------------------------------ section (SVG)
  function envelopeBaseZ() { return S.base ? S.base.mean : 0; }
  function drawSection() {
    var host = ui.sectionHost;
    host.innerHTML = "";
    if (!S.ev || S.ev.status !== "ok") { host.appendChild(el("p", "empty", S.parcel ? "Generate the envelope to cut the section." : "Import a site, then generate the envelope to cut the section.")); return; }
    var form = S.form && S.form.status === "ok" ? S.form : null;
    var sp = M.sectionPlan(S.ev, form, S.formBases, envelopeBaseZ(), M.dimOffsetM(SECTION_SCALE));
    if (!sp) { host.appendChild(el("p", "empty", "The section line misses the lot.")); return; }
    var margin = 15, half = (sp.lot[1] - sp.lot[0]) / 2 + margin, mid = (sp.lot[0] + sp.lot[1]) / 2;
    var s0 = mid - half, s1 = mid + half, zLo = sp.z_low - 1, zHi = sp.z_high;
    var prof = [];
    for (var s = s0; s <= s1 + 1e-9; s += 1) prof.push([s, M.groundZ(S.res, sp.c[0] + sp.dir[0] * s, sp.c[1] + sp.dir[1] * s)]);
    var gmin = Math.min.apply(null, prof.map(function (p) { return p[1]; })), gmax = Math.max.apply(null, prof.map(function (p) { return p[1]; }));
    zLo = Math.min(zLo, gmin - 3); zHi = Math.max(zHi, gmax + 2);
    var W = host.clientWidth || 800, pad = 36, k = (W - 2 * pad) / (s1 - s0), H = (zHi - zLo) * k + 2 * pad;
    var svgNS = "http://www.w3.org/2000/svg", svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("width", "100%"); svg.style.maxWidth = "100%";
    function X(sv) { return pad + (sv - s0) * k; } function Y(z) { return pad + (zHi - z) * k; }
    function add(tag, attrs, text) { var e = document.createElementNS(svgNS, tag); Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); }); if (text !== undefined) e.textContent = text; svg.appendChild(e); return e; }
    // ground block
    var pts = prof.map(function (p) { return X(p[0]) + "," + Y(p[1]); });
    add("polygon", { points: pts.join(" ") + " " + X(s1) + "," + Y(zLo) + " " + X(s0) + "," + Y(zLo), fill: "#5e6a4a", stroke: "none" });
    add("polyline", { points: pts.join(" "), fill: "none", stroke: "#3f4733", "stroke-width": 1.2 });
    // buildings
    sp.buildings.forEach(function (b) {
      var col = b.key === "envelope" ? COLORS.envelope : (S.form && S.form.scheme === "cmhc" ? COLORS.cmhc : COLORS.form);
      add("rect", { x: X(b.s0), y: Y(b.z1), width: (b.s1 - b.s0) * k, height: (b.z1 - b.z0) * k, fill: col, "fill-opacity": 0.75, stroke: "#5b4a1e", "stroke-width": 1 });
    });
    // reference lines
    sp.lines.forEach(function (ln) {
      var st = ln.style === "site" ? { stroke: COLORS.site, "stroke-width": 1.5 } : ln.style === "setback" ? { stroke: COLORS.setback, "stroke-width": 1, "stroke-dasharray": "6 4" } : { stroke: "#6b7280", "stroke-width": 0.8 };
      var a = { x1: X(ln.a[0]), y1: Y(ln.a[1]), x2: X(ln.b[0]), y2: Y(ln.b[1]) }; Object.keys(st).forEach(function (kk) { a[kk] = st[kk]; });
      add("line", a);
    });
    // dimensions
    sp.dims.forEach(function (dm) {
      if (dm.vertical) {
        var x = X(dm.s), y0 = Y(dm.z[0]), y1 = Y(dm.z[1]);
        add("line", { x1: x, y1: y0, x2: x, y2: y1, stroke: COLORS.dim, "stroke-width": 1 });
        [y0, y1].forEach(function (yy) { add("line", { x1: x - 4, y1: yy + 4, x2: x + 4, y2: yy - 4, stroke: COLORS.dim, "stroke-width": 1.5 }); });
        var t = add("text", { x: x + 6, y: (y0 + y1) / 2, "font-size": 11, "text-anchor": "middle", transform: "rotate(-90 " + (x + 6) + " " + ((y0 + y1) / 2) + ")", "dominant-baseline": "auto", "class": "secdim" }, mm(dm.value_m));
      } else {
        var xa = X(dm.s[0]), xb = X(dm.s[1]), y = Y(dm.z);
        add("line", { x1: xa, y1: y, x2: xb, y2: y, stroke: COLORS.dim, "stroke-width": 1 });
        [xa, xb].forEach(function (xx) { add("line", { x1: xx - 4, y1: y + 4, x2: xx + 4, y2: y - 4, stroke: COLORS.dim, "stroke-width": 1.5 }); });
        add("text", { x: (xa + xb) / 2, y: y - 4, "font-size": 11, "text-anchor": "middle", "class": "secdim" }, mm(dm.value_m));
      }
    });
    // street / lane names at the ends
    if (S.res.roads) {
      var pf = [sp.c[0] + sp.dir[0] * (sp.lot[0] - 8), sp.c[1] + sp.dir[1] * (sp.lot[0] - 8)], pr = [sp.c[0] + sp.dir[0] * (sp.lot[1] + 4), sp.c[1] + sp.dir[1] * (sp.lot[1] + 4)];
      var sf = M.roadNameNear(S.res.roads, pf), sr = M.roadNameNear(S.res.roads, pr);
      if (sf) add("text", { x: X(sp.lot[0] - 8), y: Y(zLo) + 16, "font-size": 11, "text-anchor": "middle", "class": "seclbl" }, sf.name);
      if (sr) add("text", { x: X(sp.lot[1] + 4), y: Y(zLo) + 16, "font-size": 11, "text-anchor": "middle", "class": "seclbl" }, sr.name);
    }
    add("text", { x: pad, y: 18, "font-size": 12, "class": "sectitle" }, "Section A-A through the site, street on the left  ·  1:" + SECTION_SCALE + " proportions, mm");
    host.appendChild(svg);
    sectionDirty = false;
  }

  // ------------------------------------------------------------------ 3D (three.js)
  function init3D() {
    var host = ui.threeHost;
    THREE.Object3D.DefaultUp = new THREE.Vector3(0, 0, 1);
    var renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    host.appendChild(renderer.domElement);
    var scene = new THREE.Scene(); scene.background = new THREE.Color(0xf4f5f7);
    var camera = new THREE.PerspectiveCamera(40, 1, 1, 5000);
    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa886, 0.45));
    var sun = new THREE.DirectionalLight(0xfff4e0, 0.75); sun.position.set(-120, -160, 220); scene.add(sun);
    var group = new THREE.Group(); scene.add(group);
    var labelHost = el("div", "lbl3dhost"); host.appendChild(labelHost);
    three = { renderer: renderer, scene: scene, camera: camera, controls: controls, group: group, labelHost: labelHost, labels: [] };
    function resize() { var w = host.clientWidth || 800, h = host.clientHeight || 500; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    window.addEventListener("resize", resize); resize();
    // labels: HTML tags projected from a 3D point every frame (unit keys on the blocks, a heading per building)
    var v = new THREE.Vector3();
    function placeLabels() {
      var w = host.clientWidth, h = host.clientHeight;
      three.labels.forEach(function (lb) {
        v.copy(lb.pos).project(camera);
        var vis = v.z < 1 && v.x > -1.05 && v.x < 1.05 && v.y > -1.05 && v.y < 1.05;
        lb.el.style.display = vis ? "" : "none";
        if (vis) lb.el.style.transform = "translate(" + ((v.x + 1) / 2 * w).toFixed(1) + "px, " + ((1 - v.y) / 2 * h).toFixed(1) + "px) translate(-50%, -50%)";
      });
    }
    (function loop() { requestAnimationFrame(loop); if (!ui.threeHost.parentElement.hidden) { controls.update(); renderer.render(scene, camera); placeLabels(); } })();
    three.resize = resize;
  }
  function clearLabels3D() { if (!three) return; three.labels.forEach(function (lb) { lb.el.remove(); }); three.labels = []; }
  function label3D(x, y, z, text, cls, color) {
    var e = el("div", "lbl3d" + (cls ? " " + cls : ""), text);
    if (color) e.style.borderLeftColor = color;
    three.labelHost.appendChild(e); three.labels.push({ el: e, pos: new THREE.Vector3(x, y, z) });
  }
  function extrude(ring, z0, h, color, opacity) {
    var shape = new THREE.Shape(ring.map(function (p) { return new THREE.Vector2(p[0], p[1]); }));
    var geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    var mat = new THREE.MeshLambertMaterial({ color: color, transparent: opacity < 1, opacity: opacity });
    var mesh = new THREE.Mesh(geo, mat); mesh.position.z = z0;
    var edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x3b3b3b, transparent: true, opacity: 0.5 }));
    edges.position.z = z0;
    var g = new THREE.Group(); g.add(mesh); g.add(edges); return g;
  }
  function build3D() {
    if (!three) init3D();
    var G = three.group;
    while (G.children.length) G.remove(G.children[0]);
    if (!S.square) return;
    var sq = S.square, res = S.res, N = 80, h = sq.half;
    // the ground: M.groundZ (a weighted plane fit through the elevation points, smooth between contours) sampled on
    // an 80 x 80 grid over the square, smooth-shaded, with a skirt down to a flat base; everything else drapes on it
    var pos = [], uvs = [], idx = [], zs = [];
    for (var j = 0; j <= N; j++) for (var i = 0; i <= N; i++) {
      var p = M.fromUV(sq, [-h + 2 * h * i / N, -h + 2 * h * j / N]), z = M.groundZ(res, p[0], p[1]);
      pos.push(p[0], p[1], z); uvs.push(i / N, j / N); zs.push(z);
    }
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) { var a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
    var zBase = Math.min.apply(null, zs) - 4;
    var geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    // the plan (ground colour, streets and lanes, parcel lines, the site boundary) is painted onto the ground as a
    // texture instead of separate draped meshes, so nothing fights with the terrain surface on a slope
    if (three.groundTex) three.groundTex.dispose();
    three.groundTex = groundTexture(sq, res);
    G.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: three.groundTex, side: THREE.DoubleSide })));
    var ring = M.squareRing(sq), skirt = [], sidx = [];
    ring.forEach(function (p, k) {
      var q = ring[(k + 1) % 4], n = 40;
      for (var t = 0; t <= n; t++) {
        var x = p[0] + (q[0] - p[0]) * t / n, y = p[1] + (q[1] - p[1]) * t / n, z = M.groundZ(res, x, y), base = skirt.length / 3;
        skirt.push(x, y, z, x, y, zBase);
        if (t > 0) sidx.push(base - 2, base, base + 1, base - 2, base + 1, base - 1);
      }
    });
    var sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.Float32BufferAttribute(skirt, 3)); sg.setIndex(sidx); sg.computeVertexNormals();
    G.add(new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ color: 0x66714f, side: THREE.DoubleSide })));
    var bottom = new THREE.Shape(ring.map(function (p) { return new THREE.Vector2(p[0], p[1]); }));
    var bm = new THREE.Mesh(new THREE.ShapeGeometry(bottom), new THREE.MeshLambertMaterial({ color: 0x4d573d, side: THREE.DoubleSide })); bm.position.z = zBase; G.add(bm);
    // buildings: the top stays at the LiDAR height (base elevation + height above ground); the base is sunk 0.5 m
    // below the lowest ground under the footprint so nothing floats on a slope
    if (ui.chkBuildings.checked) res.buildings.forEach(function (b) {
      var onSite = S.parcel && site.pointInRing(b.centroid, S.parcel.ring);
      if (onSite && S.placed && ui.chkHide.checked) return;
      var r = M.clipRing(b.ring, sq); if (!r.length) return;
      var top = site.localZ(res, b.base_geodetic) + b.height_m, gmin = Math.min.apply(null, r.map(function (p) { return M.groundZ(res, p[0], p[1]); }));
      var base = Math.min(gmin, top - 3) - 0.5;
      G.add(extrude(r, base, top - base, 0xf1f1ee, 1));
    });
    var formUp = S.form && S.form.status === "ok";
    if (S.ev && S.ev.status === "ok" && S.placed && !formUp) G.add(extrude(S.ev.env_pts, envelopeBaseZ(), S.ev.height, 0x3c8cdc, 0.4));
    clearLabels3D();
    if (formUp && S.unitsOption) {   // one coloured box per unit per floor, each with its tag; a heading per building
      var o = S.unitsOption;
      R1Cmhc.unitVolumes(o, S.form).forEach(function (v) {
        G.add(extrude(v.pts, S.formBases[v.block] + v.z0, v.z1 - v.z0, v.color, 0.92));
        var text = v.kind ? v.unit + " " + (R1Cmhc.blockOf(o, v.block).unit_list.filter(function (u) { return u.key === v.unit; })[0] || {}).name : v.unit + " · " + v.beds + " bed";
        label3D(v.centroid[0], v.centroid[1], S.formBases[v.block] + (v.z0 + v.z1) / 2, text, null, v.color);
      });
      S.form.buildings.forEach(function (b) {
        var blk = R1Cmhc.blockOf(o, b.key); if (!blk) return;
        label3D(b.centroid[0], b.centroid[1], S.formBases[b.key] + b.height_m + 2.2, blk.name + ": " + blk.units + " unit" + (blk.units === 1 ? "" : "s") + ", " + blk.storeys + " storeys", "head");
      });
    } else if (formUp) S.form.buildings.forEach(function (b) { G.add(extrude(b.pts, S.formBases[b.key], b.height_m, 0xd99a2b, 0.65)); label3D(b.centroid[0], b.centroid[1], S.formBases[b.key] + b.height_m + 2.2, b.name + ": " + fmt(b.width_m, 1) + " x " + fmt(b.depth_m, 1) + " m, " + b.storeys + " storeys", "head"); });
    else if (S.ev && S.ev.status === "ok" && S.placed) label3D(site.centroid(S.ev.env_pts)[0], site.centroid(S.ev.env_pts)[1], envelopeBaseZ() + S.ev.height + 2.2, "Permitted envelope: " + fmt(S.ev.env_width, 1) + " x " + fmt(S.ev.env_depth, 1) + " m, " + S.ev.height + " m, up to " + S.ev.band.max_units + " units", "head");
    // the camera is set once per site; redrawing for a form or a catalogue option keeps the view where the user left it
    var c = S.parcel ? S.parcel.centroid : sq.c, cz = M.groundZ(res, c[0], c[1]), siteKey = (S.parcel ? S.parcel.site_id + "|" + S.parcel.civic : "-") + "|" + sq.half;
    if (three.siteKey !== siteKey) {
      three.controls.target.set(c[0], c[1], cz);
      three.camera.position.set(c[0] + 90, c[1] - 110, cz + 90);
      three.siteKey = siteKey;
    }
    three.controls.update(); three.resize();
    threeDirty = false;
  }
  // the ground texture: the site plan painted in the square's own frame (u right, v up), 2048 px over the cut
  function groundTexture(sq, res) {
    var size = 2048, cv = document.createElement("canvas"); cv.width = size; cv.height = size;
    var ctx = cv.getContext("2d"), h = sq.half, s = size / (2 * h);
    function px(p) { var uv = M.toUV(sq, p); return [(uv[0] + h) * s, size - (uv[1] + h) * s]; }
    function path(pts, close) { ctx.beginPath(); pts.forEach(function (p, i) { var q = px(p); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); if (close) ctx.closePath(); }
    ctx.fillStyle = "#adb993"; ctx.fillRect(0, 0, size, size);
    if (ui.chkRoads.checked && res.roads) {
      res.roads.segments.forEach(function (seg) {
        ctx.fillStyle = seg.kind === "street" ? "#8c8c8c" : "#b9b9b9";
        seg.pieces.forEach(function (pc) { var q = M.clipRing(pc.quad, sq); if (q.length) { path(q, true); ctx.fill(); } });
      });
      ctx.strokeStyle = "rgba(50,50,50,0.45)"; ctx.lineWidth = 2; ctx.setLineDash([26, 12]);
      res.roads.segments.forEach(function (seg) { M.clipPolyline(seg.pts, sq).forEach(function (pl) { path(pl, false); ctx.stroke(); }); });
      ctx.setLineDash([]);
    }
    if (ui.chkParcels.checked) {
      ctx.strokeStyle = "rgba(60,70,50,0.55)"; ctx.lineWidth = 2.5;
      res.parcels.forEach(function (p) { if (p === S.parcel) return; M.clipPolyline(p.ring, sq, true).forEach(function (pl) { path(pl, false); ctx.stroke(); }); });
    }
    if (S.parcel) { ctx.strokeStyle = "#c81e1e"; ctx.lineWidth = 6; path(S.parcel.ring, true); ctx.stroke(); }
    var tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = three.renderer.capabilities.getMaxAnisotropy();
    return tex;
  }

  // ------------------------------------------------------------------ tabs
  function showView(name) {
    ["map", "3d", "section", "plans"].forEach(function (k) {
      var pane = ui.panes[k], on = k === name;
      pane.hidden = !on; ui.tabs[k].classList.toggle("on", on); ui.tabs[k].setAttribute("aria-selected", on ? "true" : "false");
    });
    if (name === "map") setTimeout(function () { map.invalidateSize(); if (S.parcel && map.getZoom() < 14) zoomToSite(); }, 30);
    if (name === "3d" && S.square) { if (threeDirty) build3D(); else three.resize(); }
    if (name === "section" && sectionDirty) drawSection();
    if (name === "plans" && plansDirty) drawPlans();
  }
  function markDirty() {
    threeDirty = true; sectionDirty = true; plansDirty = true;
    if (!ui.panes.section.hidden) drawSection(); if (!ui.panes["3d"].hidden && S.square) build3D(); if (!ui.panes.plans.hidden) drawPlans();
  }

  // ------------------------------------------------------------------ the floor-plan sheet
  var plansDirty = true, plansFloor = null, plansScale = 20;
  function drawPlans() {
    var host = ui.plansHost, o = S.unitsOption; host.innerHTML = "";
    if (!o || !S.form || S.form.status !== "ok") { host.appendChild(el("p", "empty", "Draw a massing option in step 4, then open its floor plans.")); plansDirty = false; return; }
    var floorNames = [];
    o.blocks.forEach(function (b) { b.floors.forEach(function (f) { if (floorNames.indexOf(f.name) < 0) floorNames.push(f.name); }); });
    if (plansFloor && floorNames.indexOf(plansFloor) < 0) plansFloor = null;
    var head = el("div", "sheet-head");
    head.appendChild(el("h2", null, (o.source === "cmhc" ? "CMHC " : "") + o.name + ": schematic floor plans"));
    head.appendChild(el("p", null, (S.address ? S.address + " · " : "") + o.units + " units (" + R1Cmhc.unitMix(o) + "). " +
      (o.source === "cmhc" ? "Unit extents follow the catalogue's floor layout; the rooms, walls, doors, windows and fittings are generated to suit each unit." : "Units, rooms, walls, doors, windows and fittings are generated to suit the by-law form.") + " Street side at the bottom of each plan; a red triangle marks an entry; dimensions in mm."));
    host.appendChild(head);
    var tools = el("div", "sheet-tools"), g1 = el("div", "grp"), g2 = el("div", "grp");
    g1.appendChild(el("span", null, "Floor"));
    [null].concat(floorNames).forEach(function (fn) { var b = el("button", fn === plansFloor ? "on" : null, fn || "All"); b.addEventListener("click", function () { plansFloor = fn; drawPlans(); }); g1.appendChild(b); });
    g2.appendChild(el("span", null, "Scale"));
    [[14, "Small"], [20, "Medium"], [28, "Large"]].forEach(function (s) { var b = el("button", s[0] === plansScale ? "on" : null, s[1]); b.addEventListener("click", function () { plansScale = s[0]; drawPlans(); }); g2.appendChild(b); });
    tools.appendChild(g1); tools.appendChild(g2); host.appendChild(tools);
    var plans = R1Plans.sheet(o, { k: plansScale, floors: plansFloor ? [plansFloor] : null });
    var body = el("div", "sheet-body"); body.innerHTML = plans.svg; host.appendChild(body);
    var lg = el("div", "sheet-legend"); lg.innerHTML = plans.legend; host.appendChild(lg);
    var notes = el("div", "sheet-notes");
    if (o.source === "cmhc") {
      var links = o.blocks.map(function (b) { return R1Cmhc.url(b.design) ? '<a href="' + R1Cmhc.url(b.design) + '" target="_blank" rel="noopener">' + esc(b.design.name) + "</a>" : null; }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
      notes.innerHTML = "<p>Layout: entry and living toward the street, kitchen to the rear, bedrooms upstairs; walls 300 mm outside, 250 mm between units, 120 mm inside; areas are each unit's share of the footprint. CMHC's own drawings: " + links.join(", ") + ". " + esc(R1Cmhc.SOURCE.note) + "</p>";
    } else {
      notes.innerHTML = o.blocks.map(function (b) { return "<p><b>" + esc(b.name) + ":</b> " + esc(b.design.layout) + "</p>"; }).join("") +
        o.checks.map(function (c) { return "<p>" + (c.ok ? "OK: " : "<b>Check:</b> ") + esc(c.name + ": " + c.detail) + " [" + esc(c.clause) + "]</p>"; }).join("") +
        o.notes.map(function (n) { return "<p>" + esc(n) + "</p>"; }).join("");
    }
    host.appendChild(notes);
    plansDirty = false;
  }
  function showFloorPlans() {
    if (!(S.unitsOption && S.form && S.form.status === "ok")) { status("Draw a massing option first (step 4).", "error"); return; }
    plansDirty = true; showView("plans");
    status("Floor plans of " + S.unitsOption.name + " in the Floor plans tab; pick a floor or a scale above the sheet.", "ok");
  }

  // ------------------------------------------------------------------ data source: live portal, opened site file, or preloaded site
  // The stored tiles cover centre +/- tileHalfM of each preloaded site: the tile layer only asks for tiles in that
  // box (no requests for tiles that do not exist) and the map cannot be dragged out of it. No centre: no tiles.
  function siteBox(centre) {
    var dl = tileHalfM / 111320, dn = dl / Math.cos(centre[0] * Math.PI / 180);
    return L.latLngBounds([[centre[0] - dl, centre[1] - dn], [centre[0] + dl, centre[1] + dn]]);
  }
  // "Pick a site on the map": the lot under the click becomes the address and is fetched. Live: the parcel dataset
  // is asked which lot is there. Shared copy: the nearest stored site within 120 m.
  function pickSiteAt(lat, lon) {
    if (BUNDLED) {
      var best = null, bd = Infinity;
      presets.forEach(function (p) { if (!p.centre) return; var d = Math.hypot((p.centre[0] - lat) * 111320, (p.centre[1] - lon) * 111320 * Math.cos(lat * Math.PI / 180)); if (d < bd) { bd = d; best = p; } });
      if (!best || bd > 120) { status("This shared copy only carries its stored sites: click one of the red pins, or open a site file.", "error"); return; }
      ui.address.value = best.address; onFetch(); return;
    }
    status("Looking up the lot at " + lat.toFixed(5) + ", " + lon.toFixed(5) + " ...", "busy");
    site.useTape(null);
    site.getJSON(site.exportUrl(site.DATASETS.parcels.id, site.within(lon, lat, 1))).then(function (json) {
      var f = site.features(json)[0], pr = (f && f.properties) || {};
      if (!f || !pr.civic_number || !pr.streetname) throw new Error("no lot with a civic address at that point");
      ui.address.value = pr.civic_number + " " + pr.streetname;
      report(["Site picked on the map: " + ui.address.value + " (parcel under " + lat.toFixed(6) + ", " + lon.toFixed(6) + ")"]);
      onFetch();
    }).catch(function (e) { status("Could not pick a site there: " + e.message + ". Click inside a lot.", "error"); });
  }
  function prepareSource(text) {
    var na = site.normaliseAddress(text), civic = na[0], street = na[1];
    function matches(o) { return !!o && String(o.civic) === String(civic) && o.street === street; }
    activePreset = null;
    if (matches(openedFile)) { site.useTape(openedFile.requests); site.record(false); return Promise.resolve("file"); }
    if (!BUNDLED) { site.useTape(null); site.record(true); return Promise.resolve("live"); }
    var p = presets.filter(matches)[0];
    activePreset = p || null;
    if (!p) return Promise.reject(new Error("'" + text + "' is not one of the sites stored with this page. Pick a preloaded site from the address list, or open a site file saved from the app run locally."));
    var load = bundles[p.file] ? Promise.resolve(bundles[p.file])
      : fetch(p.file).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status + " loading " + p.file); return r.json(); }).then(function (b) { bundles[p.file] = b; return b; });
    return load.then(function (b) { site.useTape(b.requests); site.record(false); return "preset"; });
  }
  function loadPresets() {
    if (!BUNDLED) return Promise.resolve();
    return fetch("data/index.json").then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function (idx) {
      presets = idx.sites || []; tileHalfM = idx.tile_half_m || tileHalfM;
      presets.forEach(function (p) { var o = el("option"); o.value = p.address; if (p.label) o.label = p.label; ui.presetList.appendChild(o); });
      presets.forEach(function (p) {   // a pin per stored site; clicking it fetches that site
        if (!p.centre) return;
        L.circleMarker(p.centre, { radius: 7, color: "#c81e1e", weight: 2, fillColor: "#ffffff", fillOpacity: 1 }).bindTooltip(p.address + (p.label ? " (" + p.label + ")" : ""))
          .on("click", function () { ui.address.value = p.address; onFetch(); }).addTo(presetLayer);
      });
      var p0 = presets.filter(function (p) { return p.address === EXAMPLE_ADDRESS; })[0] || presets[0];
      if (p0 && p0.centre) map.setView(p0.centre, 17);
      ui.sourceNote.hidden = false;
      ui.sourceNote.textContent = "Shared copy: " + presets.length + " sites are stored with this page (" + presets.map(function (p) { return p.address; }).join("; ") +
        "). Pick one from the address list. For any other Vancouver address, run the app locally and open the site file it saves.";
    }).catch(function (e) { presets = []; ui.sourceNote.hidden = false; ui.sourceNote.textContent = "No preloaded sites found (" + e.message + "). Open a site file saved from the app run locally."; });
  }
  function exportSite() {
    if (!S.res || !S.siteTape) return null;
    var na = site.normaliseAddress(S.address), t = S.res.target, wd = t ? site.approxDims(t.ring) : null;
    return { format: "r1-1-site/1", app: "R1-1 Massing web app", saved: new Date().toISOString(), address: S.address, civic: na[0], street: na[1],
      centre: S.res.centre, radius_m: S.res.radius_m, zoning: S.zone ? S.zone.district : null, local_area: S.hit ? S.hit.local_area : null,
      label: t ? t.civic + " " + t.street + (wd ? " (" + fmt(wd[0], 1) + " x " + fmt(wd[1], 1) + " m)" : "") : null,
      requests: site.slimTape(S.siteTape, S.res.centre[0], S.res.centre[1], S.res.radius_m + 25) };
  }
  function onSaveSite() {
    var obj = exportSite();
    if (!obj) { status("Fetch a site first.", "error"); return; }
    var name = "r1-1-site-" + (obj.civic + "-" + obj.street).toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".json";
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: "application/json" })); a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    status("Site file saved: " + name + ". Open it in the shared copy of this app to work on this site there.", "ok");
  }
  function onOpenSiteFile(ev) {
    var f = ev.target.files && ev.target.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var obj;
      try { obj = JSON.parse(rd.result); if (obj.format !== "r1-1-site/1" || !obj.requests || !obj.address) throw new Error("not an R1-1 site file"); }
      catch (e) { status("Could not read " + f.name + ": " + e.message, "error"); return; }
      openedFile = obj; ui.address.value = obj.address;
      report(["Site file opened: " + f.name + " (saved " + (obj.saved || "?").slice(0, 16).replace("T", " ") + ")"]);
      onFetch();
    };
    rd.readAsText(f); ev.target.value = "";
  }

  // ------------------------------------------------------------------ step 1: fetch + import
  function onFetch() {
    var text = ui.address.value.trim();
    if (!text) { status("Type an address first.", "error"); return; }
    var side = parseFloat(ui.cutSide.value), radius = M.fetchRadiusFor(side);
    status("Fetching City of Vancouver Open Data within " + Math.round(radius) + " m for a " + side + " m square ...", "busy");
    ui.btnFetch.disabled = true;
    var log = function (m) { report([m]); };
    prepareSource(text).then(function (src) {
      if (src !== "live") report(["Data source: " + (src === "file" ? "site file " : "preloaded site ") + text + " (portal responses replayed, not fetched live)."]);
      return site.geocode(text);
    }).then(function (hit) {
      if (!hit) throw new Error("No address '" + text + "' found in " + site.DATASETS.addresses.id + ".");
      report(["Address: " + hit.civic_number + " " + hit.std_street + " (" + hit.local_area + "), site_id " + hit.site_id + "  ->  lat " + hit.lat.toFixed(6) + ", lon " + hit.lon.toFixed(6)]);
      return site.fetchArea(hit.lat, hit.lon, radius, log).then(function (res) {
        return Promise.all([M.zoningAt(hit.lat, hit.lon).catch(function (e) { report(["Note: zoning lookup failed (" + e.message + ")."]); return null; }),
          M.fetchRoads(res).catch(function (e) { report(["Note: roads lookup failed (" + e.message + ")."]); return null; })]).then(function (both) {
          res.roads = both[1]; return { res: res, zone: both[0], hit: hit };
        });
      });
    }).then(function (out) {
      resetState(); S.res = out.res; S.zone = out.zone; S.cutSide = side; S.hit = out.hit; S.address = text;
      S.siteTape = site.tapeContents(); site.record(false);   // a live fetch was recorded: "Save site file" can store it
      report(site.reportLines(S.res)); var zl = M.zoningLines(S.zone); report(zl.concat([""]));
      if (S.res.roads) report(M.roadsLines(S.res.roads).concat([""]));
      ui.zoning.textContent = zl[0]; ui.zoning.className = "zoning " + (S.zone && (S.zone.district || "").indexOf(M.R1_1_PREFIX) === 0 ? "ok" : "warn");
      S.choices = M.parcelChoices(S.res);
      ui.parcelList.innerHTML = "";
      S.choices.forEach(function (ch, i) { var o = el("option", null, ch.label); o.value = String(i); if (ch.parcel === S.res.target) o.selected = true; ui.parcelList.appendChild(o); });
      clearLayers(Object.keys(layers)); fillRules(); fillResults(); fillForm(); setScheme(null); resetCmhc(); ui.edgeFallback.hidden = true;
      map.setView([S.res.centre[0], S.res.centre[1]], 17);
      var roads = S.res.roads ? S.res.roads.segments.length : 0;
      status(S.res.parcels.length + " parcels, " + S.res.buildings.length + " buildings, " + roads + " road segments, " + S.res.topo_points.length + " elevation points fetched.", "ok");
      if (S.choices.length) onImport();   // the nearest parcel is the site; the envelope follows at once
    }).catch(function (e) {
      status("Fetch failed: " + e.message, "error"); report(["STOP: data fetch failed: " + e.message]);
    }).then(function () { ui.btnFetch.disabled = false; ui.btnSaveSite.disabled = !S.siteTape; setReady(); });
  }
  function onImport() {
    var i = parseInt(ui.parcelList.value, 10);
    if (!S.res || isNaN(i)) { status("Fetch the site data and select the parcel first.", "error"); return; }
    S.parcel = S.choices[i].parcel; S.square = M.siteSquare(S.parcel, S.cutSide);
    S.ev = null; S.base = null; S.placed = false; S.form = null; S.formBases = null; S.click = null; S.envelopeLayer = null; S.unitsOption = null; ui.unitsPanel.innerHTML = ""; openRight(false);
    clearLayers(["envelope", "forms", "dims", "section"]);
    drawContext();
    report(M.siteLines(S.parcel)); report(M.cutLines(S.square).concat([""]));
    S.det = M.detectFrontage(S.parcel.ring, S.res.parcels, S.res.radius_m, S.parcel);
    report(M.frontageLines(S.det).concat([""]));
    fillEdges(); fillRules(); fillResults(); fillForm(); setScheme(null); resetCmhc(); markDirty(); setReady();
    if (S.det && S.det.front) { ui.edgeFallback.hidden = true; onGenerate(); }
    else {   // the only case that needs a hand: say which edge faces the street
      ui.edgeFallback.hidden = false;
      status("Site shown, cut to a " + S.cutSide + " m square, but the street edge could not be detected: choose it below or pick a point on the map; the envelope follows.", "error");
    }
  }
  function fillEdges() {
    ui.edgeSelect.innerHTML = "";
    var choices = M.edgeChoices(S.parcel.ring, S.det, S.res.roads);
    choices.forEach(function (ch, i) { var o = el("option", null, ch.label); o.value = String(i); ui.edgeSelect.appendChild(o); });
    if (S.det.front) {
      ui.edgeSelect.value = String(S.det.edges.indexOf(S.det.front));
      var note = "Detected: front faces " + S.det.front.facing + " (" + S.det.confidence + " confidence).";
      if (S.det.rear && S.det.rear.gap_m !== null) note += " Rear faces " + S.det.rear.facing + " (" + fmt(S.det.rear.gap_m, 1) + " m gap = lane).";
      S.det.notes.forEach(function (n) { note += " " + n; });
      ui.edgeNote.textContent = note;
    } else { ui.edgeSelect.value = ""; ui.edgeNote.textContent = "Street edge not detected: choose the edge that faces the street, or pick a point on the map."; }
  }
  function streetClick() {
    var i = parseInt(ui.edgeSelect.value, 10);
    if (!isNaN(i) && S.parcel) { var E = S.det ? S.det.edges : M.edges(S.parcel.ring); if (i < E.length) return E[i].mid; }
    return S.click;
  }

  // ------------------------------------------------------------------ step 4: envelope
  function onGenerate() {
    if (!S.parcel) { status("Import a site first.", "error"); return; }
    var click = streetClick();
    if (!click) { status("Choose the street edge (or pick a point on the map) first.", "error"); return; }
    var ev = core.evaluate(S.parcel.ring, click);
    var base = ev.status === "ok" ? M.envelopeBase(S.res, ev.env_pts) : null;
    S.ev = ev; S.base = base; S.form = null; S.formBases = null; S.unitsOption = null; ui.unitsPanel.innerHTML = ""; setScheme(null); clearLayers(["forms"]);
    fillRules(); fillResults(); fillForm();
    report(core.reportLines(ev, "mm").concat([""]).concat(M.groundLines(base)).concat([""]));
    if (ev.status !== "ok") { S.placed = false; markDirty(); setReady(); openRight(false); status("No envelope: " + (ev.controlling || ev.status) + ". See the report and the by-law table.", "error"); return; }
    S.placed = true;
    drawEnvelope(); setExistingVisible(!ui.chkHide.checked); drawSectionMarker(); markDirty();
    resetCmhc(); setReady(); openRight(true);
    if (massingMode === "cmhc") onCmhc(true);
    status("Envelope placed: " + fmt(ev.env_width, 2) + " x " + fmt(ev.env_depth, 2) + " m, " + ev.height + " m high, up to " + ev.band.max_units + " units" +
      (ui.chkHide.checked && S.existingIds.length ? "; existing building hidden" : "") + ". Pick a massing option in step 4, or open the 3D view or the section.", "ok");
  }
  function onHideToggle() { if (!S.placed) return; setExistingVisible(!ui.chkHide.checked); markDirty(); status("Existing building on the site " + (ui.chkHide.checked ? "hidden." : "shown again."), "ok"); }

  // ------------------------------------------------------------------ step 5: forms
  // the single-building form as a drawable building (the envelope itself), so units can be laid out in it
  function singleForm(ev) {
    var R = core.RULES, E = ev.edges, idx = ev.idx, f = idx.front, s1 = idx.side1, s2 = idx.side2, fy = R.front_yard_m.value, sy = R.side_yard_m.value, hm = R.max_height_m;
    var pts = M.quad([M.offsetLine(E[f], fy), M.offsetLine(E[s1], sy), M.offsetLine(E[f], fy + ev.env_depth), M.offsetLine(E[s2], sy)]);
    if (!pts) return null;
    return { scheme: "single", dims_like: "single", name: M.schemeName("single"), status: "ok", reason: null, gaps: [], labels: [], notes: [], params: {},
      buildings: [M.building("single", "Single building", pts, hm.value, hm.storeys, hm.clause.split(" ")[0], E[f])] };
  }
  function unitOpts() { return { units: parseInt(ui.unitsSel.value, 10) || undefined, tenure: ui.tenureSel.value || "other", ground: ui.groundSel.value || "residential" }; }
  // shorten a form building from the rear to the depth the configurator settled on (points are [front-s1, rear-s1, rear-s2, front-s2])
  function trimForm(form, o) {
    var ef = S.ev.edges[S.ev.idx.front];
    o.blocks.forEach(function (b) {
      if (!b.trimmed_from_m) return;
      var i = form.buildings.map(function (x) { return x.key; }).indexOf(b.key); if (i < 0) return;
      var old = form.buildings[i], p = old.pts, r = b.depth_m / old.depth_m;
      var pts = [p[0], [p[0][0] + (p[1][0] - p[0][0]) * r, p[0][1] + (p[1][1] - p[0][1]) * r], [p[3][0] + (p[2][0] - p[3][0]) * r, p[3][1] + (p[2][1] - p[3][1]) * r], p[3]];
      form.buildings[i] = M.building(old.key, old.name, pts, old.height_m, old.storeys, old.clause, ef);
    });
    form.gaps.forEach(function (g) { if (g.kind === "courtyard" && form.buildings.length === 2) g.value_m = Math.min(M.distToLine(form.buildings[1].pts[0], [form.buildings[0].pts[1], ef.d]), M.distToLine(form.buildings[1].pts[3], [form.buildings[0].pts[2], ef.d])); });
  }
  function fillUnitsSelect(o) {
    var list = (o && o.achievable) || [];
    ui.unitsSel.innerHTML = "";
    list.forEach(function (n) { var opt = el("option", null, n + (n === 1 ? " unit" : " units")); opt.value = String(n); ui.unitsSel.appendChild(opt); });
    if (o && o.units) ui.unitsSel.value = String(o.units);
  }
  function applyForm(key, keepUnits) {
    if (!(S.ev && S.ev.status === "ok" && S.placed)) { setScheme(null); status("The site needs an envelope first (step 3).", "error"); return; }
    clearCmhcPick();
    var cy = parseFloat(ui.courtyardSel.value), rd = parseFloat(ui.rearDepthSel.value);
    var form = (key === "single" ? singleForm(S.ev) : null) || M.formScheme(S.ev, key, cy, rd);
    S.form = form; S.unitsOption = null; setScheme(key); fillRules();
    report(M.formLines(form, S.ev));
    if (form.status !== "ok") {
      S.formBases = null; fillForm(); drawForm(); drawSectionMarker(); markDirty(); ui.unitsPanel.innerHTML = ""; setReady();
      ui.formNote.textContent = form.reason || form.status;
      status(form.name + ": " + (form.reason || form.status), "error"); report([""]); return;
    }
    // the unit configuration for this form: dwellings, tenure and ground-floor use from the Units fields
    var opts = unitOpts(); if (!keepUnits) opts.units = undefined;
    var o = R1Units.configure(form, S.ev, opts);
    S.unitsOption = o.blocks.length ? o : null;
    if (S.unitsOption) trimForm(form, o);   // buildings trimmed to FSR by the configurator are redrawn at that depth
    fillUnitsSelect(o);
    S.formBases = M.formBases(S.res, form, envelopeBaseZ());
    fillForm(); drawForm(); drawSectionMarker(); markDirty(); setReady();
    if (S.unitsOption) { showUnits(o); report(R1Units.optionLines(o).concat([""])); }
    ui.formNote.textContent = S.unitsOption ? (o.ok ? "" : "Check: " + o.reason) : (o.reason || "");
    status("Form '" + form.name + "' drawn" + (S.unitsOption ? ": " + o.units + " units (" + R1Cmhc.unitMix(o) + ")" : "") + ". The envelope is hidden while a form is shown.", S.unitsOption && !o.ok ? "error" : "ok");
  }
  function onFormClear() {
    var wasCmhc = S.form && S.form.scheme === "cmhc";
    clearCmhcPick();
    S.form = null; S.formBases = null; S.unitsOption = null; ui.unitsPanel.innerHTML = ""; setScheme(null); fillForm(); fillRules(); drawForm(); drawSectionMarker(); markDirty(); setReady();
    ui.formNote.textContent = ""; status((wasCmhc ? "Catalogue massing" : "Form option") + " removed; the permitted envelope is shown again.", "ok");
  }

  // ------------------------------------------------------------------ step 6: CMHC catalogue fits
  function clearCmhcPick() {
    if (S.cmhcPick) { S.unitsOption = null; ui.unitsPanel.innerHTML = ""; }
    S.cmhcPick = null; ui.btnCmhcPlans.disabled = true;
    Array.prototype.forEach.call(ui.cmhcList.querySelectorAll(".opt.on"), function (n) { n.classList.remove("on"); });
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function resetCmhc() { S.cmhc = null; clearCmhcPick(); ui.cmhcList.innerHTML = ""; ui.cmhcNote.textContent = ""; }
  function onCmhc(quiet) {
    if (!(S.ev && S.ev.status === "ok" && S.placed)) { if (!quiet) status("The site needs an envelope first (step 3).", "error"); return; }
    S.cmhc = R1Cmhc.fits(S.ev); clearCmhcPick(); fillCmhcList();
    report(R1Cmhc.fitLines(S.cmhc, S.ev).concat([""]));
    var ok = S.cmhc.options.filter(function (o) { return o.ok; });
    ui.cmhcNote.textContent = (ok.length ? ok.length + " of " + S.cmhc.options.length + " catalogue options fit this site. Click a fitting option to draw it as the massing (units in colour) and see its unit configuration; the rest list the failing rule."
      : "No catalogue design fits this envelope as drawn; the table gives the rule each one fails.");
    if (!quiet) status(ok.length + " of " + S.cmhc.options.length + " catalogue options fit this site. Click one to draw it.", ok.length ? "ok" : "error");
    setReady();
  }
  function fillCmhcList() {
    var host = ui.cmhcList; host.innerHTML = "";
    R1Cmhc.fitRows(S.cmhc).forEach(function (r) {
      var o = r.option, item = el("div", "opt " + (r.ok ? "fit" : "nofit"));
      item.appendChild(el("span", "name", o.name));
      item.appendChild(el("span", "pill " + (r.ok ? "ok" : "no"), r.ok ? "fits" : "no fit"));
      item.appendChild(el("span", "meta", o.units + " unit" + (o.units === 1 ? "" : "s") + " · " + R1Cmhc.unitMix(o) + " · " + r.cells[2]));
      if (!r.ok) item.appendChild(el("span", "why", o.reason));
      if (r.ok) {
        item.setAttribute("role", "button"); item.tabIndex = 0; item.title = "Draw this option";
        item.addEventListener("click", function () { applyCmhc(o, item); });
        item.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); applyCmhc(o, item); } });
      }
      host.appendChild(item);
    });
  }
  function applyCmhc(o, item) {
    var form = R1Cmhc.form(S.ev, o);
    clearCmhcPick(); if (item) item.classList.add("on");
    S.form = form; S.cmhcPick = o; o.source = "cmhc"; setScheme(null); fillForm(); fillRules();
    if (form.status !== "ok") { S.formBases = null; S.unitsOption = null; drawForm(); drawSectionMarker(); markDirty(); setReady(); status(form.reason, "error"); return; }
    S.unitsOption = o;
    S.formBases = M.formBases(S.res, form, envelopeBaseZ());
    drawForm(); drawSectionMarker(); markDirty(); setReady();
    showUnits(o); ui.formNote.textContent = "";
    report(M.formLines(form, S.ev).concat(["  Unit mix: " + R1Cmhc.unitMix(o) + ". Source: " + R1Cmhc.SOURCE.name + ", " + R1Cmhc.SOURCE.url, ""]));
    status("Catalogue massing drawn: " + o.name + ", " + o.units + " units (" + R1Cmhc.unitMix(o) + "). Open the floor plans, the 3D view or the section.", "ok");
  }
  // the unit panel under both massing sources: the stack diagram, the unit table and the notes of the drawn option
  function showUnits(o) {
    var host = ui.unitsPanel; host.innerHTML = "";
    host.appendChild(el("p", "lbl", (o.source === "cmhc" ? "Units as drawn in the catalogue" : "Unit configuration") + ": " + o.units + " (" + R1Cmhc.unitMix(o) + ")"));
    var wrap = el("div"); wrap.innerHTML = R1Cmhc.unitSvg(o); host.appendChild(wrap);
    var table = el("table"), thead = el("thead"), htr = el("tr"), tbody = el("tbody");
    ["", "Unit", "Bedrooms", "Baths", "Floors", "Area", "Note"].forEach(function (h) { htr.appendChild(el("th", null, h)); });
    thead.appendChild(htr); table.appendChild(thead);
    R1Cmhc.unitRows(o).forEach(function (r) {
      var tr = el("tr"), sw = el("td"), dot = el("span", "unitsw"); dot.style.background = r.color; sw.appendChild(dot); tr.appendChild(sw);
      r.cells.forEach(function (c, i) { tr.appendChild(el("td", i === 4 ? "status-cell" : null, c)); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody); host.appendChild(table);
    if (o.source === "cmhc") {
      o.blocks.forEach(function (b) {
        var p = el("p", "muted"); p.appendChild(document.createTextNode((o.blocks.length > 1 ? b.name + ": " : "") + b.design.layout + " "));
        if (R1Cmhc.url(b.design)) { var a = el("a", null, "Catalogue page"); a.href = R1Cmhc.url(b.design); a.target = "_blank"; a.rel = "noopener"; p.appendChild(a); }
        host.appendChild(p);
      });
    } else {
      o.blocks.forEach(function (b) { host.appendChild(el("p", "muted", (o.blocks.length > 1 ? b.name + ": " : "") + b.design.layout)); });
      o.checks.forEach(function (c) { if (!c.ok) host.appendChild(el("p", "muted", "Check: " + c.name + ": " + c.detail + " [" + c.clause + "]")); });
      o.notes.forEach(function (n) { host.appendChild(el("p", "muted", n)); });
    }
    host.appendChild(el("p", "muted", "Same colours on the map (ground floor), in 3D (every floor) and in the floor plans. Areas are shares of the footprint, not measured floor areas."));
  }

  // ------------------------------------------------------------------ clear / copy
  function onClear() {
    clearLayers(Object.keys(layers));
    var res = S.res, zone = S.zone, choices = S.choices, cut = S.cutSide, tape = S.siteTape, hit = S.hit, address = S.address;
    resetState(); S.res = res; S.zone = zone; S.choices = choices; S.cutSide = cut; S.siteTape = tape; S.hit = hit; S.address = address;
    fillRules(); fillResults(); fillForm(); setScheme(null); resetCmhc(); ui.edgeFallback.hidden = true;
    markDirty(); setReady(); status("Cleared. The fetched site data is kept: re-select the parcel, fetch again, or pick another site to redraw.", "ok");
  }
  function onCopy() {
    var text = ui.report.textContent;
    function fallback() { var r = document.createRange(); r.selectNodeContents(ui.report); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); status("Report selected; press Ctrl+C to copy.", "info"); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { status("Report copied to the clipboard.", "ok"); }).catch(fallback);
    else fallback();
  }

  // ------------------------------------------------------------------ boot
  function bind() {
    ["address", "cutSide", "btnFetch", "parcelList", "zoning", "edgeSelect", "edgeNote", "edgeFallback", "btnPick", "rules", "assumptions", "chkHide",
      "results", "formSection", "courtyardParams", "courtyardSel", "rearDepthSel", "btnFormClear", "btnFormPlans", "unitParams", "unitsSel", "tenureSel", "groundSel", "formTable", "formNote", "formDesc", "report", "btnCopy",
      "btnClear", "status", "chkRoads", "chkParcels", "chkBuildings", "sectionHost", "threeHost", "tab3d", "tabSection", "tabPlans", "plansHost", "btnSaveSite", "siteFile", "presetList", "sourceNote",
      "btnCmhcClear", "cmhcList", "cmhcNote", "unitsPanel", "btnCmhcPlans", "btnPickSite", "modeForms", "modeCmhc", "panelForms", "panelCmhc", "rightPanel", "btnRightClose", "btnRightOpen"].forEach(function (id) { ui[id] = $(id); });
    ui.btnRightClose.addEventListener("click", function () { openRight(false); });
    ui.btnRightOpen.addEventListener("click", function () { openRight(true); });
    ui.btnCmhcClear.addEventListener("click", onFormClear); ui.btnCmhcPlans.addEventListener("click", showFloorPlans); ui.btnFormPlans.addEventListener("click", showFloorPlans);
    R1Units.TENURES.forEach(function (t) { var o = el("option", null, t.name); o.value = t.key; ui.tenureSel.appendChild(o); });
    R1Units.GROUND_USES.forEach(function (g) { var o = el("option", null, g.name); o.value = g.key; ui.groundSel.appendChild(o); });
    ["unitsSel", "tenureSel", "groundSel"].forEach(function (id) { ui[id].addEventListener("change", function () { if (S.scheme && S.form && S.form.scheme !== "cmhc") applyForm(S.scheme, true); }); });
    ui.modeForms.addEventListener("click", function () { setMassingMode("forms"); });
    ui.modeCmhc.addEventListener("click", function () { setMassingMode("cmhc"); });
    // every section collapses from its heading
    Array.prototype.forEach.call(document.querySelectorAll(".step > h2, .report > h2"), function (h) {
      h.addEventListener("click", function () { var sec = h.parentElement, off = sec.classList.toggle("collapsed"); h.setAttribute("aria-expanded", off ? "false" : "true"); });
      h.setAttribute("aria-expanded", "true"); h.setAttribute("role", "button"); h.tabIndex = 0;
      h.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); h.click(); } });
    });
    ui.parcelList.addEventListener("change", function () { if (S.res) onImport(); });
    ui.cutSide.addEventListener("change", function () { if (S.res) onFetch(); });
    ui.btnPickSite.addEventListener("click", function () {
      sitePickMode = !sitePickMode; pickMode = false; ui.btnPick.classList.remove("on");
      ui.btnPickSite.classList.toggle("on", sitePickMode); map.getContainer().classList.toggle("leaflet-crosshair", sitePickMode);
      status(sitePickMode ? "Drag the map to any lot and click inside it to make it the site." + (BUNDLED ? " This shared copy carries " + presets.length + " stored sites (the red pins)." : "") : "Site pick cancelled.", "info");
    });
    ui.btnSaveSite.hidden = BUNDLED;   // the shared copy cannot save files (and has nothing new to save)
    ui.btnSaveSite.addEventListener("click", onSaveSite);
    ui.siteFile.addEventListener("change", onOpenSiteFile);
    ui.schemeBtns = { single: $("rbSingle"), courtyard: $("rbCourtyard"), side_by_side: $("rbSide") };
    ui.tabs = { map: $("tabMap"), "3d": $("tab3d"), section: $("tabSection"), plans: $("tabPlans") };
    ui.panes = { map: $("paneMap"), "3d": $("pane3d"), section: $("paneSection"), plans: $("panePlans") };
    ui.stepBadges = Array.prototype.slice.call(document.querySelectorAll(".step .badge, .rhead .badge"));
    M.CUT_SIDES_M.forEach(function (s) { var o = el("option", null, s + " x " + s + " m"); o.value = String(s); if (s === M.CUT_DEFAULT_SIDE_M) o.selected = true; ui.cutSide.appendChild(o); });
    M.COURTYARDS_M.forEach(function (c) { var o = el("option", null, c + " m"); o.value = String(c); ui.courtyardSel.appendChild(o); });
    M.REAR_DEPTHS_M.forEach(function (d) { var o = el("option", null, d + " m"); o.value = String(d); if (d === M.REAR_DEPTH_DEFAULT_M) o.selected = true; ui.rearDepthSel.appendChild(o); });
    ui.assumptions.textContent = "Assumed, not checked: " + core.RULES.assumptions.join(" ") + " The multiple-building rows are used only by the massing options in step 4; " + M.FORM_RULES.source.note;
    $("sourceLine").textContent = core.RULES.source.document + ". " + core.RULES.source.version + ", accessed " + core.RULES.source.accessed + ". By-law values in metres; drawn values in mm.";
    ui.btnFetch.addEventListener("click", onFetch);
    ui.address.addEventListener("keydown", function (e) { if (e.key === "Enter") onFetch(); });
    ui.btnPick.addEventListener("click", function () { if (!S.parcel) return; pickMode = !pickMode; sitePickMode = false; ui.btnPickSite.classList.remove("on"); ui.btnPick.classList.toggle("on", pickMode); status(pickMode ? "Click on the map near the street-facing edge of the site." : "Pick cancelled.", "info"); });
    ui.edgeSelect.addEventListener("change", function () { S.click = null; if (S.parcel) onGenerate(); else setReady(); });
    ui.chkHide.addEventListener("change", onHideToggle);
    Object.keys(ui.schemeBtns).forEach(function (k) { ui.schemeBtns[k].addEventListener("click", function () { applyForm(k, S.scheme === k); }); });
    ui.courtyardSel.addEventListener("change", function () { if (S.scheme === "courtyard") applyForm("courtyard", true); });
    ui.rearDepthSel.addEventListener("change", function () { if (S.scheme === "courtyard") applyForm("courtyard", true); });
    ui.btnFormClear.addEventListener("click", onFormClear);
    ui.btnCopy.addEventListener("click", onCopy); ui.btnClear.addEventListener("click", onClear);
    ["chkRoads", "chkParcels", "chkBuildings"].forEach(function (id) { ui[id].addEventListener("change", function () { if (S.square) { drawContext(); if (S.placed) { drawEnvelope(); drawForm(); setExistingVisible(!ui.chkHide.checked); } markDirty(); } }); });
    Object.keys(ui.tabs).forEach(function (k) { ui.tabs[k].addEventListener("click", function () { showView(k); }); });
    window.addEventListener("resize", function () { if (!ui.panes.section.hidden) drawSection(); });
  }
  function start() {
    resetState(); bind(); initMap(); reportReset(); fillRules(); fillResults(); fillForm(); setScheme(null); setReady(); showView("map");
    loadPresets().then(function () {
      if (BUNDLED && !presets.some(function (p) { return p.address === EXAMPLE_ADDRESS; })) {
        status(presets.length ? "Pick a preloaded site from the address list and fetch it." : "Open a site file to start.", "info"); return;
      }
      ui.address.value = EXAMPLE_ADDRESS;
      status("Example site loading: " + EXAMPLE_ADDRESS + " (an R1-1 lot in Dunbar). Type your own address or pick a site on the map to start over.", "busy");
      onFetch();   // a working state at rest: the fetch imports the site and draws the envelope by itself
    });
  }
  // the massing options live in the panel on the right; it opens when the site has its envelope
  function openRight(show) {
    ui.rightPanel.hidden = !show; ui.btnRightOpen.hidden = show || !S.placed;
    setTimeout(function () { map.invalidateSize(); if (three) three.resize(); }, 30);
  }
  // step 4 has two sources of massing: the by-law form options and the CMHC catalogue
  var massingMode = "forms";
  function setMassingMode(mode) {
    massingMode = mode;
    ui.panelForms.hidden = mode !== "forms"; ui.panelCmhc.hidden = mode !== "cmhc";
    ui.modeForms.classList.toggle("on", mode === "forms"); ui.modeForms.setAttribute("aria-selected", mode === "forms" ? "true" : "false");
    ui.modeCmhc.classList.toggle("on", mode === "cmhc"); ui.modeCmhc.setAttribute("aria-selected", mode === "cmhc" ? "true" : "false");
    if (mode === "cmhc" && !S.cmhc && S.ev && S.ev.status === "ok" && S.placed) onCmhc(false);
  }

  return { start: start, state: function () { return S; }, map: function () { return map; }, three: function () { return three; }, zoomToSite: zoomToSite, showView: showView,
    applyForm: applyForm, onFetch: onFetch, onImport: onImport, onGenerate: onGenerate, exportSite: exportSite, bundled: BUNDLED };
})();
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", App.start); else App.start();
