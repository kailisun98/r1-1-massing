/* units.js -- unit configurations for the by-law forms (single building, courtyard, side by side), in the spirit
   of the catalogue designs: stacked flats, flats under two-level units, townhouses, two by two. The unit count
   runs to 6, or 8 when the building is 100% residential rental (3.1.1.3), with the 2.2.8 minimum of family units;
   the ground floor can give one cell to a shared amenity room, a neighbourhood grocery store (2.2.5) or a child
   day care (4.1.2(m)). The result has the same shape as a catalogue option, so the map, 3D, the unit diagrams and
   the floor plans draw it with the same code. */
var R1Units = (function () {
  "use strict";
  var core = R1Core, C = R1Cmhc;
  function fmt(x, d) { return Number(x).toFixed(d); }

  var RULES = {
    max_units_rental: { value: 8, clause: "3.1.1.3(a) (100% residential rental tenure)" },
    max_units_other: { value: 6, clause: "3.1.1.3(b)(i) (any other tenure)" },
    family_min: { clause: "2.2.8", rental: { 3: 1, 4: 1, 5: 2, 6: 2, 7: 2, 8: 3 }, other: { 3: 2, 4: 2, 5: 3, 6: 3 } },
    stair_exclusion: { value: 7.5, clause: "4.1.2(l) (7.5 m2 per unit for the internal stair to a unit above another)" },
    fsr_max: { value: 1.0, clause: "3.1.1.2" },
    source: { note: "Unit counts, tenure and family-unit minimums from the R1-1 District Schedule (June 2026), 2.2.8 and 3.1.1.3; non-dwelling ground floors from 2.1, 2.2.5 and 4.1.2(m). The configurations themselves are this tool's, in the spirit of the CMHC catalogue designs." }
  };
  var TENURES = [
    { key: "other", name: "Strata or mixed tenure: up to 6 units", clause: RULES.max_units_other.clause },
    { key: "rental", name: "100% residential rental: up to 8 units", clause: RULES.max_units_rental.clause }
  ];
  var GROUND_USES = [
    { key: "residential", name: "Residential", cell: null, note: "" },
    { key: "collective", name: "Collective space: shared amenity room", cell: { key: "C", name: "Common room", kind: "common" },
      note: "A shared room for the residents is part of the dwelling use and counts as floor area under the 1.00 FSR [3.1.1.2]. A community centre or neighbourhood house as a use of its own is a conditional approval use [2.1]." },
    { key: "grocery", name: "Neighbourhood grocery store", cell: { key: "G", name: "Grocery store", kind: "shop" },
      note: "A mixed-use residential building is a conditional approval use, and the only non-dwelling use it may contain is a neighbourhood grocery store [2.2.5]; Director of Planning approval." },
    { key: "daycare", name: "Child day care facility", cell: { key: "D", name: "Child day care", kind: "daycare" },
      note: "A child day care facility is a conditional approval use [2.1]; up to 10% of the permitted floor area is excluded from floor area if the Director of Planning is satisfied there is a need in the neighbourhood [4.1.2(m)]." }
  ];
  var MIN_UNIT_WIDTH_M = 4.5, MIN_UNIT_DEPTH_M = 6.5, TARGET_UNIT_WIDTH_M = 5.8, MIN_TWO_DEEP_M = 13.5;
  var LAYOUTS = { stacked: "Stacked flats", flats_over: "Flats under two-level units", townhouse: "Townhouses", grid: "Two by two" };

  function tenureOf(key) { return TENURES.filter(function (t) { return t.key === key; })[0] || TENURES[0]; }
  function groundUseOf(key) { return GROUND_USES.filter(function (g) { return g.key === key; })[0] || GROUND_USES[0]; }
  function maxUnits(ev, tenure) {
    var band = ev.band.max_units, bandClause = ev.band.clause.split(" ")[0];
    if (tenure === "rental") return band >= 6 ? { value: RULES.max_units_rental.value, clause: RULES.max_units_rental.clause + ", site in the 6-unit band [" + bandClause + "]" }
      : { value: band, clause: bandClause + " (the site's band; 8 rental units need the 6-unit band)" };
    return { value: Math.min(band, RULES.max_units_other.value), clause: RULES.max_units_other.clause + ", site band [" + bandClause + "]" };
  }
  function familyMin(n, tenure) { var t = RULES.family_min[tenure === "rental" ? "rental" : "other"]; return t[n] === undefined ? 0 : t[n]; }

  // ------------------------------------------------------------------ candidate layouts of one building
  // A building is w x d with nf floors. Cells are laid out `across` units wide and `deep` units deep.
  function floorsOf(b) { return Math.max(1, Math.round(b.storeys)); }
  function candidates(b, reserveGround) {
    var w = b.width_m, d = b.depth_m, nf = floorsOf(b), out = [];
    var acrossOpts = [1, 2, 3].filter(function (a) { return a === 1 || w / a >= MIN_UNIT_WIDTH_M; });
    var deepOpts = d >= MIN_TWO_DEEP_M ? [1, 2] : [1];
    acrossOpts.forEach(function (a) {
      deepOpts.forEach(function (dp) {
        var cells = a * dp;
        if (cells === 1 && (dp === 2)) return;
        if (!reserveGround) out.push({ layout: "townhouse", across: a, deep: dp, cells: cells, total: cells, levels: nf });
        if (nf >= 3) out.push({ layout: "flats_over", across: a, deep: dp, cells: cells, total: 2 * cells - (reserveGround ? 1 : 0), levels: nf });
        if (nf >= 2 || reserveGround) out.push({ layout: "stacked", across: a, deep: dp, cells: cells, total: nf * cells - (reserveGround ? 1 : 0), levels: nf });
        if (nf === 1 && !reserveGround) out.push({ layout: "stacked", across: a, deep: dp, cells: cells, total: cells, levels: 1 });
        // "mixed": one unit fewer on the ground floor (a wider ground unit), for the counts in between
        if (dp === 1 && a >= 2) {
          var g = a - 1 - (reserveGround ? 1 : 0);
          if (nf >= 2 && g >= 0) out.push({ layout: "stacked", mixed: true, across: a, deep: 1, cells: a, total: g + (nf - 1) * a, levels: nf });
          if (nf >= 3 && g >= 0) out.push({ layout: "flats_over", mixed: true, across: a, deep: 1, cells: a, total: g + a, levels: nf });
        }
      });
    });
    // one entry per (layout, across, deep); drop empties
    var seen = {};
    return out.filter(function (c) { var k = c.layout + a2(c); if (seen[k] || c.total < 1) return false; seen[k] = true; return true; });
  }
  function a2(c) { return "|" + c.across + "x" + c.deep + (c.mixed ? "m" : ""); }
  function cellArea(b, c) { return b.footprint_m2 / c.cells; }
  // the smallest dwelling in the candidate (drives the choice: bigger units first)
  function minUnitArea(b, c) {
    var cell = cellArea(b, c), nf = floorsOf(b);
    if (c.layout === "townhouse") return cell * nf;
    if (c.layout === "flats_over") return cell;                 // the ground flats
    return cell;                                                 // stacked flats
  }

  /* effective(form, ev, opts): the buildings as configured, with the depth of the front-row buildings trimmed
     (from the rear, same ratio) so that every storey full stays within FSR 1.00 on this site; rear buildings
     keep their depth. opts.fsrFit === false leaves the by-law envelope untouched. */
  function effective(form, ev, opts) {
    var allowed = RULES.fsr_max.value * ev.area, blds = form.buildings.map(function (b) { return b; }), notes = [];
    if (!opts || opts.fsrFit !== false) {
      var fixed = 0, trimmable = 0;
      blds.forEach(function (b) { var g = b.footprint_m2 * floorsOf(b); if (b.key === "rear") fixed += g; else trimmable += g; });
      if (fixed + trimmable > allowed + 1e-6 && trimmable > 0) {
        var r = Math.max(0, allowed - fixed) / trimmable;
        blds = blds.map(function (b) {
          if (b.key === "rear") return b;
          var d = Math.max(MIN_UNIT_DEPTH_M, Math.floor(b.depth_m * r * 100) / 100);
          if (d >= b.depth_m - 0.005) return b;
          notes.push(b.name + " depth trimmed from " + fmt(b.depth_m, 2) + " to " + fmt(d, 2) + " m so that every storey full stays within FSR " + RULES.fsr_max.value + " on this " + Math.round(ev.area) + " m2 site [" + RULES.fsr_max.clause + "].");
          return Object.assign({}, b, { depth_m: d, footprint_m2: b.footprint_m2 * d / b.depth_m, trimmed_from_m: b.depth_m });
        });
      }
    }
    return { buildings: blds, notes: notes };
  }
  /* achievable(form, ev, opts): every total unit count the form can hold with these layouts, each with the best
     combination of layouts (the one whose smallest unit is largest), under the tenure's maximum. */
  function achievable(form, ev, opts) {
    opts = opts || {};
    var tenure = opts.tenure || "other", ground = groundUseOf(opts.ground || "residential");
    var lim = maxUnits(ev, tenure).value, blds = effective(form, ev, opts).buildings, byTotal = {};
    var cands = blds.map(function (b, i) { return candidates(b, !!ground.cell && i === 0); });
    function walk(i, picks, total) {
      if (i === blds.length) {
        if (total < 1 || total > lim) return;
        var score = Math.min.apply(null, picks.map(function (p, j) { return minUnitArea(blds[j], p); }));
        if (!byTotal[total] || score > byTotal[total].score) byTotal[total] = { total: total, picks: picks.slice(), score: score };
        return;
      }
      cands[i].forEach(function (c) { picks.push(c); walk(i + 1, picks, total + c.total); picks.pop(); });
    }
    walk(0, [], 0);
    return Object.keys(byTotal).map(function (k) { return byTotal[k]; }).sort(function (a, b) { return a.total - b.total; });
  }

  // ------------------------------------------------------------------ build the option
  function bedsFor(area) {
    if (area >= 105) return { beds: 3, baths: 2.5, den: area >= 140 };
    if (area >= 65) return { beds: 2, baths: area >= 90 ? 2 : 1.5 };
    return { beds: 1, baths: 1 };
  }
  function blockFor(b, c, startIndex, groundCell) {
    var nf = floorsOf(b), split = c.deep === 2 ? "grid" : (c.across > 1 ? "across" : "across"), cols = c.across, cells = c.cells;
    var floors = [], unitList = [], next = startIndex, keysGround = [], keysUpper = [];
    function newKey() { return "U" + (next++); }
    var groundCells = c.mixed ? cells - 1 : cells, gCount = groundCells - (groundCell ? 1 : 0);
    if (c.layout === "townhouse") {
      for (var i = 0; i < cells; i++) keysGround.push(newKey());
      for (var f = 0; f < nf; f++) floors.push({ name: floorName(f), units: keysGround.slice(), split: split, cols: cols });
    } else if (c.layout === "flats_over") {
      var g = groundCell ? [groundCell.key] : [];
      for (var i2 = 0; i2 < gCount; i2++) g.push(newKey());
      for (var i3 = 0; i3 < cells; i3++) keysUpper.push(newKey());
      floors.push({ name: floorName(0), units: g, split: c.mixed ? "across" : split, cols: cols });
      for (var f2 = 1; f2 < nf; f2++) floors.push({ name: floorName(f2), units: keysUpper.slice(), split: split, cols: cols });
      keysGround = g.filter(function (k) { return !groundCell || k !== groundCell.key; });
    } else {   // stacked
      for (var f3 = 0; f3 < nf; f3++) {
        var ks = f3 === 0 && groundCell ? [groundCell.key] : [];
        for (var i4 = 0; i4 < (f3 === 0 ? gCount : cells); i4++) ks.push(newKey());
        floors.push({ name: floorName(f3), units: ks, split: f3 === 0 && c.mixed ? "across" : split, cols: cols });
      }
    }
    // areas per unit -> bedrooms
    var areas = {};
    floors.forEach(function (f) { f.units.forEach(function (k) { areas[k] = (areas[k] || 0) + b.footprint_m2 / f.units.length; }); });
    if (groundCell) unitList.push({ key: groundCell.key, name: groundCell.name, kind: groundCell.kind, beds: 0, baths: 0 });
    Object.keys(areas).forEach(function (k) {
      if (groundCell && k === groundCell.key) return;
      var bd = bedsFor(areas[k]); unitList.push({ key: k, beds: bd.beds, baths: bd.baths, den: !!bd.den, area_est_m2: areas[k] });
    });
    unitList.sort(function (x, y) { return (x.kind ? -1 : 0) - (y.kind ? -1 : 0) || parseInt(x.key.slice(1), 10) - parseInt(y.key.slice(1), 10); });
    return { block: { key: b.key, name: b.name, design: { key: "bylaw", name: "By-law form: " + LAYOUTS[c.layout], slug: null, layout: layoutText(c, b) }, part: null,
      width_m: b.width_m, depth_m: b.depth_m, trimmed_from_m: b.trimmed_from_m || null, storeys: nf, height_m: b.height_m, height_mid_m: b.height_m, footprint_m2: b.footprint_m2, gfa_m2: b.footprint_m2 * nf,
      units: unitList.filter(function (u) { return !u.kind; }).length, unit_list: unitList, floors: floors, layout: c.layout, rotated: false, n: null }, next: next };
  }
  function floorName(f) { return ["Ground", "Second", "Third", "Fourth"][f] || ("Level " + (f + 1)); }
  function layoutText(c, b) {
    var cellW = b.width_m / c.across, cellD = b.depth_m / c.deep, nf = floorsOf(b), cell = fmt(cellW, 1) + " x " + fmt(cellD, 1) + " m";
    if (c.layout === "townhouse") return c.cells + " townhouse" + (c.cells > 1 ? "s" : "") + " of " + cell + " over " + nf + " levels.";
    var gN = c.mixed ? c.cells - 1 : c.cells, gCell = c.mixed ? fmt(b.width_m / Math.max(1, gN), 1) + " x " + fmt(cellD, 1) + " m" : cell;
    if (c.layout === "flats_over") return gN + " ground-floor flat" + (gN > 1 ? "s" : "") + " of " + gCell + " under " + c.cells + " unit" + (c.cells > 1 ? "s" : "") + " of " + cell + " on the " + (nf - 1) + " floors above.";
    return (c.mixed ? gN + " wider flat" + (gN > 1 ? "s" : "") + " of " + gCell + " on the ground floor and " : "") + c.cells + " flat" + (c.cells > 1 ? "s" : "") + " of " + cell + " per " + (c.mixed ? "upper " : "") + "floor" + (c.mixed ? "" : " on " + nf + " floor" + (nf > 1 ? "s" : "")) + ".";
  }

  /* configure(form, ev, opts): the option for `opts.units` dwellings (default: the most the tenure allows here)
     with `opts.tenure` ("other" | "rental") and `opts.ground` (a GROUND_USES key). */
  function configure(form, ev, opts) {
    opts = opts || {};
    var tenure = opts.tenure || "other", ground = groundUseOf(opts.ground || "residential"), lim = maxUnits(ev, tenure);
    var out = { key: null, name: null, kind: "bylaw", source: "bylaw", dims_like: form.dims_like || form.scheme, blocks: [], gaps: form.gaps || [], checks: [], notes: [], tenure: tenure, ground_use: ground.key, units: 0, ok: false, reason: null };
    if (!form || form.status !== "ok" || !form.buildings || !form.buildings.length) { out.reason = "No form to configure."; return out; }
    var eff = effective(form, ev, opts), all = achievable(form, ev, opts);
    if (!all.length) { out.reason = "No unit layout fits these buildings (units need at least " + MIN_UNIT_WIDTH_M + " m of width)."; return out; }
    var want = opts.units || all[all.length - 1].total, pick = all.filter(function (a) { return a.total === want; })[0];
    if (!pick) { pick = all.reduce(function (best, a) { return a.total <= want && (!best || a.total > best.total) ? a : best; }, null) || all[0]; out.notes.push(want + " units cannot be laid out in these buildings; " + pick.total + " shown."); }
    var next = 1;
    eff.buildings.forEach(function (b, i) {
      var r = blockFor(b, pick.picks[i], next, i === 0 ? ground.cell : null); next = r.next; out.blocks.push(r.block);
    });
    eff.notes.forEach(function (n) { out.notes.push(n); });
    out.units = out.blocks.reduce(function (s, b) { return s + b.units; }, 0);
    // 2.2.8: minimum number of 2+ bedroom units; upgrade the largest one-bedrooms if the mix falls short
    var need = familyMin(out.units, tenure), dwellings = [];
    out.blocks.forEach(function (b) { b.unit_list.forEach(function (u) { if (!u.kind) dwellings.push(u); }); });
    var fam = dwellings.filter(function (u) { return u.beds >= 2; }).length;
    if (fam < need) {
      dwellings.filter(function (u) { return u.beds < 2 && u.area_est_m2 >= 50; }).sort(function (a, b) { return b.area_est_m2 - a.area_est_m2; }).slice(0, need - fam)
        .forEach(function (u) { u.beds = 2; u.baths = 1; u.upgraded = true; fam++; });
    }
    out.checks.push(check("units", out.units <= lim.value, out.units + " dwelling units; maximum " + lim.value + " for " + tenureOf(tenure).name.toLowerCase(), lim.clause));
    out.checks.push(check("family units", fam >= need, fam + " units with 2 or more bedrooms; minimum " + need + " for " + out.units + " units, " + (tenure === "rental" ? "rental" : "other tenure"), RULES.family_min.clause));
    var gfa = out.blocks.reduce(function (s, b) { return s + b.gfa_m2; }, 0), fsr = gfa / ev.area;
    out.checks.push(check("floor area", fsr <= RULES.fsr_max.value + 1e-3, "every storey full: " + Math.round(gfa) + " m2 on " + Math.round(ev.area) + " m2 = FSR " + fmt(fsr, 2) + " (cap " + RULES.fsr_max.value + "; the by-law's exclusions such as " + RULES.stair_exclusion.value + " m2 per stacked unit [" + RULES.stair_exclusion.clause.split(" ")[0] + "] are not modelled)", RULES.fsr_max.clause));
    out.ok = out.checks.every(function (c) { return c.ok; });
    out.reason = out.ok ? "fits" : out.checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.name + ": " + c.detail + " [" + c.clause + "]"; }).join("; ");
    var layoutNames = out.blocks.map(function (b) { return LAYOUTS[b.layout]; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(" + ");
    out.name = out.units + " units, " + layoutNames.toLowerCase() + (ground.cell ? ", " + ground.cell.name.toLowerCase() + " at ground" : "");
    out.key = "bylaw_" + out.units + "_" + tenure + "_" + ground.key + "_" + out.blocks.map(function (b) { return b.layout; }).join("-");
    if (ground.cell) out.notes.push(ground.note);
    out.notes.push("Tenure: " + tenureOf(tenure).name + " [" + lim.clause + "]. Bedrooms follow each unit's area (3-bed from 105 m2, 2-bed from 65 m2); " + RULES.source.note);
    out.achievable = all.map(function (a) { return a.total; });
    return out;
  }
  function check(name, ok, detail, clause) { return { name: name, ok: !!ok, detail: detail, clause: clause || "" }; }
  function optionLines(o) {
    var L = ["UNIT CONFIGURATION (by-law form): " + o.name];
    o.blocks.forEach(function (b) { L.push("  " + b.name + ": " + b.design.layout + " Units: " + b.unit_list.map(function (u) { return u.key + (u.kind ? " " + u.name : " " + u.beds + "-bed"); }).join(", ")); });
    o.checks.forEach(function (c) { L.push("  " + (c.ok ? "OK  " : "FAIL") + " " + c.name + ": " + c.detail + " [" + c.clause + "]"); });
    o.notes.forEach(function (n) { L.push("  " + n); });
    return L;
  }

  return { RULES: RULES, TENURES: TENURES, GROUND_USES: GROUND_USES, LAYOUTS: LAYOUTS, maxUnits: maxUnits, familyMin: familyMin, candidates: candidates, effective: effective, achievable: achievable, configure: configure, optionLines: optionLines, tenureOf: tenureOf, groundUseOf: groundUseOf };
})();
