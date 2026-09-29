/* fits.js -- standard room test fits, furniture sizes and clearances, in metres.
   Room layouts and clearances are transcribed from dimensions.com's "Layouts" pages (read 2026-09-29; the
   element slug is given for each); fixture and furniture sizes not on those pages are the usual catalogue sizes
   and say so. Stair geometry follows the BC Building Code 2024, Part 9 (9.8, stairs within a dwelling unit).
   The room layout engine (rooms.js) sizes rooms from these, and the plan renderer (plans.js) draws the
   furniture at these sizes, so a plan that fits is a plan a person can use. */
var R1Fits = (function () {
  "use strict";
  var SOURCE = { name: "dimensions.com, Layouts (rooms and spaces)", url: "https://www.dimensions.com/collection/residential-household-layouts", accessed: "2026-09-29",
    note: "Room test fits (typical widths, depths and areas with sitting and circulation zones) and clearances from dimensions.com; fixture and furniture sizes are common catalogue sizes; stairs per BC Building Code 2024 Part 9." };
  // clearances (bathroom-layout-clearances, dining-room-clearances, queen/full/twin-bedroom-layouts, galley-single-row-kitchen-layout)
  var CLEAR = {
    bath_activity: 0.61, bath_circulation: 0.76, turning: 1.52,          // 24", 30", 60"
    bed_min: 0.76, bed_comfortable: 0.91,                                 // 30" / 36" on the open sides of a bed
    dining_behind_chair: 0.91, dining_sit: 0.46, dining_circulation: 0.46, chair_spacing: 0.61,   // 36" total = 18" sitting + 18" circulation; chairs 24" apart
    kitchen_aisle: 1.2, kitchen_aisle_min: 1.07,                          // 4' in front of a single row (3'6" minimum for an L)
    hall: 0.9, door: 0.86                                                 // BCBC 9.5.3 hallway 860 mm; 9.6.6 door 810 mm clear (860 leaf used)
  };
  // beds (queen-bedroom-layouts, full-double-bedroom-layouts, twin-bedroom-layouts): size and the room around it
  var BEDS = {
    queen: { w: 1.52, l: 2.03, room_min_m2: 9.8, room_closet_m2: 11.9, label: "queen" },
    double: { w: 1.37, l: 1.91, room_min_m2: 9.0, room_closet_m2: 11.0, label: "double" },
    twin: { w: 0.97, l: 1.91, room_min_m2: 7.75, room_closet_m2: 7.75, label: "twin" }
  };
  // rooms: w along the fixture wall (or the long side), d across; [min, max] typical ranges from the pages
  var ROOMS = {
    bath_half: { w: [1.42, 2.13], d: [1.37, 1.68], m2: [1.9, 3.6], slug: "bathroom-half-bath-1-wall", fixtures: "toilet and sink on one wall" },
    bath_three_quarter: { w: [2.13, 2.9], d: [1.52, 1.83], m2: [3.3, 5.3], slug: "bathroom-three-quarter-bath-1-wall", fixtures: "toilet, sink and shower on one wall" },
    bath_full: { w: [2.13, 2.74], d: [1.52, 1.83], m2: [3.3, 5.0], slug: "bathroom-full-bath-1-wall", fixtures: "toilet, sink and tub on one wall" },
    living_l: { w: 3.35, d: 2.74, seats: 4, rug: [3.0, 2.4], slug: "living-room-layout-l-shape-sofa-armchair" },
    living_facing: { w: 3.66, d: 2.74, seats: 6, rug: [3.7, 2.7], slug: "living-room-layout-sofa-facing-armchairs" },
    dining_small: { table_w: [0.76, 1.07], table_l: [1.22, 1.52], seats: [2, 6], room_w: [2.9, 4.11], room_l: [2.13, 4.57], m2: [6.2, 18.8], slug: "dining-room-rectangle-casual-small" },
    kitchen_single: { aisle: [1.2, 1.8], run: [2.1, 3.8], m2: 7, slug: "galley-single-row-kitchen-layout" },
    kitchen_two_row: { aisle: [1.2, 1.8], run: [2.1, 3.8], m2: 10, slug: "galley-two-rows-kitchen-layout" },
    kitchen_l: { aisle_min: 1.07, aisle: [1.2, 1.8], long: [2.4, 4.0], short: [0.9, 2.7], m2: 10.3, slug: "l-shape-kitchen-layout" }
  };
  // fixtures and furniture (common catalogue sizes)
  var FIX = {
    counter_d: 0.6, sink: 0.6, dishwasher: 0.6, range: 0.76, fridge: [0.76, 0.76],
    toilet: [0.4, 0.7], toilet_centre: 0.45, vanity: [0.6, 0.9], tub: [0.76, 1.52], shower: [0.9, 0.9],
    sofa: [2.1, 0.9], loveseat: [1.5, 0.9], armchair: [0.8, 0.85], coffee_table: [1.2, 0.6], coffee_gap: 0.45, tv_unit: [1.2, 0.4],
    table4: [0.9, 1.2], table6: [0.9, 1.5], chair: 0.45, nightstand: 0.5, closet_d: 0.6, desk: [1.2, 0.6], washer_dryer_stacked: [0.7, 0.8], washer_dryer_side: [1.4, 0.7]
  };
  // stairs within a dwelling unit (BCBC 2024 9.8.2.1, 9.8.4.1): width >= 860 mm, rise 125-200 mm, run >= 255 mm; landings the stair width
  var STAIR = { width_min: 0.86, width: 0.95, rise_max: 0.2, run: 0.26, landing: 0.95 };
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  // the bed a room can hold with 0.76 m on its open sides (head against a wall): queen, double, twin or none
  function bedFor(w, h) {
    var s = Math.min(w, h), l = Math.max(w, h), c = CLEAR.bed_min;
    if (s >= BEDS.queen.w + 2 * c - 0.05 && l >= BEDS.queen.l + c - 0.05 && w * h >= BEDS.queen.room_min_m2 - 0.6) return "queen";
    if (s >= BEDS.double.w + 2 * c - 0.05 && l >= BEDS.double.l + c - 0.05 && w * h >= BEDS.double.room_min_m2 - 0.6) return "double";
    if (s >= BEDS.twin.w + c && l >= BEDS.twin.l + 0.3 && w * h >= BEDS.twin.room_min_m2 - 0.4) return "twin";
    return null;
  }
  return { SOURCE: SOURCE, CLEAR: CLEAR, BEDS: BEDS, ROOMS: ROOMS, FIX: FIX, STAIR: STAIR, bedFor: bedFor, clamp: clamp };
})();
