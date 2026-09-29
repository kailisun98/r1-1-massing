/* site.js -- City of Vancouver Open Data fetch + local metre frame for the web app.
   A port of lib/r1_1_site.py; the portal allows browser requests (Access-Control-Allow-Origin: *). */
var R1Site = (function () {
  "use strict";

  var API = "https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/{0}/exports/geojson?where={1}";
  var META = "https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/{0}";
  var DATASETS = {
    addresses: { id: "property-addresses", note: "Primary civic addresses (VanMap); used to locate the site." },
    parcels: { id: "property-parcel-polygons", note: "Assessment-based land parcels. Fields: civic_number, streetname, site_id, tax_coord." },
    footprints: { id: "building-footprints-2015", note: "2D outlines from 2015 orthophotos, split at parcel lines. No heights." },
    heights: { id: "building-footprints-2009", note: "2009 LiDAR footprints with hgt_agl (m above ground) and baseelev_m (ground, m). Approximate; matched to 2015 outlines by centroid." },
    contours: { id: "elevation-contour-lines-1-metre-contours", note: "1 m contours digitised from 2002 orthophotos. Approximate, not updated since." }
  };
  var LICENCE = "Open Government Licence - Vancouver (opendata.vancouver.ca)";
  var DEFAULT_BUILDING_HEIGHT_M = 7.5, TOPO_GRID_M = 2.0, RING_SIMPLIFY_TOL_M = 0.05, R_EARTH = 6378137.0;
  var STREET_ABBREV = { AVENUE: "AV", AVE: "AV", STREET: "ST", ROAD: "RD", DRIVE: "DR", BOULEVARD: "BLVD", CRESCENT: "CRES",
    PLACE: "PL", COURT: "CRT", WEST: "W", EAST: "E", NORTH: "N", SOUTH: "S" };

  function LocalFrame(lat0, lon0) {
    this.lat0 = lat0; this.lon0 = lon0; this.k = Math.cos(lat0 * Math.PI / 180);
  }
  LocalFrame.prototype.toXY = function (lon, lat) {
    return [(lon - this.lon0) * Math.PI / 180 * R_EARTH * this.k, (lat - this.lat0) * Math.PI / 180 * R_EARTH];
  };
  LocalFrame.prototype.toLonLat = function (x, y) {
    return [this.lon0 + (x / (R_EARTH * this.k)) * 180 / Math.PI, this.lat0 + (y / R_EARTH) * 180 / Math.PI];
  };
  LocalFrame.prototype.toLatLng = function (p) { var ll = this.toLonLat(p[0], p[1]); return [ll[1], ll[0]]; };

  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function pointToSegment(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    if (L2 < 1e-12) return dist(p, a);
    var t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
    return dist(p, [a[0] + t * dx, a[1] + t * dy]);
  }
  function signedArea(ring) {
    var s = 0, n = ring.length;
    for (var i = 0; i < n; i++) { var p = ring[i], q = ring[(i + 1) % n]; s += p[0] * q[1] - q[0] * p[1]; }
    return s / 2;
  }
  function centroid(ring) {
    var a = signedArea(ring), n = ring.length;
    if (Math.abs(a) < 1e-9) {
      var sx = 0, sy = 0; ring.forEach(function (p) { sx += p[0]; sy += p[1]; });
      return [sx / n, sy / n];
    }
    var cx = 0, cy = 0;
    for (var i = 0; i < n; i++) {
      var p = ring[i], q = ring[(i + 1) % n], f = p[0] * q[1] - q[0] * p[1];
      cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f;
    }
    return [cx / (6 * a), cy / (6 * a)];
  }
  function pointInRing(p, ring) {
    var x = p[0], y = p[1], inside = false, n = ring.length, j = n - 1;
    for (var i = 0; i < n; i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi)) inside = !inside;
      j = i;
    }
    return inside;
  }
  function openRing(ring) {
    if (ring.length > 1 && dist(ring[0], ring[ring.length - 1]) < 1e-6) return ring.slice(0, -1);
    return ring.slice();
  }
  function simplifyRing(ring, tol) {
    tol = tol || RING_SIMPLIFY_TOL_M;
    var pts = openRing(ring), changed = true;
    while (changed && pts.length > 3) {
      changed = false;
      var n = pts.length;
      for (var i = 0; i < n; i++) {
        var p = pts[(i - 1 + n) % n], q = pts[i], r = pts[(i + 1) % n];
        if (dist(p, q) < tol || pointToSegment(q, p, r) < tol) { pts.splice(i, 1); changed = true; break; }
      }
    }
    return pts;
  }
  function bboxDims(ring) {
    var xs = ring.map(function (p) { return p[0]; }), ys = ring.map(function (p) { return p[1]; });
    return [Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys)];
  }
  function edgeLengths(ring) { return ring.map(function (p, i) { return dist(p, ring[(i + 1) % ring.length]); }); }
  function approxDims(ring) {
    if (ring.length === 4) {
      var e = edgeLengths(ring).sort(function (a, b) { return a - b; });
      return [(e[0] + e[1]) / 2, (e[2] + e[3]) / 2];
    }
    return bboxDims(ring);
  }

  function features(json) { return json && json.features ? json.features : []; }
  function rings(geometry) {
    if (!geometry) return [];
    var t = geometry.type, c = geometry.coordinates || [];
    if (t === "Polygon") return c.length ? [c[0]] : [];
    if (t === "MultiPolygon") return c.filter(function (poly) { return poly.length; }).map(function (poly) { return poly[0]; });
    if (t === "LineString") return [c];
    if (t === "MultiLineString") return c.slice();
    return [];
  }
  function within(lon, lat, radiusM) {
    return "within_distance(geom, geom'POINT(" + lon.toFixed(7) + " " + lat.toFixed(7) + ")', " + Math.round(radiusM) + "m)";
  }
  function format(tpl) { var args = arguments; return tpl.replace(/\{(\d+)\}/g, function (m, i) { return args[parseInt(i, 10) + 1]; }); }
  function exportUrl(id, where) { return format(API, id, encodeURIComponent(where)); }

  /* Every portal request goes through getJSON. A "tape" (the responses of one site, keyed by request URL with the
     search radius blanked out) lets the app replay a site without the network: the shared artifact copy ships
     tapes for its preloaded sites, and "Save site file" writes the tape of a live fetch. Recording keeps the tape of
     the current fetch. Tapes are recorded at the largest search radius, so a smaller cut replays a superset. */
  var tape = null, recorder = null;
  function tapeKey(url) { return url.replace(/%2C%20\d+m\)/g, "%2C%20Rm)").replace(/, \d+m\)/g, ", Rm)"); }   // the where clause is URL-encoded
  function getJSON(url) {
    var key = tapeKey(url);
    if (tape) {
      if (Object.prototype.hasOwnProperty.call(tape, key)) return Promise.resolve(tape[key]);
      return Promise.reject(new Error("not in the site file: " + (url.split("/datasets/")[1] || url).split("/")[0]));
    }
    return fetch(url, { headers: { Accept: "application/json" } }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " from " + url.split("?")[0]);
      return r.json();
    }).then(function (json) { if (recorder) recorder[key] = json; return json; });
  }
  function useTape(t) { tape = t || null; }
  function record(on) { recorder = on ? {} : null; }
  function tapeContents() { return recorder; }

  /* slimTape: the same responses with only the properties the app reads, coordinates rounded to 1e-9 deg (0.1 mm),
     the zoning polygon dropped (only its labels are read) and the city-wide contour lines cut to the runs within
     keepR of the centre (the app filters contour points by radius anyway, so the replay is identical). */
  var KEEP_PROPS = { "property-addresses": ["civic_number", "std_street", "site_id", "geo_local_area"],
    "property-parcel-polygons": ["civic_number", "streetname", "site_id", "tax_coord"], "building-footprints-2015": ["object_id"],
    "building-footprints-2009": ["hgt_agl", "baseelev_m"], "elevation-contour-lines-1-metre-contours": ["elevation"],
    "zoning-districts-and-labels": ["zoning_district", "zoning_category", "zoning_classification"],
    "public-streets": ["hblock", "streetuse"], "lanes": ["std_street", "from_hundred_block"] };
  function slimTape(t, lat, lon, keepR) {
    var frame = new LocalFrame(lat, lon), out = {};
    function rc(c) { return [Math.round(c[0] * 1e9) / 1e9, Math.round(c[1] * 1e9) / 1e9]; }
    Object.keys(t).forEach(function (key) {
      var json = t[key], ds = (key.split("/datasets/")[1] || "").split("/")[0].split("?")[0];
      if (!json || !json.features) { out[key] = json; return; }   // dataset metadata (the 'modified' date)
      var keep = KEEP_PROPS[ds];
      out[key] = { type: "FeatureCollection", features: json.features.map(function (f) {
        var pr = {}, src = f.properties || {}, g = f.geometry, geom = g;
        (keep || Object.keys(src)).forEach(function (k) { if (k in src) pr[k] = src[k]; });
        if (ds === "zoning-districts-and-labels") geom = null;
        else if (ds === "elevation-contour-lines-1-metre-contours" && g && (g.type === "LineString" || g.type === "MultiLineString")) {
          var lines = g.type === "LineString" ? [g.coordinates] : g.coordinates, runs = [];
          lines.forEach(function (line) {
            var run = [];
            line.forEach(function (c) { var p = frame.toXY(c[0], c[1]); if (Math.hypot(p[0], p[1]) <= keepR) run.push(rc(c)); else if (run.length) { runs.push(run); run = []; } });
            if (run.length) runs.push(run);
          });
          geom = { type: "MultiLineString", coordinates: runs };
        } else if (g && (g.type === "LineString")) geom = { type: g.type, coordinates: g.coordinates.map(rc) };
        else if (g && (g.type === "MultiLineString" || g.type === "Polygon")) geom = { type: g.type, coordinates: g.coordinates.map(function (r) { return r.map(rc); }) };
        else if (g && g.type === "MultiPolygon") geom = { type: g.type, coordinates: g.coordinates.map(function (poly) { return poly.map(function (r) { return r.map(rc); }); }) };
        else if (g && g.type === "Point") geom = { type: "Point", coordinates: rc(g.coordinates) };
        return { type: "Feature", geometry: geom, properties: pr };
      }) };
    });
    return out;
  }

  function normaliseAddress(text) {
    var parts = text.trim().replace(/,/g, " ").split(/\s+/).filter(Boolean);
    if (!parts.length || !/^\d+$/.test(parts[0])) return [null, null];
    var words = parts.slice(1).map(function (w) { var u = w.toUpperCase(); return STREET_ABBREV[u] || u; });
    return [parts[0], words.join(" ")];
  }

  function geocode(text) {
    var na = normaliseAddress(text), civic = na[0], street = na[1];
    if (civic === null) return Promise.reject(new Error("Address must start with a civic number, e.g. '1560 W 13th Ave'."));
    var where = 'civic_number="' + civic + '" and std_street="' + street + '"';
    return getJSON(exportUrl(DATASETS.addresses.id, where)).then(function (json) {
      var feats = features(json);
      if (feats.length) return feats;
      var first = street ? street.split(" ")[0] : "";
      return getJSON(exportUrl(DATASETS.addresses.id, 'civic_number="' + civic + '" and std_street like "%' + first + '%"')).then(features);
    }).then(function (feats) {
      var hits = [];
      feats.forEach(function (f) {
        var g = f.geometry || {};
        if (g.type !== "Point") return;
        var pr = f.properties || {};
        hits.push({ lat: g.coordinates[1], lon: g.coordinates[0], civic_number: pr.civic_number, std_street: pr.std_street,
          site_id: pr.site_id, local_area: pr.geo_local_area });
      });
      if (!hits.length) return null;
      var best = hits[0]; best.matches = hits;
      return best;
    });
  }

  function metaModified(key) {
    return getJSON(format(META, DATASETS[key].id)).then(function (d) {
      return (d && d.metas && d.metas["default"] && d.metas["default"].modified) || "unknown";
    }).catch(function () { return "unknown"; });
  }

  /* fetchArea: everything within radius_m of (lat, lon), projected to local metres.
     Returns a promise of the same dict shape as r1_1_site.fetch_area. */
  function fetchArea(lat, lon, radiusM, log) {
    var say = log || function () {};
    var frame = new LocalFrame(lat, lon);
    var res = { frame: frame, centre: [lat, lon], radius_m: radiusM, fetched: new Date().toISOString().slice(0, 16).replace("T", " "),
      parcels: [], buildings: [], contours: [], topo_points: [], target: null, z0: null, provenance: [], warnings: [] };
    var clipR = radiusM + 20;
    say("Fetching parcels, building footprints, 2009 LiDAR heights and 1 m contours ...");
    return Promise.all([
      getJSON(exportUrl(DATASETS.parcels.id, within(lon, lat, radiusM))),
      getJSON(exportUrl(DATASETS.footprints.id, within(lon, lat, radiusM))),
      getJSON(exportUrl(DATASETS.heights.id, within(lon, lat, radiusM + 10))),
      getJSON(exportUrl(DATASETS.contours.id, within(lon, lat, clipR))),
      Promise.all(["parcels", "footprints", "heights", "contours"].map(metaModified))
    ]).then(function (all) {
      var parcelsJ = all[0], footJ = all[1], heightsJ = all[2], contJ = all[3], mods = all[4];
      features(parcelsJ).forEach(function (f) {
        var pr = f.properties || {};
        rings(f.geometry).forEach(function (ring) {
          var xy = simplifyRing(ring.map(function (c) { return frame.toXY(c[0], c[1]); }));
          if (xy.length < 3) return;
          res.parcels.push({ civic: pr.civic_number, street: pr.streetname, site_id: pr.site_id, tax_coord: pr.tax_coord, ring: xy, centroid: centroid(xy) });
        });
      });
      say("  " + res.parcels.length + " parcels");
      var inside = res.parcels.filter(function (p) { return pointInRing([0, 0], p.ring); });
      if (inside.length) res.target = inside[0];
      else if (res.parcels.length) {
        res.target = res.parcels.reduce(function (best, p) { return dist(p.centroid, [0, 0]) < dist(best.centroid, [0, 0]) ? p : best; });
        res.warnings.push("Centre point is not inside any parcel; nearest parcel used as the site.");
      }
      var outlines = [];
      features(footJ).forEach(function (f) {
        var pr = f.properties || {};
        rings(f.geometry).forEach(function (ring) {
          var xy = simplifyRing(ring.map(function (c) { return frame.toXY(c[0], c[1]); }));
          if (xy.length >= 3) outlines.push({ object_id: pr.object_id, ring: xy, centroid: centroid(xy) });
        });
      });
      var heights = [];
      features(heightsJ).forEach(function (f) {
        var pr = f.properties || {};
        rings(f.geometry).forEach(function (ring) {
          var xy = ring.map(function (c) { return frame.toXY(c[0], c[1]); });
          if (xy.length >= 3) heights.push({ centroid: centroid(openRing(xy)), ring: openRing(xy), hgt_agl: pr.hgt_agl, baseelev_m: pr.baseelev_m });
        });
      });
      say("  " + outlines.length + " building outlines, " + heights.length + " height records");
      var matched = 0;
      outlines.forEach(function (o) {
        var hits = heights.filter(function (h) { return h.hgt_agl !== null && h.hgt_agl !== undefined && pointInRing(h.centroid, o.ring); });
        if (!hits.length) hits = heights.filter(function (h) { return h.hgt_agl !== null && h.hgt_agl !== undefined && pointInRing(o.centroid, h.ring); });
        if (hits.length) {
          var h = hits.reduce(function (a, b) { return b.hgt_agl > a.hgt_agl ? b : a; });
          o.height_m = parseFloat(h.hgt_agl); o.base_geodetic = h.baseelev_m !== null && h.baseelev_m !== undefined ? parseFloat(h.baseelev_m) : null;
          o.height_source = "2009 LiDAR hgt_agl"; matched++;
        } else {
          o.height_m = DEFAULT_BUILDING_HEIGHT_M; o.base_geodetic = null; o.height_source = "DEFAULT " + DEFAULT_BUILDING_HEIGHT_M + " m (no 2009 match)";
        }
      });
      res.buildings = outlines; res.height_matched = matched;
      if (outlines.length && matched < outlines.length) res.warnings.push((outlines.length - matched) + " of " + outlines.length + " buildings use the default height " + DEFAULT_BUILDING_HEIGHT_M + " m.");

      var topo = {};
      function addTopo(x, y, z) {
        var key = Math.round(x / TOPO_GRID_M) + "," + Math.round(y / TOPO_GRID_M);
        if (!(key in topo)) topo[key] = [x, y, parseFloat(z)];
      }
      features(contJ).forEach(function (f) {
        var z = (f.properties || {}).elevation;
        if (z === null || z === undefined) return;
        rings(f.geometry).forEach(function (line) {
          var pts = line.map(function (c) { return frame.toXY(c[0], c[1]); }).filter(function (p) { return dist(p, [0, 0]) <= clipR; });
          if (pts.length >= 2) res.contours.push({ elevation: parseFloat(z), pts: pts });
          pts.forEach(function (p) { addTopo(p[0], p[1], z); });
        });
      });
      var nBase = 0;
      heights.forEach(function (h) {
        if (h.baseelev_m !== null && h.baseelev_m !== undefined && dist(h.centroid, [0, 0]) <= clipR) { addTopo(h.centroid[0], h.centroid[1], h.baseelev_m); nBase++; }
      });
      res.topo_points = Object.keys(topo).map(function (k) { return topo[k]; });
      say("  " + res.contours.length + " contour lines, " + res.topo_points.length + " elevation points (" + nBase + " at 2009 building centroids)");
      if (res.topo_points.length < 3) res.warnings.push("No elevation data in range; topography will be flat.");
      if (res.topo_points.length) {
        var near = res.topo_points.slice().sort(function (a, b) { return dist(a, [0, 0]) - dist(b, [0, 0]); }).slice(0, 5);
        var ws = 0, zs = 0;
        near.forEach(function (p) { var w = 1 / Math.max(dist(p, [0, 0]), 0.5); ws += w; zs += w * p[2]; });
        res.z0 = zs / ws;
      }
      res.buildings.forEach(function (o) {
        if (o.base_geodetic === null && res.topo_points.length) {
          var near3 = res.topo_points.slice().sort(function (a, b) { return dist(a, o.centroid) - dist(b, o.centroid); }).slice(0, 3);
          o.base_geodetic = near3.reduce(function (s, p) { return s + p[2]; }, 0) / near3.length;
        }
        if (o.base_geodetic === null) o.base_geodetic = res.z0 !== null ? res.z0 : 0;
      });
      ["parcels", "footprints", "heights", "contours"].forEach(function (key, i) {
        res.provenance.push(key + ": " + DATASETS[key].id + " (portal 'modified' " + mods[i] + "). " + DATASETS[key].note);
      });
      res.provenance.push("Licence: " + LICENCE + ". Fetched " + res.fetched + ".");
      res.provenance.push("Projection: local tangent plane centred on lat " + lat.toFixed(6) + ", lon " + lon.toFixed(6) + "; x east, y north, metres.");
      return res;
    });
  }

  function localZ(res, zGeodetic) { return zGeodetic - (res.z0 !== null ? res.z0 : 0); }

  function reportLines(res) {
    var L = [], bar = new Array(71).join("=");
    L.push(bar, "R1-1 BASE SITE IMPORT", "Centre: lat " + res.centre[0].toFixed(6) + ", lon " + res.centre[1].toFixed(6) + "   radius " + Math.round(res.radius_m) + " m");
    if (res.z0 !== null) L.push("Ground at centre: " + res.z0.toFixed(2) + " m geodetic  -> model Z = 0");
    L.push(bar);
    var t = res.target;
    if (t) {
      var wd = approxDims(t.ring);
      L.push("Site parcel: " + t.civic + " " + t.street + "  (site_id " + t.site_id + ", tax_coord " + t.tax_coord + ")  " + t.ring.length + " vertices, about " + wd[0].toFixed(2) + " x " + wd[1].toFixed(2) + " m");
    } else L.push("Site parcel: none found");
    L.push("Parcels in range: " + res.parcels.length, "Buildings in range: " + res.buildings.length + "  (" + (res.height_matched || 0) + " with 2009 LiDAR heights)",
      "Contour lines: " + res.contours.length + "   elevation points for topography: " + res.topo_points.length);
    if (res.warnings.length) { L.push("", "WARNINGS:"); res.warnings.forEach(function (w) { L.push("  - " + w); }); }
    L.push("", "SOURCES:"); res.provenance.forEach(function (p) { L.push("  - " + p); });
    L.push("", "All imported geometry is APPROXIMATE context. Check parcel dimensions against a legal survey before relying on them.");
    return L;
  }

  return { API: API, DATASETS: DATASETS, LICENCE: LICENCE, LocalFrame: LocalFrame, dist: dist, pointToSegment: pointToSegment,
    signedArea: signedArea, centroid: centroid, pointInRing: pointInRing, openRing: openRing, simplifyRing: simplifyRing,
    approxDims: approxDims, features: features, rings: rings, within: within, exportUrl: exportUrl, getJSON: getJSON,
    tapeKey: tapeKey, useTape: useTape, record: record, tapeContents: tapeContents, slimTape: slimTape, normaliseAddress: normaliseAddress, geocode: geocode, fetchArea: fetchArea, localZ: localZ, reportLines: reportLines };
})();
