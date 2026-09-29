# R1-1 Massing

A browser tool for Vancouver's R1-1 zone (Zoning and Development By-law No. 3575, R1-1 District
Schedule, s.3.1 Multiple dwelling): type an address, and the tool fetches the parcel, the
neighbouring buildings, the contours and the street and lane centrelines from the City of
Vancouver Open Data portal, finds the street edge, applies the setback and height rules, draws the
permitted building envelope with its dimension strings, and offers the courtyard and side-by-side
form options. Every number in the report is tied to its by-law clause. A 3D view and a site section
are one click away.

Open the site, type an address (for example `3567 W 27th Ave`) and follow the five steps in the
sidebar. Nothing is stored; the page talks to the open-data portal directly from your browser.

## Files

- `index.html` — the page (layout, styles) and the script tags.
- `app.js` — the five-step workflow, the map (Leaflet), the 3D view (three.js) and the section.
- `core.js` — the by-law rules and the envelope evaluation, with the clause references.
- `site.js` — the open-data fetch and the local metre frame.
- `massing.js` — street-edge detection, the site cut, roads, dimension strings, form options,
  the section plan and the tables.
- `selftest.html` — offline checks of the logic on a synthetic lot.

## Data and licences

- City of Vancouver Open Data (Open Government Licence – Vancouver): property-addresses,
  property-parcel-polygons, building-footprints-2015, building-footprints-2009 (LiDAR heights),
  elevation-contour-lines-1-metre-contours, zoning-districts-and-labels, public-streets, lanes.
- Basemap © OpenStreetMap contributors.
- Libraries: Leaflet 1.9.4, three.js r128.

All imported geometry is approximate context. Check parcel dimensions against a legal survey and
the by-law text before relying on any figure. This is a student project (UBC ARCH 540) and not
a substitute for the City's own review.
