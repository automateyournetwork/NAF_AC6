// Builds the region's data files from Natural Earth public-domain data.
//
//   node tools/build-map.mjs
//
// Reads (downloading once into .cache/natural-earth/, which is not committed):
//   ne_10m_populated_places_simple, ne_50m_land, ne_50m_lakes
// Writes:
//   src/content/region-na.json   site pool: code, name, lon, lat, weight
//   src/content/coast-na.json    simplified coastline and large lakes
// Prints the SHA-256 of each source file so it can be recorded in PROVENANCE.md.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache", "natural-earth");
const REF = "v5.1.2";
const BASE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${REF}/geojson/`;
const FILES = {
  places: "ne_10m_populated_places_simple.geojson",
  land: "ne_50m_land.geojson",
  lakes: "ne_50m_lakes.geojson",
};

// The site pool. Codes are city codes; weight is the site's share of traffic (1 to 3).
// Names and countries are matched against Natural Earth, which supplies the coordinates.
const SITES = [
  ["SEA", "Seattle", "United States of America", 2],
  ["SFO", "San Francisco", "United States of America", 2],
  ["LAX", "Los Angeles", "United States of America", 3],
  ["SLC", "Salt Lake City", "United States of America", 1],
  ["PHX", "Phoenix", "United States of America", 1],
  ["DEN", "Denver", "United States of America", 1],
  ["DFW", "Dallas", "United States of America", 2],
  ["HOU", "Houston", "United States of America", 2],
  ["MKC", "Kansas City", "United States of America", 1],
  ["MSP", "Minneapolis", "United States of America", 1],
  ["CHI", "Chicago", "United States of America", 3],
  ["ATL", "Atlanta", "United States of America", 2],
  ["MIA", "Miami", "United States of America", 2],
  ["WAS", "Washington, D.C.", "United States of America", 2],
  ["NYC", "New York", "United States of America", 3],
  ["BOS", "Boston", "United States of America", 2],
  ["YTO", "Toronto", "Canada", 2],
  ["YMQ", "Montréal", "Canada", 1],
];

// Clip box in degrees, wider than anything the camera shows.
const BOX = { west: -140, east: -50, south: 8, north: 62 };
const TOLERANCE = 0.12; // degrees
const MIN_RING_SPAN = 0.6; // degrees; smaller islands are dropped
const MIN_LAKE_SPAN = 1.6;

async function load(name) {
  mkdirSync(CACHE, { recursive: true });
  const path = join(CACHE, name);
  if (!existsSync(path)) {
    const response = await fetch(BASE + name, { headers: { "User-Agent": "node" } });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  }
  const bytes = readFileSync(path);
  console.log(`${name}  ${bytes.length} bytes  sha256 ${createHash("sha256").update(bytes).digest("hex")}`);
  return JSON.parse(bytes.toString("utf8"));
}

// --- geometry ---------------------------------------------------------------------------

/** Sutherland–Hodgman clip of one ring against the box. */
function clip(ring) {
  const edges = [
    [(p) => p[0] >= BOX.west, (a, b) => [BOX.west, a[1] + ((b[1] - a[1]) * (BOX.west - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= BOX.east, (a, b) => [BOX.east, a[1] + ((b[1] - a[1]) * (BOX.east - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= BOX.south, (a, b) => [a[0] + ((b[0] - a[0]) * (BOX.south - a[1])) / (b[1] - a[1]), BOX.south]],
    [(p) => p[1] <= BOX.north, (a, b) => [a[0] + ((b[0] - a[0]) * (BOX.north - a[1])) / (b[1] - a[1]), BOX.north]],
  ];
  let points = ring;
  for (const [inside, cross] of edges) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      const previous = points[(i + points.length - 1) % points.length];
      if (inside(current)) {
        if (!inside(previous)) out.push(cross(previous, current));
        out.push(current);
      } else if (inside(previous)) {
        out.push(cross(previous, current));
      }
    }
    points = out;
    if (points.length === 0) break;
  }
  return points;
}

/** Distance from p to the segment a–b. When a and b coincide, the distance to the point itself. */
function distance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  if (length2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas–Peucker on an open line. */
function simplifyLine(points) {
  if (points.length < 3) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let worst = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = distance(points[i], points[first], points[last]);
      if (d > worst) {
        worst = d;
        index = i;
      }
    }
    if (index >= 0 && worst > TOLERANCE) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Simplifies a closed ring. A ring starts and ends on the same point, so the chord of the
 * whole ring has no length; it is split at its farthest point into two open lines first.
 */
function simplifyRing(ring) {
  const open = ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring;
  if (open.length < 4) return open;
  let far = 0;
  let worst = -1;
  for (let i = 1; i < open.length; i++) {
    const d = Math.hypot(open[i][0] - open[0][0], open[i][1] - open[0][1]);
    if (d > worst) {
      worst = d;
      far = i;
    }
  }
  const firstHalf = simplifyLine(open.slice(0, far + 1));
  const secondHalf = simplifyLine([...open.slice(far), open[0]]);
  return [...firstHalf, ...secondHalf.slice(1, -1)];
}

function span(ring) {
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const [x, y] of ring) {
    west = Math.min(west, x);
    east = Math.max(east, x);
    south = Math.min(south, y);
    north = Math.max(north, y);
  }
  return Math.hypot(east - west, north - south);
}

function outerRings(collection) {
  const rings = [];
  for (const feature of collection.features) {
    const g = feature.geometry;
    const polygons = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const polygon of polygons) rings.push(polygon[0]);
  }
  return rings;
}

function reduce(rings, minSpan) {
  const out = [];
  for (const ring of rings) {
    const clipped = clip(ring);
    if (clipped.length < 4 || span(clipped) < minSpan) continue;
    const simple = simplifyRing(clipped);
    if (simple.length < 4) continue;
    out.push(simple.flatMap(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]));
  }
  return out.sort((a, b) => b.length - a.length);
}

// --- main -------------------------------------------------------------------------------

const places = await load(FILES.places);
const land = await load(FILES.land);
const lakes = await load(FILES.lakes);

const sites = SITES.map(([code, name, country, weight]) => {
  const matches = places.features.filter(
    (f) => (f.properties.name === name || f.properties.nameascii === name) && f.properties.adm0name === country,
  );
  if (matches.length === 0) throw new Error(`no Natural Earth place named ${name} in ${country}`);
  // Where a name repeats inside a country, the most populous place is the one meant.
  matches.sort((a, b) => (b.properties.pop_max ?? 0) - (a.properties.pop_max ?? 0));
  const [lon, lat] = matches[0].geometry.coordinates;
  return { code, name: name.replace(", D.C.", ""), lon: Math.round(lon * 100) / 100, lat: Math.round(lat * 100) / 100, weight };
});

const region = { id: "na", name: "North America", lon0: -96, lat0: 39, sites };
writeFileSync(join(ROOT, "src/content/region-na.json"), JSON.stringify(region, null, 2) + "\n");

const coast = {
  source: `Natural Earth 1:50m land and lakes (public domain), tag ${REF}, simplified by tools/build-map.mjs`,
  rings: reduce(outerRings(land), MIN_RING_SPAN),
  lakes: reduce(outerRings(lakes), MIN_LAKE_SPAN),
};
const coastText = JSON.stringify(coast);
writeFileSync(join(ROOT, "src/content/coast-na.json"), coastText + "\n");

const points = (rings) => rings.reduce((n, r) => n + r.length / 2, 0);
console.log(`region-na.json: ${sites.length} sites`);
console.log(
  `coast-na.json: ${coast.rings.length} land rings (${points(coast.rings)} points), ` +
    `${coast.lakes.length} lake rings (${points(coast.lakes)} points), ${coastText.length} bytes`,
);
