/* access.js -- how each unit of a massing option is reached.
   Ground-floor units are entered at grade: from the street on the front face, or from the side-yard path when a
   cell sits behind another (a rear cell of a two-deep layout). A unit whose entry level is an upper floor is reached
   by an exterior single exit stair and a 1.2 m open walkway on one face of the building: the rear (lane or
   courtyard) face of a building on the street, the courtyard face of a rear building, or the front face for an
   upper unit that touches only the front. One stair per face serves every floor that has a walkway on it. A rear
   walkway's stair stands at the side-1 end and a front walkway's stair at the side-2 end, so the stairs of a front
   and a rear building never meet across the courtyard. The stair is a switchback: two 1.2 m flights side by side
   along the face (0.27 m goings, risers under 0.18 m), a floor landing at the walkway end and a mid landing at the
   far end. Metres, in each block's own frame: x across from side 1 (0..width), y from the front face (0..depth);
   walkways and stairs stand outside the footprint (y < 0 in front, y > depth behind). */
var R1Access = (function () {
  "use strict";
  var WALK_W = 1.2, FLIGHT_W = 1.2, LANDING = 1.2, RISE_MAX = 0.18, GOING = 0.27, GUARD_H = 1.07, EPS = 0.02;
  var PROJ = WALK_W + 2 * FLIGHT_W;   // 3.6 m: how far a walkway with its stair stands off the face
  var NOTE = "Upper units are reached by an exterior single exit stair (two 1.2 m flights, 0.27 m goings, risers under 0.18 m, a floor landing and a mid landing) and a 1.2 m open walkway on the face they are entered from; " +
    "a single exit stair is permitted for buildings of this size under the BC Building Code 2024 and the Vancouver Building By-law, to be confirmed with the code consultant. " +
    "Ground units are entered at grade from the street, or from the side-yard path when they sit behind another unit. The by-law's yard-projection rules for open stairs are not checked.";
  function r2(v) { return Math.round(v * 100) / 100; }
  // length of the switchback along the face for one floor-to-floor height
  function stairLength(fh) { var risers = Math.ceil(fh / RISE_MAX), goings = Math.ceil(risers / 2) - 1; return r2(goings * GOING + 2 * LANDING); }
  function entryFace(c, fi, isRear) {
    var front = c.b0 < EPS, rear = c.b1 > 1 - EPS, left = c.a0 < EPS, right = c.a1 > 1 - EPS;
    if (fi === 0) return front ? "front" : (left ? "left" : (right ? "right" : "rear"));
    if (isRear) return front ? "front" : null;          // a rear building is reached from the courtyard, never across its 0.9 m rear yard
    return rear ? "rear" : (front ? "front" : null);
  }

  /* plan(option): { blocks: {key: {walkways, stairs, ...}}, entries: {"U3@single": {face, floor_index, walkway}}, notes } */
  function plan(o) {
    var out = { blocks: {}, entries: {}, notes: [] }, any = false;
    o.blocks.forEach(function (b) {
      var W = b.width_m, D = b.depth_m, nf = b.floors.length, fh = b.height_m / nf, isRear = b.key === "rear", L = Math.min(stairLength(fh), W);
      var levelsOf = {};
      b.floors.forEach(function (f, fi) { f.units.forEach(function (k) { (levelsOf[k] || (levelsOf[k] = [])).push(fi); }); });
      var core = b.core || (b.floors[0] && b.floors[0].core) || null;
      var B = { key: b.key, name: b.name, width_m: W, depth_m: D, floor_h: r2(fh), floors: nf, walkways: [], stairs: [], core: core ? { a0: core.a0, a1: core.a1, x0: r2(core.a0 * W), x1: r2(core.a1 * W), width_m: r2((core.a1 - core.a0) * W) } : null }, groups = {};
      if (core) {   // the shared stair core: every unit not on the street opens onto its corridor; the core itself is entered from the street
        out.entries[R1Cmhc.CORE_KEY + "@" + b.key] = { unit: R1Cmhc.CORE_KEY, block: b.key, floor_index: 0, face: "front", cell: R1Cmhc.coreCell(b.floors[0]), walkway: false, core: true };
        b.floors.forEach(function (f, fi) {
          R1Cmhc.unitCells(f.units, f.split, f.cols, f.core).forEach(function (c) {
            if (levelsOf[c.key][0] !== fi) return;
            var street = fi === 0 && c.b0 < EPS, face = street ? "front" : (c.a1 <= core.a0 + EPS ? "right" : (c.a0 >= core.a1 - EPS ? "left" : null));
            out.entries[c.key + "@" + b.key] = { unit: c.key, block: b.key, floor_index: fi, face: face, cell: c, walkway: false, core: !street && !!face };
            if (!face) out.notes.push(c.key + " in the " + b.name.toLowerCase() + " does not touch the stair core.");
          });
        });
        out.blocks[b.key] = B; any = true;
        return;
      }
      b.floors.forEach(function (f, fi) {
        R1Cmhc.unitCells(f.units, f.split, f.cols, f.core).forEach(function (c) {
          if (levelsOf[c.key][0] !== fi) return;   // not the level this unit is entered on
          var face = entryFace(c, fi, isRear);
          out.entries[c.key + "@" + b.key] = { unit: c.key, block: b.key, floor_index: fi, face: face, cell: c, walkway: fi > 0 && (face === "front" || face === "rear") };
          if (fi > 0 && !face) out.notes.push(c.key + " in the " + b.name.toLowerCase() + " is entered on the " + f.name.toLowerCase() + " floor but touches no face a walkway can run along.");
          if (fi > 0 && face) {
            var g = groups[face + "|" + fi] || (groups[face + "|" + fi] = { face: face, floor_index: fi, a0: 1, a1: 0, units: [] });
            g.a0 = Math.min(g.a0, c.a0); g.a1 = Math.max(g.a1, c.a1); g.units.push(c.key);
          }
        });
      });
      var stairs = {};
      Object.keys(groups).sort().forEach(function (key) {
        var g = groups[key], atS1 = g.face === "rear", y0 = g.face === "rear" ? D : -WALK_W;
        var x0 = atS1 ? 0 : Math.min(g.a0 * W, W - LANDING), x1 = atS1 ? Math.max(g.a1 * W, LANDING) : W;
        B.walkways.push({ face: g.face, floor_index: g.floor_index, z: r2(g.floor_index * fh), x0: r2(x0), x1: r2(x1), y0: r2(y0), y1: r2(y0 + WALK_W), units: g.units });
        var st = stairs[g.face];
        if (!st) {
          var sx0 = atS1 ? 0 : W - L, sx1 = atS1 ? L : W, sy0 = g.face === "rear" ? D + WALK_W : -WALK_W - 2 * FLIGHT_W;
          st = stairs[g.face] = { face: g.face, at_side: atS1 ? 1 : 2, floors: [], x0: r2(sx0), x1: r2(sx1), y0: r2(sy0), y1: r2(sy0 + 2 * FLIGHT_W), len: L,
            inner: g.face === "rear" ? [r2(D + WALK_W), r2(D + 2 * WALK_W)] : [r2(-2 * WALK_W), r2(-WALK_W)],      // the flight beside the walkway
            outer: g.face === "rear" ? [r2(D + 2 * WALK_W), r2(D + 3 * WALK_W)] : [r2(-3 * WALK_W), r2(-2 * WALK_W)],  // the flight away from it
            land0: atS1 ? [0, LANDING] : [r2(W - LANDING), W], land1: atS1 ? [r2(L - LANDING), L] : [r2(W - L), r2(W - L + LANDING)],
            run: atS1 ? [LANDING, r2(L - LANDING)] : [r2(W - L + LANDING), r2(W - LANDING)], dir: atS1 ? 1 : -1 };
        }
        st.floors.push(g.floor_index);
      });
      Object.keys(stairs).forEach(function (k) { var st = stairs[k]; st.floors.sort(function (a, b2) { return a - b2; }); st.top_floor = st.floors[st.floors.length - 1]; st.z_top = r2(st.top_floor * fh); B.stairs.push(st); any = true; });
      out.blocks[b.key] = B;
    });
    var cores = Object.keys(out.blocks).filter(function (k) { return out.blocks[k].core; }), ext = Object.keys(out.blocks).filter(function (k) { return out.blocks[k].stairs.length; });
    if (ext.length) out.notes.push(NOTE);
    if (cores.length) out.notes.push("A shared single exit stair in a " + out.blocks[cores[0]].core.width_m.toFixed(1) + " m core across the depth of the building, with a vestibule on the street and a corridor on every floor that the units open onto; permitted for a building of this size under the BC Building Code 2024 and the Vancouver Building By-law (sprinklered; to be confirmed with the code consultant).");
    return out;
  }
  function hasCore(ap) { return Object.keys(ap.blocks).some(function (k) { return !!ap.blocks[k].core; }); }
  // block-local metres -> site coordinates through the building's quad ([front-s1, rear-s1, rear-s2, front-s2])
  function toSite(bld, B, x, y) { return R1Cmhc.bilinear(bld.pts, x / B.width_m, y / B.depth_m); }
  function rectSite(bld, B, x0, x1, y0, y1) { return [toSite(bld, B, x0, y0), toSite(bld, B, x0, y1), toSite(bld, B, x1, y1), toSite(bld, B, x1, y0)]; }
  function hasStairs(ap) { return Object.keys(ap.blocks).some(function (k) { return ap.blocks[k].stairs.length > 0; }); }
  // one line per block for the report and the notes
  function lines(ap) {
    var L = [];
    Object.keys(ap.blocks).forEach(function (k) {
      var B = ap.blocks[k];
      if (B.core) { var served = Object.keys(ap.entries).filter(function (e) { return ap.entries[e].block === k && ap.entries[e].core && ap.entries[e].unit !== R1Cmhc.CORE_KEY; }).map(function (e) { return ap.entries[e].unit; }); L.push(B.name + ": shared single exit stair in a " + B.core.width_m.toFixed(1) + " m core across the depth, entered from the street, with a corridor on every floor serving " + (served.join(", ") || "no unit") + "; the street-facing ground units keep their own front doors."); }
      B.stairs.forEach(function (st) {
        var served = B.walkways.filter(function (w) { return w.face === st.face; }).map(function (w) { return w.units.join(", ") + " (" + ["ground", "second", "third", "fourth"][w.floor_index] + " floor)"; }).join("; ");
        L.push(B.name + ": exterior single exit stair on the " + (st.face === "rear" ? (k === "rear" ? "lane" : "rear") : (k === "rear" ? "courtyard" : "front")) + " face at the side-" + st.at_side + " end, " + st.len.toFixed(1) + " x " + (2 * FLIGHT_W).toFixed(1) + " m, with a " + WALK_W + " m walkway serving " + served + ".");
      });
    });
    return L;
  }
  return { plan: plan, lines: lines, entryFace: entryFace, stairLength: stairLength, toSite: toSite, rectSite: rectSite, hasStairs: hasStairs, hasCore: hasCore, WALK_W: WALK_W, FLIGHT_W: FLIGHT_W, LANDING: LANDING, PROJ: PROJ, GUARD_H: GUARD_H, NOTE: NOTE };
})();
