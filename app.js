/* app.js -- Lotwise, the City of Vancouver R1-1 schematic design tool: the five-step sidebar, the map/plan, the 3D view and
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
  // the components (ui.js): props in, callbacks out; the app never touches their DOM
  var statusC, tabsC, modeC, schemeC, cmhcC, leftC, rightC, pickC, pickSiteC, tables = {}, mixC = {}, plansBusy = null;
  var TAB_ITEMS = [{ id: "map", label: "Map", panel: "paneMap" }, { id: "siteplan", label: "Site plan", panel: "paneSitePlan" }, { id: "3d", label: "3D", panel: "pane3d" }, { id: "section", label: "Site section", panel: "paneSection" }, { id: "plans", label: "Floor plans", panel: "panePlans" }];
  var SCHEME_LABELS = { single: "Single building", courtyard: "Courtyard", side_by_side: "Side by side" };
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
      form: null, formBases: null, scheme: null, existingIds: [], cutSide: M.CUT_DEFAULT_SIDE_M, cmhc: null, cmhcPick: null, unitsOption: null, mix: null };
  }

  // ------------------------------------------------------------------ status / report
  function status(text, level) { statusC.update({ text: text, level: level || "info" }); }
  function report(lines) {
    if (typeof lines === "string") lines = [lines];
    ui.report.textContent += lines.join("\n") + "\n";
    ui.report.scrollTop = ui.report.scrollHeight;
  }
  function reportReset() {
    var R = core.RULES.source;
    ui.report.textContent = "";
    report(["LOTWISE: R1-1 MASSING", "Source: " + R.document, "Version: " + R.version + " | Accessed: " + R.accessed, "URL: " + R.url, "NOTE: " + R.note, ""]);
  }

  // ------------------------------------------------------------------ tables (R1UI.table)
  // massing.js gives rows as arrays, with a {header} object opening a group; the by-law rows carry their state in column 4
  function tableRows(rows, stateCol) {
    return rows.map(function (r) { return r.header ? { group: r.header } : { cells: r, state: stateCol !== undefined ? r[stateCol] : undefined }; });
  }
  function fillRules() {
    var form = S.form && S.form.status === "ok" ? S.form : null, rows = [];
    M.rulesGroups(S.ev, form).forEach(function (g) { rows.push({ header: g.title }); g.rows.forEach(function (r) { rows.push(r); }); });
    tables.rules.update({ rows: tableRows(rows, 4) });
  }
  function fillResults() { tables.results.update({ rows: tableRows(M.resultsRows(S.ev, S.base, S.zone, S.parcel)) }); }
  function fillForm() { tables.form.update({ rows: tableRows(S.form ? M.formRows(S.form, S.ev) : []) }); }

  // ------------------------------------------------------------------ enabling by state
  function setReady() {
    var haveSite = !!S.parcel, haveModel = !!S.square, haveEnv = !!(S.ev && S.ev.status === "ok" && S.placed);
    ui.edgeSelect.disabled = !haveSite; pickC.update({ disabled: !haveSite });
    schemeC.update({ disabled: !haveEnv });
    var bylawUp = !!(S.form && S.form.status === "ok" && S.form.scheme !== "cmhc");
    ui.btnFormClear.disabled = !bylawUp; ui.unitParams.disabled = !bylawUp; ui.btnFormPlans.disabled = !(bylawUp && S.unitsOption); ui.btnFormSection.disabled = !haveEnv;
    ui.btnCmhcClear.disabled = !(S.form && S.form.scheme === "cmhc"); ui.btnCmhcPlans.disabled = !S.cmhcPick; ui.btnCmhcSection.disabled = !haveEnv;
    tabsC.update({ items: tabItems({ "3d": !haveModel, section: !haveSite, plans: !S.unitsOption, siteplan: !haveEnv }) });
    rightC.update({ disabled: !haveEnv && ui.rightPanel.hidden });
    ui.stepBadges.forEach(function (b, i) {
      var done = [haveModel, !!S.ev, haveEnv, !!(S.form && S.form.status === "ok")][i];
      b.classList.toggle("done", !!done);
    });
  }
  function tabItems(off) { return TAB_ITEMS.map(function (t) { return { id: t.id, label: t.label, panel: t.panel, disabled: !!off[t.id] }; }); }
  function setScheme(key) {
    S.scheme = key;
    schemeC.update({ value: key });
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
    // the basemap: OpenStreetMap tiles shown desaturated and lightened by the page's stylesheet, in the manner of the
    // "subtle grayscale" map style (white roads, light grey blocks, faint labels), so the site drawing reads first
    var attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    tileLayer = BUNDLED
      ? new StoredTiles("tiles/{z}/{x}/{y}.png", { minZoom: 12, maxNativeZoom: 18, maxZoom: 20, errorTileUrl: BLANK_TILE, attribution: attribution + " (tiles stored with this page around the preloaded sites)" })
      : L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 20, attribution: attribution });
    tileLayer.addTo(map);
    presetLayer = L.layerGroup().addTo(map);
    ["topo", "roads", "parcels", "buildings", "cut", "site", "envelope", "forms", "dims", "section"].forEach(function (k) { layers[k] = L.layerGroup().addTo(map); });
    map.on("click", function (e) {
      if (sitePickMode) {
        sitePickMode = false; pickSiteC.update({ pressed: false }); map.getContainer().classList.remove("leaflet-crosshair");
        pickSiteAt(e.latlng.lat, e.latlng.lng); return;
      }
      if (!pickMode || !S.parcel) return;
      var xy = S.res.frame.toXY(e.latlng.lng, e.latlng.lat);
      pickMode = false; pickC.update({ pressed: false });
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
    if (S.unitsOption) {   // ground-floor units in their colours, labelled; the exterior stairs and walkways in grey
      R1Cmhc.unitVolumes(S.unitsOption, S.form).filter(function (v) { return v.floor_index === 0; }).forEach(function (v) {
        poly(v.pts, { color: "#ffffff", weight: 1, fillColor: v.color, fillOpacity: 0.7, interactive: false }, "forms");
        label(v.centroid, v.unit, 0, "unitlbl", "forms");
      });
      var ap = R1Access.plan(S.unitsOption);
      S.form.buildings.forEach(function (b) {
        var B = ap.blocks[b.key]; if (!B) return;
        B.walkways.forEach(function (w) { poly(R1Access.rectSite(b, B, w.x0, w.x1, w.y0, w.y1), { color: "#4b5563", weight: 1, dashArray: "4 3", fillColor: "#e9ebe6", fillOpacity: 0.5, interactive: false }, "forms"); });
        B.stairs.forEach(function (st) { poly(R1Access.rectSite(b, B, st.x0, st.x1, st.y0, st.y1), { color: "#1f2933", weight: 1, fillColor: "#f1f2ef", fillOpacity: 0.9, interactive: false }, "forms"); });
      });
    }
    M.formDimensionPlan(S.ev, S.form, off).forEach(function (spec) { drawDimension(spec, ctx, "forms", { color: COLORS.dim }); });
    if (S.envelopeLayer) S.envelopeLayer.remove();     // the envelope would show through where the form is smaller
  }
  function drawSectionMarker() {
    clearLayers(["section"]);
    if (!S.ev || S.ev.status !== "ok") return;
    var sp = M.sectionPlan(S.ev, S.form && S.form.status === "ok" ? S.form : null, S.formBases, envelopeBaseZ(), M.dimOffsetM(SECTION_SCALE), S.unitsOption);
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
    var svg = sectionSvg(host.clientWidth || 800);
    if (typeof svg === "string") { host.appendChild(el("p", "empty", svg)); return; }
    host.appendChild(svg);
    sectionDirty = false;
  }
  /* sectionSvg(W): the site section as an SVG element W px wide (a message string when there is nothing to cut);
     used by the Site section tab and, beside the floor plans, by the Floor plans sheet */
  function sectionSvg(W) {
    if (!S.ev || S.ev.status !== "ok") return S.parcel ? "Generate the envelope to cut the section." : "Import a site, then generate the envelope to cut the section.";
    var form = S.form && S.form.status === "ok" ? S.form : null;
    var sp = M.sectionPlan(S.ev, form, S.formBases, envelopeBaseZ(), M.dimOffsetM(SECTION_SCALE), S.unitsOption);
    if (!sp) return "The section line misses the lot.";
    var margin = 15, half = (sp.lot[1] - sp.lot[0]) / 2 + margin, mid = (sp.lot[0] + sp.lot[1]) / 2;
    var s0 = mid - half, s1 = mid + half, zLo = sp.z_low - 1, zHi = sp.z_high + 1.5;
    var prof = [];
    for (var s = s0; s <= s1 + 1e-9; s += 1) prof.push([s, M.groundZ(S.res, sp.c[0] + sp.dir[0] * s, sp.c[1] + sp.dir[1] * s)]);
    var gmin = Math.min.apply(null, prof.map(function (p) { return p[1]; })), gmax = Math.max.apply(null, prof.map(function (p) { return p[1]; }));
    zLo = Math.min(zLo, gmin - 3); zHi = Math.max(zHi, gmax + 2);
    var ROW_H = 12, ROWS = 5, pad = 36, k = (W - 2 * pad) / (s1 - s0), head = 11 + ROWS * ROW_H + 6, H = (zHi - zLo) * k + 2 * pad + head;
    var svgNS = "http://www.w3.org/2000/svg", svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("width", "100%"); svg.style.maxWidth = "100%"; svg.setAttribute("data-w", W); svg.setAttribute("data-h", Math.round(H)); svg.setAttribute("font-family", "Helvetica Neue, Helvetica, Arial, sans-serif");
    function X(sv) { return pad + (sv - s0) * k; } function Y(z) { return pad + head + (zHi - z) * k; }
    function add(tag, attrs, text) { var e = document.createElementNS(svgNS, tag); Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); }); if (text !== undefined) e.textContent = text; svg.appendChild(e); return e; }
    // ground block
    var pts = prof.map(function (p) { return X(p[0]) + "," + Y(p[1]); });
    add("polygon", { points: pts.join(" ") + " " + X(s1) + "," + Y(zLo) + " " + X(s0) + "," + Y(zLo), fill: "#d3dac6", stroke: "none" });
    add("polyline", { points: pts.join(" "), fill: "none", stroke: "#4f5a3f", "stroke-width": 1.4 });
    // buildings: the outline, and, with a unit option, one box per unit per floor in its colour with its programme
    var haveUnits = sp.units && sp.units.length;
    sp.buildings.forEach(function (b) {
      var col = b.key === "envelope" ? COLORS.envelope : (S.form && S.form.scheme === "cmhc" ? COLORS.cmhc : COLORS.form);
      add("rect", { x: X(b.s0), y: Y(b.z1), width: (b.s1 - b.s0) * k, height: (b.z1 - b.z0) * k, fill: haveUnits ? "#ffffff" : col, "fill-opacity": haveUnits ? 1 : 0.75, stroke: "none" });
    });
    (sp.units || []).forEach(function (u) {
      var x = X(u.s0), y = Y(u.z1), w = (u.s1 - u.s0) * k, h = (u.z1 - u.z0) * k;
      add("rect", { x: x, y: y, width: w, height: h, fill: u.color, "fill-opacity": 0.78, stroke: "#ffffff", "stroke-width": 1 });
      if (w > 30 && h > 14) {
        var n = parseInt(u.color.slice(1), 16), dark = "rgb(" + Math.round(((n >> 16) & 255) * 0.42) + "," + Math.round(((n >> 8) & 255) * 0.42) + "," + Math.round((n & 255) * 0.42) + ")";
        var two = h > 30 && w > 54;
        add("text", { x: x + w / 2, y: y + h / 2 + (two ? -1 : 4), "font-size": Math.min(12, h * 0.42), "font-weight": 700, "text-anchor": "middle", fill: dark, "class": "secunit" }, u.label);
        if (two) add("text", { x: x + w / 2, y: y + h / 2 + 11, "font-size": 9, "text-anchor": "middle", fill: dark, "letter-spacing": ".5", "class": "secunit" }, u.sub);
      }
    });
    sp.buildings.forEach(function (b) { add("rect", { x: X(b.s0), y: Y(b.z1), width: (b.s1 - b.s0) * k, height: (b.z1 - b.z0) * k, fill: "none", stroke: "#1f2933", "stroke-width": 1.3 }); });   // the outline over the units
    // the exterior stair and the walkways the line crosses
    (sp.access || []).forEach(function (a) {
      if (a.kind === "walkway") {
        add("rect", { x: X(a.s0), y: Y(a.z), width: (a.s1 - a.s0) * k, height: Math.max(2, 0.25 * k), fill: "#b8bec6", stroke: "#1f2933", "stroke-width": 0.8 });
        var gx = a.face === "rear" ? X(a.s1) : X(a.s0);
        add("line", { x1: gx, y1: Y(a.z), x2: gx, y2: Y(a.z + R1Access.GUARD_H), stroke: "#1f2933", "stroke-width": 1 });
        // the name stands outside the walkway, away from the building face it hangs on
        if (!sp.access.some(function (b) { return b.kind === "stair" && b.block === a.block && b.face === a.face; })) add("text", { x: a.face === "rear" ? X(a.s1) + 3 : X(a.s0) - 3, y: Y(a.z) - 3, "font-size": 7, "text-anchor": a.face === "rear" ? "start" : "end", "class": "seclbl" }, "WALKWAY");
      } else {
        add("rect", { x: X(a.s0), y: Y(a.z1), width: (a.s1 - a.s0) * k, height: (a.z1 - a.z0) * k, fill: "#f1f2ef", "fill-opacity": 0.9, stroke: "#1f2933", "stroke-width": 0.8, "stroke-dasharray": "3 2" });
        add("text", { x: X((a.s0 + a.s1) / 2), y: Y((a.z0 + a.z1) / 2), "font-size": 8, "text-anchor": "middle", transform: "rotate(-90 " + X((a.s0 + a.s1) / 2) + " " + Y((a.z0 + a.z1) / 2) + ")", "class": "seclbl" }, "EXIT STAIR");
      }
    });
    // reference lines: property lines, building faces, marks
    sp.lines.forEach(function (ln) {
      if (ln.style === "site") return;   // the property lines are drawn with their labels below
      var st = ln.style === "face" ? { stroke: "#9aa4b1", "stroke-width": 0.7 } : { stroke: "#6b7280", "stroke-width": 0.8 };
      var a = { x1: X(ln.a[0]), y1: Y(ln.a[1]), x2: X(ln.b[0]), y2: Y(ln.b[1]) }; Object.keys(st).forEach(function (kk) { a[kk] = st[kk]; });
      add("line", a);
    });
    // the height limits: a dashed line over each building, named above it from inside the building's span (clear of the yard lines)
    (sp.marks || []).forEach(function (mk) {
      if (mk.kind !== "height") return;
      add("line", { x1: X(mk.s0), y1: Y(mk.z), x2: X(mk.s1), y2: Y(mk.z), stroke: COLORS.setback, "stroke-width": 1, "stroke-dasharray": "8 4" });
      var endA = mk.label_anchor === "end";
      add("text", { x: X(mk.label_s !== undefined ? mk.label_s : mk.s0) + (endA ? -4 : 6), y: Y(mk.z) - 4, "font-size": 8.5, "text-anchor": endA ? "end" : "start", "class": "secmark" }, mk.label + " [" + mk.clause + "]");
    });
    // the yard lines and property lines run up into the head band and end under their own names. The names take rows
    // so that no name sits across another line: a name may span a neighbouring mark only when that mark's name is on
    // a lower row (its line then stops short), and a name is anchored to the left or right of its line when centring
    // it would cross a neighbour. Long names are placed first.
    var vm = (sp.marks || []).filter(function (mk) { return mk.kind !== "height"; }).map(function (mk) { var t = mk.label + (mk.clause ? " [" + mk.clause + "]" : ""); return { mk: mk, text: t, x: X(mk.s), w: t.length * 4.8, row: -1, minRow: 0, box: null, anchor: "middle" }; });
    vm.slice().sort(function (a, b) { return b.w - a.w; }).forEach(function (m) {
      var best = null;
      for (var row = m.minRow; row < ROWS; row++) {
        ["middle", "end", "start"].forEach(function (anchor, ai) {
          var x0 = anchor === "middle" ? m.x - m.w / 2 : (anchor === "end" ? m.x - 3 - m.w : m.x + 3), x1 = x0 + m.w;
          if (x0 < 2 || x1 > W - 2) return;
          var under = 0, ok = vm.every(function (o) {
            if (o === m) return true;
            if (o.row === row && o.box && x0 < o.box[1] + 8 && x1 > o.box[0] - 8) return false;   // the same row: no overlap
            if (o.x > x0 - 3 && o.x < x1 + 3) { if (o.row >= 0 && o.row <= row) return false; under++; }   // a placed mark under this name would run through it; an unplaced one will have to go lower
            return true;
          });
          if (!ok) return;
          var score = row * 10 + ai + under * 4;   // the highest row, centred, spanning as few other marks as possible
          if (!best || score < best.score) best = { row: row, anchor: anchor, box: [x0, x1], score: score };
        });
      }
      if (!best) best = { row: ROWS - 1, anchor: "middle", box: [m.x - m.w / 2, m.x + m.w / 2], fallback: true };
      m.row = best.row; m.anchor = best.anchor; m.box = best.box;
      if (!best.fallback) vm.forEach(function (o) { if (o !== m && o.row < 0 && o.x > m.box[0] - 3 && o.x < m.box[1] + 3) o.minRow = Math.min(ROWS - 1, Math.max(o.minRow, m.row + 1)); });   // marks under this name get their names below it
    });
    vm.forEach(function (m) {
      var mk = m.mk, top = pad + 11 + m.row * ROW_H, setback = mk.kind === "setback";
      add("line", { x1: m.x, y1: Y(zLo), x2: m.x, y2: top + 3, stroke: setback ? COLORS.setback : COLORS.site, "stroke-width": setback ? 1 : 1.5, "stroke-dasharray": setback ? "6 4" : "none" });
      add("text", { x: m.anchor === "middle" ? m.x : (m.anchor === "end" ? m.x - 3 : m.x + 3), y: top, "font-size": 8.5, "text-anchor": m.anchor, "class": setback ? "secmark" : "seclbl" }, m.text);
    });
    // dimensions, named: the heights stand outside the drawing (front building on the left, rear building on the right),
    // their figures and names read upward beside the line; a horizontal figure too wide for its span sits past its end
    sp.dims.forEach(function (dm, di) {
      if (dm.vertical) {
        var x = X(dm.s), y0 = Y(dm.z[0]), y1 = Y(dm.z[1]), ym = (y0 + y1) / 2, left = dm.side === "left", tx = left ? x - 3 : x + 10, nx = left ? x - 13 : x + 21;
        add("line", { x1: x, y1: y0, x2: x, y2: y1, stroke: COLORS.dim, "stroke-width": 1 });
        [y0, y1].forEach(function (yy) { add("line", { x1: x - 4, y1: yy + 4, x2: x + 4, y2: yy - 4, stroke: COLORS.dim, "stroke-width": 1.5 }); });
        add("text", { x: tx, y: ym, "font-size": 11, "text-anchor": "middle", transform: "rotate(-90 " + tx + " " + ym + ")", "class": "secdim" }, mm(dm.value_m));
        add("text", { x: nx, y: ym, "font-size": 8, "text-anchor": "middle", transform: "rotate(-90 " + nx + " " + ym + ")", "class": "seclbl" }, dm.name);
      } else {
        var xa = X(dm.s[0]), xb = X(dm.s[1]), y = Y(dm.z), val = String(mm(dm.value_m)), tw = val.length * 6.4 + 6;
        add("line", { x1: xa, y1: y, x2: xb, y2: y, stroke: COLORS.dim, "stroke-width": 1 });
        [xa, xb].forEach(function (xx) { add("line", { x1: xx - 4, y1: y + 4, x2: xx + 4, y2: y - 4, stroke: COLORS.dim, "stroke-width": 1.5 }); });
        if (xb - xa >= tw) add("text", { x: (xa + xb) / 2, y: y - 4, "font-size": 11, "text-anchor": "middle", "class": "secdim" }, val);
        else if (di === 0) add("text", { x: xa - 5, y: y - 4, "font-size": 11, "text-anchor": "end", "class": "secdim" }, val);
        else add("text", { x: xb + 5, y: y - 4, "font-size": 11, "text-anchor": "start", "class": "secdim" }, val);
        if (xb - xa > dm.name.length * 4.6 + 6) add("text", { x: (xa + xb) / 2, y: y - 15, "font-size": 8, "text-anchor": "middle", "class": "seclbl" }, dm.name);
      }
    });
    // street / lane names at the ends
    if (S.res.roads) {
      var pf = [sp.c[0] + sp.dir[0] * (sp.lot[0] - 8), sp.c[1] + sp.dir[1] * (sp.lot[0] - 8)], pr = [sp.c[0] + sp.dir[0] * (sp.lot[1] + 4), sp.c[1] + sp.dir[1] * (sp.lot[1] + 4)];
      var sf = M.roadNameNear(S.res.roads, pf), sr = M.roadNameNear(S.res.roads, pr);
      if (sf) add("text", { x: X(sp.lot[0] - 8), y: Y(zLo) + 16, "font-size": 11, "text-anchor": "middle", "class": "seclbl" }, sf.name);
      if (sr) add("text", { x: X(sp.lot[1] + 4), y: Y(zLo) + 16, "font-size": 11, "text-anchor": "middle", "class": "seclbl" }, sr.name);
    }
    add("text", { x: pad, y: 18, "font-size": 12, "class": "sectitle" }, "Section A-A through the site" + (sp.cell ? " and unit " + sp.cell.unit : "") + ", street on the left  ·  1:" + SECTION_SCALE + " proportions, mm");
    return svg;
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
  // a block with its programme painted on the faces (large letters in a darker shade of the block's colour)
  var faceTexCache = {};
  function faceTexture(lines, color) {
    var key = lines.join("|") + color;
    if (faceTexCache[key]) return faceTexCache[key];
    var cv = document.createElement("canvas"); cv.width = 1024; cv.height = 512;
    var ctx = cv.getContext("2d");
    ctx.fillStyle = color; ctx.globalAlpha = 0.82; ctx.fillRect(0, 0, cv.width, cv.height); ctx.globalAlpha = 1;
    var n = parseInt(color.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    ctx.fillStyle = "rgb(" + Math.round(r * 0.42) + "," + Math.round(g * 0.42) + "," + Math.round(b * 0.42) + ")";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    var size = 200, gap = 0.9;
    lines.forEach(function (t) { ctx.font = "bold " + size + "px 'Helvetica Neue', Helvetica, Arial, sans-serif"; var w = ctx.measureText(t).width; if (w > cv.width * 0.9) size = Math.floor(size * cv.width * 0.9 / w); });
    size = Math.min(size, Math.floor(cv.height * 0.8 / lines.length));
    ctx.font = "bold " + size + "px 'Helvetica Neue', Helvetica, Arial, sans-serif";
    var total = lines.length * size * gap, y0 = cv.height / 2 - total / 2 + size * gap / 2;
    lines.forEach(function (t, i) { ctx.fillText(t, cv.width / 2, y0 + i * size * gap); });
    var tex = new THREE.CanvasTexture(cv); tex.anisotropy = three.renderer.capabilities.getMaxAnisotropy();
    faceTexCache[key] = tex; return tex;
  }
  // a box on a plan quad [front-s1, rear-s1, rear-s2, front-s2] from z0, h high, with the text on its four sides
  function labelledBox(pts, z0, h, color, lines) {
    var ux = pts[3][0] - pts[0][0], uy = pts[3][1] - pts[0][1], vx = pts[1][0] - pts[0][0], vy = pts[1][1] - pts[0][1];
    var W = Math.hypot(ux, uy), D = Math.hypot(vx, vy), ang = Math.atan2(uy, ux), c = site.centroid(pts);
    var geo = new THREE.BoxGeometry(W, h, D); geo.rotateX(Math.PI / 2);   // local x across, z up, -y toward the street
    var tex = faceTexture(lines, color), side = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95 });
    var plain = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.6 });
    var mesh = new THREE.Mesh(geo, [side, side, plain, plain, side, side]);
    mesh.position.set(c[0], c[1], z0 + h / 2); mesh.rotation.z = ang;
    var edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x1f2933, transparent: true, opacity: 0.8 }));
    edges.position.copy(mesh.position); edges.rotation.z = ang;
    var grp = new THREE.Group(); grp.add(mesh); grp.add(edges); return grp;
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
    clearLabels3D();
    if (formUp && S.unitsOption) {   // one box per unit per floor, its programme written on its faces
      var o = S.unitsOption;
      R1Cmhc.unitVolumes(o, S.form).forEach(function (v) {
        var u = (R1Cmhc.blockOf(o, v.block).unit_list.filter(function (x) { return x.key === v.unit; })[0] || {});
        var lines = v.kind === "core" ? ["EXIT STAIR", "CORE"] : (v.kind ? [u.name ? u.name.toUpperCase() : v.unit] : [v.unit + " · " + R1Cmhc.bedsLabel(v.beds)]);
        G.add(labelledBox(v.pts, S.formBases[v.block] + v.z0, v.z1 - v.z0, v.color, lines));
      });
      // the exterior exit stairs and the open walkways that reach the upper units
      var ap = R1Access.plan(o);
      S.form.buildings.forEach(function (b) {
        var B = ap.blocks[b.key], base = S.formBases[b.key]; if (!B) return;
        B.walkways.forEach(function (w) {
          var q = R1Access.rectSite(b, B, w.x0, w.x1, w.y0, w.y1);
          G.add(extrude(q, base + w.z - 0.25, 0.25, 0xb8bec6, 1));
          var g0 = w.face === "rear" ? R1Access.rectSite(b, B, w.x0, w.x1, w.y1 - 0.06, w.y1) : R1Access.rectSite(b, B, w.x0, w.x1, w.y0, w.y0 + 0.06);
          G.add(extrude(g0, base + w.z, R1Access.GUARD_H, 0x6b7280, 0.6));   // the guard
        });
        B.stairs.forEach(function (st) { G.add(labelledBox(R1Access.rectSite(b, B, st.x0, st.x1, st.y0, st.y1), base, st.z_top + R1Access.GUARD_H, "#b8bec6", ["EXIT STAIR"])); });
      });
    } else if (formUp) S.form.buildings.forEach(function (b) { G.add(labelledBox(b.pts, S.formBases[b.key], b.height_m, "#d99a2b", [b.name.toUpperCase(), b.storeys + " STOREYS"])); });
    else if (S.ev && S.ev.status === "ok" && S.placed) G.add(labelledBox(singleQuad(S.ev) || S.ev.env_pts, envelopeBaseZ(), S.ev.height, "#3c8cdc", ["ENVELOPE", "UP TO " + S.ev.band.max_units + " UNITS"]));
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
    tabsC.update({ value: name });   // the tab strip marks the tab and shows its pane
    if (name === "map") setTimeout(function () { map.invalidateSize(); if (S.parcel && map.getZoom() < 14) zoomToSite(); }, 30);
    if (name === "3d" && S.square) { if (threeDirty) build3D(); else three.resize(); }
    if (name === "section" && sectionDirty) drawSection();
    if (name === "plans" && plansDirty) drawPlans();
    if (name === "siteplan" && sitePlanDirty) drawSitePlan();
  }
  function markDirty() {
    threeDirty = true; sectionDirty = true; plansDirty = true; sitePlanDirty = true;
    if (!ui.panes.section.hidden) drawSection(); if (!ui.panes["3d"].hidden && S.square) build3D(); if (!ui.panes.plans.hidden) drawPlans(); if (!ui.panes.siteplan.hidden) drawSitePlan();
  }
  // the plan sheets read as a rotation of the map (street at the top): when side 1 lies on the right of that view, the floor plans mirror to match
  function plansMirror() { return S.ev && S.ev.status === "ok" ? R1SitePlan.frame(S.ev).mirror : false; }

  // ------------------------------------------------------------------ the site plan sheet
  var sitePlanDirty = true, sitePlanOpts = { carshare: null, outdoor: "shared", k: 12 };
  function drawSitePlan() {
    var host = ui.sitePlanHost; host.innerHTML = "";
    if (!(S.ev && S.ev.status === "ok" && S.placed)) { host.appendChild(el("p", "empty", "Fetch a site: the site plan follows the envelope.")); sitePlanDirty = false; return; }
    var form = S.form && S.form.status === "ok" ? S.form : null, o = form ? S.unitsOption : null;
    var sheet = R1SitePlan.sheet({ ev: S.ev, form: form, option: o, res: S.res, det: S.det, parcel: S.parcel, address: S.address }, sitePlanOpts);
    var head = el("div", "sheet-head");
    head.appendChild(el("h2", null, "Site plan" + (S.address ? ": " + S.address : "") + (o ? " · " + (o.source === "cmhc" ? "CMHC " : "") + o.name : (form ? " · " + form.name : " · permitted envelope"))));
    head.appendChild(el("p", null, "Street at the top and the lane at the bottom, as on the floor-plan sheet (the north arrow gives the orientation). Yard lines of the R1-1 schedule, the ground-floor units in their colours, entries, the exterior exit stairs and walkways, paths, a car-share stall off the lane and the shared outdoor space; dimensions in mm, in halftone."));
    host.appendChild(head);
    var tools = el("div"); host.appendChild(tools);
    R1UI.toolbar(tools, { ariaLabel: "Site plan options", groups: [
      { id: "carshare", label: "Car share", items: [{ id: "0", label: "None" }, { id: "1", label: "1 stall" }, { id: "2", label: "2 stalls" }], value: String(sitePlanOpts.carshare === null ? sheet.stalls : sitePlanOpts.carshare), onChange: function (id) { sitePlanOpts.carshare = parseInt(id, 10); drawSitePlan(); } },
      { id: "outdoor", label: "Outdoor space", items: [{ id: "shared", label: "Shared" }, { id: "patios", label: "Shared + patios" }], value: sitePlanOpts.outdoor, onChange: function (id) { sitePlanOpts.outdoor = id; drawSitePlan(); } },
      { id: "scale", label: "Scale", items: [{ id: "9", label: "Small" }, { id: "12", label: "Medium" }, { id: "16", label: "Large" }], value: String(sitePlanOpts.k), onChange: function (id) { sitePlanOpts.k = parseInt(id, 10); drawSitePlan(); } }] });
    var row = el("div", "sheet-row"), body = el("div", "sheet-body"), aside = el("div", "sheet-aside");
    body.innerHTML = sheet.svg; row.appendChild(body); row.appendChild(aside); host.appendChild(row);
    var lg = el("div", "sheet-legend"); lg.innerHTML = sheet.legend; aside.appendChild(lg);
    var table = el("table"), tbody = el("tbody");
    sheet.rows.forEach(function (r) { var tr = el("tr"), th = el("th", null, r[0]); th.scope = "row"; tr.appendChild(th); tr.appendChild(el("td", null, r[1])); tbody.appendChild(tr); });
    table.appendChild(tbody); table.className = "ui-table sheet-table"; aside.appendChild(table);
    var notes = el("div", "sheet-notes"); notes.innerHTML = sheet.notes.map(function (n) { return "<p>" + esc(n) + "</p>"; }).join(""); aside.appendChild(notes);
    sitePlanDirty = false;
  }

  // ------------------------------------------------------------------ the floor-plan sheet
  var plansDirty = true, plansFloor = null, plansScale = 20, plansSection = true, plansTimer = null;
  // the sheet takes a moment (rooms, doors, furniture placed clear of the doors, the check): say so, then draw
  function drawPlans() {
    var host = ui.plansHost, o = S.unitsOption;
    plansDirty = false;
    if (plansBusy) { plansBusy.destroy(); plansBusy = null; }
    if (!o || !S.form || S.form.status !== "ok") { host.innerHTML = ""; host.appendChild(el("p", "empty", "Draw a massing option in step 4, then open its floor plans.")); return; }
    host.innerHTML = ""; plansBusy = R1UI.busy(host, { text: "Laying out the rooms, placing the furniture clear of the doors and checking the clearances…" });
    status("Drawing the floor plans of " + o.name + " and checking them…", "busy");
    if (plansTimer) clearTimeout(plansTimer);
    plansTimer = setTimeout(function () { plansTimer = null; drawPlansNow(); }, 30);
  }
  function drawPlansNow() {
    var host = ui.plansHost, o = S.unitsOption;
    if (plansBusy) { plansBusy.destroy(); plansBusy = null; }
    host.innerHTML = "";
    if (!o || !S.form || S.form.status !== "ok") { host.appendChild(el("p", "empty", "Draw a massing option in step 4, then open its floor plans.")); plansDirty = false; return; }
    var floorNames = [];
    o.blocks.forEach(function (b) { b.floors.forEach(function (f) { if (floorNames.indexOf(f.name) < 0) floorNames.push(f.name); }); });
    if (plansFloor && floorNames.indexOf(plansFloor) < 0) plansFloor = null;
    var head = el("div", "sheet-head");
    head.appendChild(el("h2", null, (o.source === "cmhc" ? "CMHC " : "") + o.name + ": schematic floor plans"));
    var access = R1Access.plan(o), stairs = R1Access.hasStairs(access), core = R1Access.hasCore(access);
    head.appendChild(el("p", null, (S.address ? S.address + " · " : "") + o.units + " units (" + R1Cmhc.unitMix(o) + "). Street at the top, lane at the bottom; a red arrow marks an entry; dimensions in mm. " +
      (core ? "Upper units open onto the corridor of a shared single exit stair core." : (stairs ? "Upper units are reached by an exterior single exit stair and open walkway (dashed where it passes overhead)." : "Every unit is entered at grade."))));
    host.appendChild(head);
    var tools = el("div"); host.appendChild(tools);
    R1UI.toolbar(tools, { ariaLabel: "Floor plan options", groups: [
      { id: "floor", label: "Floor", items: [{ id: "all", label: "All" }].concat(floorNames.map(function (fn) { return { id: fn, label: fn }; })), value: plansFloor || "all", onChange: function (id) { plansFloor = id === "all" ? null : id; drawPlans(); } },
      { id: "scale", label: "Scale", items: [{ id: "14", label: "Small" }, { id: "20", label: "Medium" }, { id: "28", label: "Large" }], value: String(plansScale), onChange: function (id) { plansScale = parseInt(id, 10); drawPlans(); } },
      { id: "section", label: "Site section", items: [{ id: "show", label: "Show" }, { id: "hide", label: "Hide" }], value: plansSection ? "show" : "hide", onChange: function (id) { plansSection = id === "show"; drawPlans(); } }] });
    if (plansSection) {   // the site section beside the plan options, so plans and section read together
      var secWrap = el("div", "sheet-section"), secSvg = sectionSvg(Math.min(900, (host.clientWidth || 900) - 44));
      if (typeof secSvg !== "string") { secWrap.appendChild(el("h3", null, "Site section A-A")); secWrap.appendChild(secSvg); host.appendChild(secWrap); }
    }
    var plans = R1Plans.sheet(o, { k: plansScale, floors: plansFloor ? [plansFloor] : null, mirror: plansMirror() });
    var body = el("div", "sheet-body"); body.innerHTML = plans.svg; host.appendChild(body);
    var lg = el("div", "sheet-legend"); lg.innerHTML = plans.legend; host.appendChild(lg);
    var issues = R1Plans.check(o), chk = el("div"); host.appendChild(chk);
    R1UI.notice(chk, issues.length
      ? { tone: "warn", title: "Plan check: " + issues.length + " item" + (issues.length > 1 ? "s" : "") + " to resolve.", items: issues }
      : { tone: "ok", title: "Plan check passed.", text: "Every room has its door (860 mm or wider), the furniture stands clear of every door swing and its 0.76 m approach, halls, baths, bedrooms, living rooms, kitchens and stairs meet the test fits, stairs stack, every unit holds the bedrooms of its type, and every unit has its way in." });
    status("Floor plans of " + o.name + " drawn" + (issues.length ? "; the plan check lists " + issues.length + " item" + (issues.length > 1 ? "s" : "") + " to resolve." : "; the plan check passed."), issues.length ? "error" : "ok");
    var notes = el("div", "sheet-notes");
    var accessHtml = access.notes.length ? "<p>" + esc(R1Access.lines(access).join(" ")) + " " + esc(access.notes.join(" ")) + "</p>" : "";
    if (o.source === "cmhc") {
      var links = o.blocks.map(function (b) { return R1Cmhc.url(b.design) ? '<a href="' + R1Cmhc.url(b.design) + '" target="_blank" rel="noopener">' + esc(b.design.name) + "</a>" : null; }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
      notes.innerHTML = "<p>Layout: entry and living toward the face each unit is entered from, kitchen behind, bedrooms upstairs; walls 300 mm outside, 250 mm between units, 120 mm inside; areas are each unit's share of the footprint. CMHC's own drawings: " + links.join(", ") + ". " + esc(R1Cmhc.SOURCE.note) + "</p>" + accessHtml;
    } else {
      notes.innerHTML = o.blocks.map(function (b) { return "<p><b>" + esc(b.name) + ":</b> " + esc(b.design.layout) + "</p>"; }).join("") + accessHtml +
        o.checks.map(function (c) { return "<p>" + (c.ok ? "OK: " : "<b>Check:</b> ") + esc(c.name + ": " + c.detail) + " [" + esc(c.clause) + "]</p>"; }).join("") +
        o.notes.map(function (n) { return "<p>" + esc(n) + "</p>"; }).join("");
    }
    host.appendChild(notes);
    plansDirty = false;
  }
  function showFloorPlans() {
    if (!(S.unitsOption && S.form && S.form.status === "ok")) { status("Draw a massing option first (step 4).", "error"); return; }
    plansDirty = true; showView("plans");
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
    return { format: "r1-1-site/1", app: "Lotwise", saved: new Date().toISOString(), address: S.address, civic: na[0], street: na[1],
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
  // the envelope as a quad in the [front-s1, rear-s1, rear-s2, front-s2] order the unit code uses
  function singleQuad(ev) {
    var R = core.RULES, E = ev.edges, idx = ev.idx, f = idx.front, s1 = idx.side1, s2 = idx.side2, fy = R.front_yard_m.value, sy = R.side_yard_m.value;
    return M.quad([M.offsetLine(E[f], fy), M.offsetLine(E[s1], sy), M.offsetLine(E[f], fy + ev.env_depth), M.offsetLine(E[s2], sy)]);
  }
  // the single-building form as a drawable building (the envelope itself), so units can be laid out in it
  function singleForm(ev) {
    var R = core.RULES, E = ev.edges, idx = ev.idx, f = idx.front, hm = R.max_height_m, pts = singleQuad(ev);
    if (!pts) return null;
    return { scheme: "single", dims_like: "single", name: M.schemeName("single"), status: "ok", reason: null, gaps: [], labels: [], notes: [], params: {},
      buildings: [M.building("single", "Single building", pts, hm.value, hm.storeys, hm.clause.split(" ")[0], E[f])] };
  }
  function unitOpts() { return { units: parseInt(ui.unitsSel.value, 10) || undefined, tenure: ui.tenureSel.value || "other", ground: ui.groundSel.value || "residential", access: ui.accessSel.value || "exterior", mix: S.mix }; }
  // the unit-mix steppers: 3-bed and 2-bed counts capped by the cells large enough, studios capped by the single-level cells left, 1-beds the rest
  function fillMixSelects(o) {
    var mix = o && o.mix, lim = mix && mix.limits;
    if (!mix) { ["b3", "b2", "b0"].forEach(function (k) { mixC[k].update({ value: 0, max: 0, disabled: true, help: "draw a form first" }); }); ui.mix1Out.textContent = ""; ui.btnMixAuto.disabled = true; return; }
    mixC.b3.update({ value: mix.b3, max: lim.max3, disabled: false, help: null, maxReason: lim.max3 ? "cells of 105 m² or more" : "no cell reaches 105 m²" });
    mixC.b2.update({ value: mix.b2, max: lim.max2, disabled: false, help: null, maxReason: lim.max2 ? "cells of 65 m² or more" : "no cell reaches 65 m²" });
    mixC.b0.update({ value: mix.b0, max: lim.max0, disabled: false, help: null, maxReason: lim.max0 ? "single-level units" : "no single-level unit" });
    ui.mix1Out.textContent = mix.b1 + (mix.custom ? " (set by hand)" : " (by area)");
    ui.btnMixAuto.disabled = !mix.custom;
  }
  function readMix() { return { b3: mixC.b3.value, b2: mixC.b2.value, b0: mixC.b0.value }; }
  function onMixChange() { S.mix = readMix(); if (S.scheme && S.form && S.form.scheme !== "cmhc") applyForm(S.scheme, true); }
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
    // the unit configuration for this form: dwellings, tenure, ground-floor use, access and mix from the Units fields
    if (!keepUnits) S.mix = null;
    var opts = unitOpts(); if (!keepUnits) opts.units = undefined;
    var o = R1Units.configure(form, S.ev, opts);
    S.unitsOption = o.blocks.length ? o : null;
    if (S.unitsOption) trimForm(form, o);   // buildings trimmed to FSR by the configurator are redrawn at that depth
    fillUnitsSelect(o); fillMixSelects(S.unitsOption);
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
    cmhcC.update({ value: null });
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function resetCmhc() { S.cmhc = null; clearCmhcPick(); cmhcC.update({ items: [], loading: false }); ui.cmhcNote.textContent = ""; }
  // the catalogue fit takes a moment: the list shows its loading state first, then the options
  function onCmhc(quiet) {
    if (!(S.ev && S.ev.status === "ok" && S.placed)) { if (!quiet) status("The site needs an envelope first (step 3).", "error"); return; }
    cmhcC.update({ loading: true }); ui.cmhcNote.textContent = "";
    setTimeout(function () {
      if (!(S.ev && S.ev.status === "ok" && S.placed)) { cmhcC.update({ loading: false, items: [] }); return; }
      S.cmhc = R1Cmhc.fits(S.ev); clearCmhcPick(); fillCmhcList();
      report(R1Cmhc.fitLines(S.cmhc, S.ev).concat([""]));
      var ok = S.cmhc.options.filter(function (o) { return o.ok; });
      ui.cmhcNote.textContent = (ok.length ? ok.length + " of " + S.cmhc.options.length + " catalogue options fit this site. Click a fitting option to draw it as the massing (units in colour) and see its unit configuration; the rest list the failing rule."
        : "No catalogue design fits this envelope as drawn; the list gives the rule each one fails.");
      if (!quiet) status(ok.length + " of " + S.cmhc.options.length + " catalogue options fit this site. Click one to draw it.", ok.length ? "ok" : "error");
      setReady();
    }, 20);
  }
  function fillCmhcList() {
    cmhcC.update({ loading: false, value: S.cmhcPick ? S.cmhcPick.key : null, items: R1Cmhc.fitRows(S.cmhc).map(function (r) {
      var o = r.option;
      return { id: o.key, title: o.name, badge: { text: r.ok ? "fits" : "no fit", tone: r.ok ? "ok" : "no" }, meta: o.units + " unit" + (o.units === 1 ? "" : "s") + " · " + R1Cmhc.unitMix(o) + " · " + r.cells[2], disabled: !r.ok, reason: r.ok ? null : o.reason };
    }) });
  }
  function cmhcOption(key) { return S.cmhc ? S.cmhc.options.filter(function (o) { return o.key === key; })[0] || null : null; }
  function applyCmhc(o) {
    var form = R1Cmhc.form(S.ev, o);
    clearCmhcPick(); cmhcC.update({ value: o.key });
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
    var table = el("table"); host.appendChild(table);
    R1UI.table(table, { caption: "Units of " + o.name, captionHidden: true, dense: true,
      columns: [{ label: "Colour", hidden: true }, { label: "Unit" }, { label: "Bedrooms" }, { label: "Baths" }, { label: "Floors" }, { label: "Area", kind: "status" }, { label: "Note" }],
      rows: R1Cmhc.unitRows(o).map(function (r) { var dot = el("span", "unitsw"); dot.style.background = r.color; dot.setAttribute("role", "img"); dot.setAttribute("aria-label", "colour of " + r.cells[0]); return { cells: [dot].concat(r.cells) }; }) });
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
    var al = R1Access.lines(R1Access.plan(o));
    host.appendChild(el("p", "muted", (al.length ? al.join(" ") + " " : "Every unit is entered at grade. ") + "Same colours on the map (ground floor), in 3D, in the section and in the floor plans. Areas are shares of the footprint, not measured floor areas."));
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
      "btnClear", "status", "chkRoads", "chkParcels", "chkBuildings", "sectionHost", "threeHost", "viewTabs", "plansHost", "sitePlanHost", "btnSaveSite", "siteFile", "presetList", "sourceNote",
      "btnCmhcClear", "cmhcList", "cmhcNote", "unitsPanel", "btnCmhcPlans", "btnFormSection", "btnCmhcSection", "btnPickSite", "massingMode", "schemeSeg", "panelForms", "panelCmhc", "rightPanel", "btnRightClose", "btnRightToggle", "btnLeftToggle", "sidePanel",
      "accessSel", "mix3Host", "mix2Host", "mix0Host", "mix1Out", "btnMixAuto"].forEach(function (id) { ui[id] = $(id); });
    ui.panes = { map: $("paneMap"), siteplan: $("paneSitePlan"), "3d": $("pane3d"), section: $("paneSection"), plans: $("panePlans") };
    // ---- the components: the status strip, the view tabs, the two segmented controls, the tables, the option list, the mix steppers, the toggles
    statusC = R1UI.status(ui.status, { text: "Ready.", level: "info" });
    tabsC = R1UI.tabs(ui.viewTabs, { ariaLabel: "Views", items: tabItems({ siteplan: true, "3d": true, section: true, plans: true }), value: "map", onChange: showView });
    modeC = R1UI.segmented(ui.massingMode, { ariaLabel: "Massing source", items: [{ id: "forms", label: "By-law forms" }, { id: "cmhc", label: "CMHC catalogue" }], value: "forms", onChange: setMassingMode });
    schemeC = R1UI.segmented(ui.schemeSeg, { ariaLabel: "Form", disabled: true, value: null, items: M.SCHEMES.map(function (s) { return { id: s.key, label: SCHEME_LABELS[s.key] || s.name, title: s.name }; }),
      onChange: function (k) { applyForm(k, false); }, onReselect: function (k) { applyForm(k, true); } });   // choosing the drawn form again keeps its unit settings
    tables.rules = R1UI.table(ui.rules, { caption: "By-law rules for this site", captionHidden: true, emptyText: "Fetch a site to check its rules.", columns: [{ label: "Regulation" }, { label: "R1-1" }, { label: "Clause", kind: "clause" }, { label: "This site", kind: "status" }], rows: [] });
    tables.results = R1UI.table(ui.results, { caption: "Permitted envelope", captionHidden: true, emptyText: "Fetch a site to size its envelope.", columns: [{ label: "Item" }, { label: "Value" }], rows: [] });
    tables.form = R1UI.table(ui.formTable, { caption: "The drawn form", captionHidden: true, emptyText: "No form drawn.", columns: [{ label: "Item" }, { label: "Value" }], rows: [] });
    cmhcC = R1UI.optionList(ui.cmhcList, { ariaLabel: "Catalogue designs", emptyText: "Generate the envelope: the catalogue designs are tested against it.", loadingText: "Testing the catalogue designs against the envelope…", items: [], value: null,
      onChange: function (key) { var o = cmhcOption(key); if (o) applyCmhc(o); } });
    mixC.b3 = R1UI.stepper(ui.mix3Host, { id: "mix3", label: "3-bedroom", value: 0, min: 0, max: 0, onChange: onMixChange });
    mixC.b2 = R1UI.stepper(ui.mix2Host, { id: "mix2", label: "2-bedroom", value: 0, min: 0, max: 0, onChange: onMixChange });
    mixC.b0 = R1UI.stepper(ui.mix0Host, { id: "mix0", label: "Studios", value: 0, min: 0, max: 0, onChange: onMixChange });
    leftC = R1UI.toggleButton(ui.btnLeftToggle, { label: "Show or hide the steps", pressed: true, onToggle: function (on) { ui.sidePanel.hidden = !on; setTimeout(relayout, 30); } });
    rightC = R1UI.toggleButton(ui.btnRightToggle, { title: "Show or hide the massing options", pressed: false, disabled: true, onToggle: function (on) { openRight(on); } });
    pickSiteC = R1UI.toggleButton(ui.btnPickSite, { title: "Drag the map to any lot and click inside it", pressed: false, onToggle: function (on) {
      sitePickMode = on; if (on) { pickMode = false; pickC.update({ pressed: false }); }
      map.getContainer().classList.toggle("leaflet-crosshair", on);
      status(on ? "Drag the map to any lot and click inside it to make it the site." + (BUNDLED ? " This shared copy carries " + presets.length + " stored sites (the red pins)." : "") : "Site pick cancelled.", "info");
    } });
    pickC = R1UI.toggleButton(ui.btnPick, { pressed: false, disabled: true, onToggle: function (on) {
      if (!S.parcel) { pickC.update({ pressed: false }); return; }
      pickMode = on; if (on) { sitePickMode = false; pickSiteC.update({ pressed: false }); map.getContainer().classList.remove("leaflet-crosshair"); }
      status(on ? "Click on the map near the street-facing edge of the site." : "Pick cancelled.", "info");
    } });
    // every step folds from its heading; the folds are remembered in this browser
    var folded = {}; try { folded = JSON.parse(localStorage.getItem("r1.folded") || "{}") || {}; } catch (e) { folded = {}; }
    Array.prototype.forEach.call(document.querySelectorAll(".step, .report"), function (sec) {
      var key = sec.id || "report";
      R1UI.collapsible(sec, { open: !folded[key], onToggle: function (open) { folded[key] = !open; try { localStorage.setItem("r1.folded", JSON.stringify(folded)); } catch (e2) { /* storage may be unavailable */ } } });
    });
    ui.btnRightClose.addEventListener("click", function () { openRight(false); });
    ui.btnCmhcClear.addEventListener("click", onFormClear); ui.btnCmhcPlans.addEventListener("click", showFloorPlans); ui.btnFormPlans.addEventListener("click", showFloorPlans);
    ui.btnFormSection.addEventListener("click", function () { showView("section"); }); ui.btnCmhcSection.addEventListener("click", function () { showView("section"); });
    R1Units.TENURES.forEach(function (t) { var o = el("option", null, t.name); o.value = t.key; ui.tenureSel.appendChild(o); });
    R1Units.GROUND_USES.forEach(function (g) { var o = el("option", null, g.name); o.value = g.key; ui.groundSel.appendChild(o); });
    R1Units.ACCESS.forEach(function (a) { var o = el("option", null, a.name); o.value = a.key; o.title = a.note; ui.accessSel.appendChild(o); });
    ["unitsSel", "tenureSel", "groundSel", "accessSel"].forEach(function (id) { ui[id].addEventListener("change", function () { S.mix = null; if (S.scheme && S.form && S.form.scheme !== "cmhc") applyForm(S.scheme, true); }); });
    ui.btnMixAuto.addEventListener("click", function () { S.mix = null; if (S.scheme && S.form && S.form.scheme !== "cmhc") applyForm(S.scheme, true); });
    fillMixSelects(null);
    ui.parcelList.addEventListener("change", function () { if (S.res) onImport(); });
    ui.cutSide.addEventListener("change", function () { if (S.res) onFetch(); });
    ui.btnSaveSite.hidden = BUNDLED;   // the shared copy cannot save files (and has nothing new to save)
    ui.btnSaveSite.addEventListener("click", onSaveSite);
    ui.siteFile.addEventListener("change", onOpenSiteFile);
    ui.stepBadges = Array.prototype.slice.call(document.querySelectorAll(".step .badge, .rhead .badge"));
    M.CUT_SIDES_M.forEach(function (s) { var o = el("option", null, s + " x " + s + " m"); o.value = String(s); if (s === M.CUT_DEFAULT_SIDE_M) o.selected = true; ui.cutSide.appendChild(o); });
    M.COURTYARDS_M.forEach(function (c) { var o = el("option", null, c + " m"); o.value = String(c); ui.courtyardSel.appendChild(o); });
    M.REAR_DEPTHS_M.forEach(function (d) { var o = el("option", null, d + " m"); o.value = String(d); if (d === M.REAR_DEPTH_DEFAULT_M) o.selected = true; ui.rearDepthSel.appendChild(o); });
    ui.assumptions.textContent = "Assumed, not checked: " + core.RULES.assumptions.join(" ") + " The multiple-building rows are used only by the massing options in step 4; " + M.FORM_RULES.source.note;
    $("sourceLine").textContent = core.RULES.source.document + ", " + core.RULES.source.version + " (accessed " + core.RULES.source.accessed + "). City of Vancouver Open Data. By-law values in metres, drawn values in mm.";
    ui.btnFetch.addEventListener("click", onFetch);
    ui.address.addEventListener("keydown", function (e) { if (e.key === "Enter") onFetch(); });
    ui.edgeSelect.addEventListener("change", function () { S.click = null; if (S.parcel) onGenerate(); else setReady(); });
    ui.chkHide.addEventListener("change", onHideToggle);
    ui.courtyardSel.addEventListener("change", function () { if (S.scheme === "courtyard") applyForm("courtyard", true); });
    ui.rearDepthSel.addEventListener("change", function () { if (S.scheme === "courtyard") applyForm("courtyard", true); });
    ui.btnFormClear.addEventListener("click", onFormClear);
    ui.btnCopy.addEventListener("click", onCopy); ui.btnClear.addEventListener("click", onClear);
    ["chkRoads", "chkParcels", "chkBuildings"].forEach(function (id) { ui[id].addEventListener("change", function () { if (S.square) { drawContext(); if (S.placed) { drawEnvelope(); drawForm(); setExistingVisible(!ui.chkHide.checked); } markDirty(); } }); });
    window.addEventListener("resize", function () { if (!ui.panes.section.hidden) drawSection(); });
    // shortcuts: Alt+1..5 views, Alt+M massing options, Alt+S steps
    window.addEventListener("keydown", function (e) {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      var views = { "1": "map", "2": "siteplan", "3": "3d", "4": "section", "5": "plans" };
      if (views[e.key]) { if (!tabsC.isDisabled(views[e.key])) showView(views[e.key]); e.preventDefault(); }
      else if (e.key.toLowerCase() === "m") { if (!ui.btnRightToggle.disabled) openRight(ui.rightPanel.hidden); e.preventDefault(); }
      else if (e.key.toLowerCase() === "s") { leftC.toggle(); e.preventDefault(); }
    });
  }
  // the map, the 3D view and the section follow the stage's size after a bar opens or closes
  function relayout() { map.invalidateSize(); if (three) three.resize(); if (!ui.panes.section.hidden) drawSection(); }
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
    ui.rightPanel.hidden = !show; rightC.update({ pressed: show, disabled: !S.placed && !show });
    setTimeout(relayout, 30);
  }
  // step 4 has two sources of massing: the by-law form options and the CMHC catalogue
  var massingMode = "forms";
  function setMassingMode(mode) {
    massingMode = mode;
    modeC.update({ value: mode });
    ui.panelForms.hidden = mode !== "forms"; ui.panelCmhc.hidden = mode !== "cmhc";
    if (mode === "cmhc" && !S.cmhc && S.ev && S.ev.status === "ok" && S.placed) onCmhc(false);
  }

  return { start: start, state: function () { return S; }, map: function () { return map; }, three: function () { return three; }, zoomToSite: zoomToSite, showView: showView,
    applyForm: applyForm, onFetch: onFetch, onImport: onImport, onGenerate: onGenerate, exportSite: exportSite, bundled: BUNDLED };
})();
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", App.start); else App.start();
