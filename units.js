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
  // how the units are reached: an exterior stair and walkway (R1Access), or one shared internal stair in a core
  var CORE_W = 2.4, ACCESS = [
    { key: "exterior", name: "Exterior stair and open walkway", note: "Upper units are reached by an exterior single exit stair and an open walkway on the face they are entered from." },
    { key: "core", name: "Shared single exit stair (internal core)", note: "One internal stair in a " + CORE_W + " m core across the depth of the building, with a vestibule on the street and a corridor on every floor that the units open onto; " +
      "a single exit stair is permitted for a building of this size under the BC Building Code 2024 and the Vancouver Building By-law (sprinklered; to be confirmed with the code consultant). The core counts as floor area and is only offered where the layout has at most two units across." }
  ];
  function accessOf(key) { return ACCESS.filter(function (a) { return a.key === key; })[0] || ACCESS[0]; }
  // the straight stair of the core for one floor-to-floor height (BCBC 9.8: rise <= 0.2 m, run 0.26 m, plus a landing)
  function coreStairLen(fh) { return Math.round(((Math.ceil(fh / 0.2) - 1) * 0.26 + 1.0) * 100) / 100; }
  function coreFits(b, c) { return c.across <= 2 && (b.width_m - CORE_W) / c.across >= MIN_UNIT_WIDTH_M && b.depth_m >= 1.8 + coreStairLen(b.height_m / floorsOf(b)) + 1.0; }

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
  function candidates(b, reserveGround, access) {
    var w = access === "core" ? b.width_m - CORE_W : b.width_m, d = b.depth_m, nf = floorsOf(b), out = [];
    var acrossOpts = [1, 2, 3].filter(function (a) { return (a === 1 || w / a >= MIN_UNIT_WIDTH_M) && (access !== "core" || a <= 2); });
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
    var tenure = opts.tenure || "other", ground = groundUseOf(opts.ground || "residential"), access = opts.access || "exterior";
    var lim = maxUnits(ev, tenure).value, blds = effective(form, ev, opts).buildings, byTotal = {};
    var cands = blds.map(function (b, i) { return candidates(b, !!ground.cell && i === 0, access === "core" && b.key !== "rear" ? "core" : "exterior"); });
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
  // unit types by floor area: a 3-bed from 105 m2, a 2-bed from 65, a 1-bed from 38, a studio below that (and from 28 m2)
  var TYPE_MIN_M2 = { 3: 105, 2: 65, 1: 38, 0: 28 }, TYPE_NAMES = { 3: "3-bed", 2: "2-bed", 1: "1-bed", 0: "studio" };
  function bedsOf(type, area) {
    if (type === 3) return { beds: 3, baths: 2.5, den: area >= 140 };
    if (type === 2) return { beds: 2, baths: area >= 90 ? 2 : 1.5, den: false };
    if (type === 1) return { beds: 1, baths: 1, den: false };
    return { beds: 0, baths: 1, den: false };
  }
  function bedsFor(area) { return bedsOf(area >= 105 ? 3 : (area >= 65 ? 2 : (area >= 38 ? 1 : 0)), area); }
  /* capacityOf(u, b): the largest unit type whose bedrooms the room engine can actually draw in this unit's cells
     (3, 2, 1 or 0), with the area floor of the type: the geometric limit of the mix. */
  function capacityOf(u, b) {
    if (typeof R1Rooms === "undefined" || typeof R1Cmhc === "undefined") return u.area_est_m2 >= TYPE_MIN_M2[3] ? 3 : (u.area_est_m2 >= TYPE_MIN_M2[2] ? 2 : 1);
    var levels = [], nf = b.floors.length, fh = b.height_m / nf;
    b.floors.forEach(function (f, fi) { C.unitCells(f.units, f.split, f.cols, f.core).forEach(function (c) { if (c.key === u.key) levels.push({ w: (c.a1 - c.a0) * b.width_m, d: (c.b1 - c.b0) * b.depth_m, fi: fi }); }); });
    if (!levels.length) return 1;
    var roles = C.levelRoles(levels.length, { key: "bylaw" }, levels[0].fi > 0 && levels[0].d >= 8.4), ctx = R1Rooms.unitCtx(levels[0].w, levels[0].d, { fh: fh, levels: levels.length }), MINW = R1Rooms.MIN.living_w;
    // a type fits when its rooms hold that many beds (0.76 m clear on the open sides) and the living room is wide enough for a sofa
    for (var t = 3; t >= 1; t--) {
      if (u.area_est_m2 < TYPE_MIN_M2[t] * 0.9) continue;
      var probe = bedsOf(t, u.area_est_m2), beds = 0, livingOk = true;
      levels.forEach(function (lv, i) {
        var rooms = R1Rooms.layout(roles[i], probe, lv.w, lv.d, Object.assign({}, ctx, { level: i, beds: C.bedsOnLevel(probe, roles, i) }));
        rooms.forEach(function (r) {
          if (/bedroom/i.test(r.name) && !r.part && (typeof R1Fits === "undefined" || R1Fits.bedFor(r.w, r.h))) beds++;
          if (/^Living/.test(r.name) && !r.part) {   // the whole of an L-shaped living room
            var parts = rooms.filter(function (s) { return s.name === r.name; }), x0 = Math.min.apply(null, parts.map(function (s) { return s.x; })), y0 = Math.min.apply(null, parts.map(function (s) { return s.y; })), x1 = Math.max.apply(null, parts.map(function (s) { return s.x + s.w; })), y1 = Math.max.apply(null, parts.map(function (s) { return s.y + s.h; }));
            if (Math.min(x1 - x0, y1 - y0) < MINW - 0.01) livingOk = false;
          }
        });
      });
      if (beds >= t && livingOk) return t;
    }
    return levels.length === 1 ? 0 : 1;
  }
  /* mixLimits(dwellings): how many of each type the units can hold, largest units first: 3-beds where three bedrooms
     fit, 2-beds where two fit among what is left, studios among the single-level units then left; 1-beds are the rest. */
  function mixLimits(dwellings, n3, n2) {
    var sorted = dwellings.slice().sort(function (a, b) { return b.area_est_m2 - a.area_est_m2; });
    var max3 = sorted.filter(function (u) { return u.cap >= 3; }).length; n3 = Math.min(n3 || 0, max3);
    var max2 = sorted.slice(n3).filter(function (u) { return u.cap >= 2; }).length; n2 = Math.min(n2 || 0, max2);
    var max0 = sorted.slice(n3 + n2).filter(function (u) { return u.levels === 1 && u.area_est_m2 >= TYPE_MIN_M2[0]; }).length;
    return { max3: max3, max2: max2, max0: max0, sorted: sorted };
  }
  /* applyMix(dwellings, mix): 3-beds to the largest units that can hold them, 2-beds to the next, studios to the
     smallest single-level units, 1-beds to the rest; counts beyond the limits are cut back. Returns the counts. */
  function applyMix(dwellings, mix) {
    var lim = mixLimits(dwellings, mix.b3, mix.b2), n3 = Math.min(mix.b3 || 0, lim.max3), n2 = Math.min(mix.b2 || 0, lim.max2), n0 = Math.min(mix.b0 || 0, lim.max0);
    var threes = lim.sorted.filter(function (u) { return u.cap >= 3; }).slice(0, n3), twos = lim.sorted.filter(function (u) { return threes.indexOf(u) < 0 && u.cap >= 2; }).slice(0, n2);
    lim.sorted.forEach(function (u) { Object.assign(u, bedsOf(threes.indexOf(u) >= 0 ? 3 : (twos.indexOf(u) >= 0 ? 2 : Math.min(1, u.cap)), u.area_est_m2)); u.upgraded = false; });
    var rest = lim.sorted.filter(function (u) { return threes.indexOf(u) < 0 && twos.indexOf(u) < 0 && u.levels === 1; }).sort(function (a, b) { return a.area_est_m2 - b.area_est_m2; }).slice(0, n0);
    rest.forEach(function (u) { Object.assign(u, bedsOf(0, u.area_est_m2)); });
    var b0 = dwellings.filter(function (u) { return u.beds === 0; }).length;
    return { b3: threes.length, b2: twos.length, b0: b0, b1: dwellings.length - threes.length - twos.length - b0, custom: true };
  }
  function blockFor(b, c, startIndex, groundCell, access) {
    var nf = floorsOf(b), split = c.deep === 2 ? "grid" : (c.across > 1 ? "across" : "across"), cols = c.across, cells = c.cells;
    var floors = [], unitList = [], next = startIndex, keysGround = [], keysUpper = [];
    // the shared stair core: a band across the full depth, between the two columns or at side 1 of a single column
    var core = null;
    if (access === "core" && coreFits(b, c)) { var cw = CORE_W / b.width_m; core = c.across === 2 ? { a0: (1 - cw) / 2, a1: (1 + cw) / 2, width_m: CORE_W } : { a0: 0, a1: cw, width_m: CORE_W }; }
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
    if (core) floors.forEach(function (f) { f.core = core; });
    // areas per unit -> bedrooms (the core's share of the footprint belongs to no unit)
    var areas = {}, usable = core ? b.footprint_m2 * (1 - core.width_m / b.width_m) : b.footprint_m2;
    floors.forEach(function (f) { f.units.forEach(function (k) { areas[k] = (areas[k] || 0) + usable / f.units.length; }); });
    if (groundCell) unitList.push({ key: groundCell.key, name: groundCell.name, kind: groundCell.kind, beds: 0, baths: 0 });
    Object.keys(areas).forEach(function (k) {
      if (groundCell && k === groundCell.key) return;
      var bd = bedsFor(areas[k]); unitList.push({ key: k, beds: bd.beds, baths: bd.baths, den: !!bd.den, area_est_m2: areas[k], levels: floors.filter(function (f) { return f.units.indexOf(k) >= 0; }).length });
    });
    unitList.sort(function (x, y) { return (x.kind ? -1 : 0) - (y.kind ? -1 : 0) || parseInt(x.key.slice(1), 10) - parseInt(y.key.slice(1), 10); });
    return { block: { key: b.key, name: b.name, design: { key: "bylaw", name: "By-law form: " + LAYOUTS[c.layout], slug: null, layout: layoutText(c, b) }, part: null,
      width_m: b.width_m, depth_m: b.depth_m, trimmed_from_m: b.trimmed_from_m || null, storeys: nf, height_m: b.height_m, height_mid_m: b.height_m, footprint_m2: b.footprint_m2, gfa_m2: b.footprint_m2 * nf,
      units: unitList.filter(function (u) { return !u.kind; }).length, unit_list: unitList, floors: floors, layout: c.layout, rotated: false, n: null, core: core }, next: next };
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
    var tenure = opts.tenure || "other", ground = groundUseOf(opts.ground || "residential"), lim = maxUnits(ev, tenure), access = accessOf(opts.access || "exterior");
    var out = { key: null, name: null, kind: "bylaw", source: "bylaw", dims_like: form.dims_like || form.scheme, blocks: [], gaps: form.gaps || [], checks: [], notes: [], tenure: tenure, ground_use: ground.key, access: access.key, units: 0, ok: false, reason: null };
    if (!form || form.status !== "ok" || !form.buildings || !form.buildings.length) { out.reason = "No form to configure."; return out; }
    var eff = effective(form, ev, opts), all = achievable(form, ev, opts);
    if (!all.length) { out.reason = "No unit layout fits these buildings (units need at least " + MIN_UNIT_WIDTH_M + " m of width" + (access.key === "core" ? " beside the " + CORE_W + " m core" : "") + ")."; return out; }
    var want = opts.units || all[all.length - 1].total, pick = all.filter(function (a) { return a.total === want; })[0];
    if (!pick) { pick = all.reduce(function (best, a) { return a.total <= want && (!best || a.total > best.total) ? a : best; }, null) || all[0]; out.notes.push(want + " units cannot be laid out in these buildings; " + pick.total + " shown."); }
    var next = 1;
    eff.buildings.forEach(function (b, i) {
      var r = blockFor(b, pick.picks[i], next, i === 0 ? ground.cell : null, access.key === "core" && b.key !== "rear" ? "core" : "exterior"); next = r.next; out.blocks.push(r.block);
      if (access.key === "core" && !r.block.core) out.notes.push(b.name + ": no internal core (" + (b.key === "rear" ? "a rear building is reached from the courtyard" : "the layout needs more than two units across, or the building is too shallow for the stair") + "); its upper units use an exterior stair and walkway.");
    });
    if (access.key === "core") out.notes.push(access.note);
    eff.notes.forEach(function (n) { out.notes.push(n); });
    out.units = out.blocks.reduce(function (s, b) { return s + b.units; }, 0);
    // the unit mix: by area (a 3-bed from 105 m2, a 2-bed from 65, a 1-bed from 38, a studio below), each unit held
    // to the bedrooms its rooms can hold, or as the user set it
    var need = familyMin(out.units, tenure), dwellings = [];
    out.blocks.forEach(function (b) { b.unit_list.forEach(function (u) { if (u.kind) return; u.cap = capacityOf(u, b); if (u.beds > u.cap) Object.assign(u, bedsOf(u.cap, u.area_est_m2)); dwellings.push(u); }); });
    if (opts.mix) out.mix = applyMix(dwellings, opts.mix);
    var fam = dwellings.filter(function (u) { return u.beds >= 2; }).length;
    // 2.2.8: minimum number of 2+ bedroom units; in the automatic mix the largest one-bedrooms are upgraded when it falls short
    if (!opts.mix && fam < need) {
      dwellings.filter(function (u) { return u.beds < 2 && u.cap >= 2; }).sort(function (a, b) { return b.area_est_m2 - a.area_est_m2; }).slice(0, need - fam)
        .forEach(function (u) { u.beds = 2; u.baths = 1; u.upgraded = true; fam++; });
    }
    if (!opts.mix) out.mix = { b3: dwellings.filter(function (u) { return u.beds === 3; }).length, b2: dwellings.filter(function (u) { return u.beds === 2; }).length, b1: dwellings.filter(function (u) { return u.beds === 1; }).length, b0: dwellings.filter(function (u) { return u.beds === 0; }).length, custom: false };
    var ml = mixLimits(dwellings, out.mix.b3, out.mix.b2);
    out.mix.limits = { max3: ml.max3, max2: ml.max2, max0: ml.max0, min_m2: TYPE_MIN_M2 };
    out.checks.push(check("units", out.units <= lim.value, out.units + " dwelling units; maximum " + lim.value + " for " + tenureOf(tenure).name.toLowerCase(), lim.clause));
    out.checks.push(check("family units", fam >= need, fam + " units with 2 or more bedrooms; minimum " + need + " for " + out.units + " units, " + (tenure === "rental" ? "rental" : "other tenure"), RULES.family_min.clause));
    var gfa = out.blocks.reduce(function (s, b) { return s + b.gfa_m2; }, 0), fsr = gfa / ev.area;
    out.checks.push(check("floor area", fsr <= RULES.fsr_max.value + 1e-3, "every storey full: " + Math.round(gfa) + " m2 on " + Math.round(ev.area) + " m2 = FSR " + fmt(fsr, 2) + " (cap " + RULES.fsr_max.value + "; the by-law's exclusions such as " + RULES.stair_exclusion.value + " m2 per stacked unit [" + RULES.stair_exclusion.clause.split(" ")[0] + "] are not modelled)", RULES.fsr_max.clause));
    out.ok = out.checks.every(function (c) { return c.ok; });
    out.reason = out.ok ? "fits" : out.checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.name + ": " + c.detail + " [" + c.clause + "]"; }).join("; ");
    var layoutNames = out.blocks.map(function (b) { return LAYOUTS[b.layout]; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(" + ");
    out.name = out.units + " units, " + layoutNames.toLowerCase() + (ground.cell ? ", " + ground.cell.name.toLowerCase() + " at ground" : "");
    out.key = "bylaw_" + out.units + "_" + tenure + "_" + ground.key + "_" + access.key + "_" + out.blocks.map(function (b) { return b.layout; }).join("-");
    if (ground.cell) out.notes.push(ground.note);
    out.notes.push("Tenure: " + tenureOf(tenure).name + " [" + lim.clause + "]. " + (out.mix.custom ? "Unit mix set by hand (" + [3, 2, 1, 0].map(function (t) { return out.mix["b" + t] + " x " + TYPE_NAMES[t]; }).join(", ") + "); the limits are what the rooms of each unit can hold (three bedrooms, two, one) with the area floors of a 3-bed at " + TYPE_MIN_M2[3] + " m2 and a 2-bed at " + TYPE_MIN_M2[2] + "; studios are single-level units." : "Bedrooms follow each unit's area (3-bed from " + TYPE_MIN_M2[3] + " m2, 2-bed from " + TYPE_MIN_M2[2] + ", 1-bed from " + TYPE_MIN_M2[1] + ", studio below), held to what its rooms can hold.") + " " + RULES.source.note);
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

  return { RULES: RULES, TENURES: TENURES, GROUND_USES: GROUND_USES, ACCESS: ACCESS, CORE_W: CORE_W, LAYOUTS: LAYOUTS, TYPE_MIN_M2: TYPE_MIN_M2, TYPE_NAMES: TYPE_NAMES, maxUnits: maxUnits, familyMin: familyMin, candidates: candidates, effective: effective, achievable: achievable, configure: configure, mixLimits: mixLimits, coreStairLen: coreStairLen, optionLines: optionLines, tenureOf: tenureOf, groundUseOf: groundUseOf, accessOf: accessOf };
})();
