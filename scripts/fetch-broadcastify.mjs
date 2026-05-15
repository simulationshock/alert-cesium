#!/usr/bin/env node
/**
 * Crawls Broadcastify's public California county pages and writes
 * web-demo/public/data/radio-feeds.json with every available CA public-safety feed.
 *
 * Run manually when you want to refresh feed data:
 *   node scripts/fetch-broadcastify.mjs
 * Then commit the updated JSON.  CI never runs this script.
 *
 * No API keys required.  Uses:
 *   - Broadcastify HTML pages (server-side rendered, publicly accessible)
 *   - Nominatim (OpenStreetMap) for city-level geocoding — free, no key, 1 req/s limit
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
// Vite copies web-demo/public/** verbatim to dist-site/ — runtime-fetched assets go here.
const OUT_DIR  = join(__dir, '../web-demo/public/data');
const OUT_FILE = join(OUT_DIR, 'radio-feeds.json');

const BASE    = 'https://www.broadcastify.com';
const CA_STID = 6;   // Broadcastify state ID for California
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

const BF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};
const NOM_HEADERS = {
  // Nominatim requires a meaningful User-Agent identifying the application
  'User-Agent': 'alert-cesium/1.0 (radio feed geocoder; github.com/simulationshock/alert-cesium)',
  'Accept-Language': 'en-US,en;q=0.5',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getBF(url) {
  const res = await fetch(url, { headers: BF_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// ── California county centroids — fallback when city geocoding fails ──────────
const COUNTY_CENTROIDS = {
  'Alameda':          [37.6517, -121.9196],
  'Alpine':           [38.5974, -119.8215],
  'Amador':           [38.4463, -120.6541],
  'Butte':            [39.6696, -121.6016],
  'Calaveras':        [38.2016, -120.5564],
  'Colusa':           [39.1763, -122.2378],
  'Contra Costa':     [37.9161, -121.9152],
  'Del Norte':        [41.7432, -123.9153],
  'El Dorado':        [38.7785, -120.5248],
  'Fresno':           [36.7378, -119.7871],
  'Glenn':            [39.5979, -122.3923],
  'Humboldt':         [40.7450, -123.8695],
  'Imperial':         [33.0445, -115.3609],
  'Inyo':             [36.5749, -117.4114],
  'Kern':             [35.3733, -119.0187],
  'Kings':            [36.0753, -119.8157],
  'Lake':             [39.0968, -122.7539],
  'Lassen':           [40.6744, -120.5948],
  'Los Angeles':      [34.0522, -118.2437],
  'Madera':           [37.2145, -119.7572],
  'Marin':            [38.0580, -122.7316],
  'Mariposa':         [37.5767, -119.8984],
  'Mendocino':        [39.5051, -123.3291],
  'Merced':           [37.1882, -120.7197],
  'Modoc':            [41.5888, -120.7221],
  'Mono':             [37.9388, -118.8851],
  'Monterey':         [36.2389, -121.3101],
  'Napa':             [38.5025, -122.2654],
  'Nevada':           [39.2955, -120.7691],
  'Orange':           [33.7175, -117.8311],
  'Placer':           [39.0916, -120.8039],
  'Plumas':           [40.0027, -120.8407],
  'Riverside':        [33.9534, -117.3962],
  'Sacramento':       [38.5816, -121.4944],
  'San Benito':       [36.6054, -121.0751],
  'San Bernardino':   [34.1083, -117.2898],
  'San Diego':        [32.7157, -117.1611],
  'San Francisco':    [37.7749, -122.4194],
  'San Joaquin':      [37.9363, -121.2718],
  'San Luis Obispo':  [35.2699, -120.6699],
  'San Mateo':        [37.4337, -122.4030],
  'Santa Barbara':    [34.4208, -119.6982],
  'Santa Clara':      [37.3541, -121.9552],
  'Santa Cruz':       [37.0454, -121.9580],
  'Shasta':           [40.7909, -122.0200],
  'Sierra':           [39.5766, -120.5210],
  'Siskiyou':         [41.5918, -122.5413],
  'Solano':           [38.2694, -121.9399],
  'Sonoma':           [38.5258, -122.9973],
  'Stanislaus':       [37.5590, -120.9876],
  'Sutter':           [39.0347, -121.6914],
  'Tehama':           [40.1253, -122.2340],
  'Trinity':          [40.6490, -123.1130],
  'Tulare':           [36.2077, -118.7898],
  'Tuolumne':         [37.9697, -119.9556],
  'Ventura':          [34.3705, -119.1391],
  'Yolo':             [38.6785, -121.9018],
  'Yuba':             [39.2646, -121.3468],
};

// ── Feed categorisation ───────────────────────────────────────────────────────
function categorize(name, genre = '') {
  const n = (name + ' ' + genre).toLowerCase();
  if (/police|sheriff|pd\b|constable|marshal|corrections/.test(n)) return 'law';
  if (/\bems\b|medical|ambulance|paramedic/.test(n)) return 'ems';
  if (/\bfire\b/.test(n)) return 'fire';
  if (/aircraft|aviation|tracon|approach|center\b|tower|unicom|atis|ctaf|fss/.test(n)) return 'aircraft';
  if (/interop|mutual|tac\b|\bops\b|multi/.test(n)) return 'multi';
  return 'other';
}

// ── City-name extraction from feed name ──────────────────────────────────────
/**
 * Attempts to extract a geocodable city/place name from a feed name.
 * Returns null when the name doesn't contain a recognisable place prefix.
 *
 * Examples:
 *   "Chula Vista Police and Fire"  → "Chula Vista"
 *   "Escondido Fire"               → "Escondido"
 *   "Sacramento County Sheriff"    → "Sacramento"
 *   "Cal Fire Air"                 → null  (no city)
 *   "LAPD Metro / Central"         → null  (acronym, not a place name)
 */
function extractCityName(feedName) {
  let n = feedName.trim();

  // Strip known leading agency acronyms / prefixes that aren't place names
  n = n.replace(/^(CalFire|Cal\s+Fire|CHP|USFS|BLM|AMR|NPS|FAA|LAFD|LAPD|SFPD|SFD|OC\s+Sheriff|OCFA|CAL\s+FIRE)\s*/i, '');

  // Remove everything from the first agency-type keyword onward
  n = n.replace(/\s+(Police|Fire\b|Sheriff|EMS|Medical|Ambulance|Paramedic|County\b|Department|Dept\.?|Dispatch|Primary|Regional|Metro\b|District|Municipal|City\s+of|Interop|Station\b|Division|Township|Command|National|Federal|State\b|Public\s+Safety|Search|Rescue|Air\b|Tac\b|OES\b|Radio|Repeater|Node|Allstar|Airport|TRACON|Approach|Center\b|Tower\b|Unicom)\b.*/i, '');

  // Strip trailing numbers, slashes, abbreviations
  n = n.replace(/[\s/]+\d.*$/, '').replace(/[\s/]+[A-Z]{1,4}$/, '').trim();

  if (!n || n.length < 3) return null;

  const words = n.split(/\s+/);
  // City names are 1–4 words; reject anything longer
  if (words.length > 4) return null;

  // Reject if it still looks like an acronym or contains non-place characters
  if (/^\d/.test(n) || /[0-9.]/.test(n)) return null;
  if (/^(Cal|CHP|USFS|AMR|LAC|OC|NPS|FAA|CERT|ARES|RACES|Allstar|MHz|KHz)\b/i.test(n)) return null;

  return n;
}

// ── Nominatim geocoder ───────────────────────────────────────────────────────
// CA bounding box — reject results outside of it
const CA_BOUNDS = { minLat: 32.4, maxLat: 42.1, minLon: -124.6, maxLon: -114.1 };

/** Cache: cityQuery → [lat, lon] | null */
const geocodeCache = new Map();

async function geocodeCity(cityName) {
  const key = cityName.toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  await sleep(1100); // Nominatim enforces 1 req/s; give a small buffer
  try {
    const url = `${NOMINATIM}?q=${encodeURIComponent(cityName + ', California')}&format=json&limit=1&countrycodes=us`;
    const res = await fetch(url, { headers: NOM_HEADERS });
    if (!res.ok) { geocodeCache.set(key, null); return null; }
    const data = await res.json();
    if (!data.length) { geocodeCache.set(key, null); return null; }
    const lat = parseFloat(data[0].lat);
    const lon = parseFloat(data[0].lon);
    if (lat < CA_BOUNDS.minLat || lat > CA_BOUNDS.maxLat ||
        lon < CA_BOUNDS.minLon || lon > CA_BOUNDS.maxLon) {
      geocodeCache.set(key, null); return null;
    }
    const coords = [lat, lon];
    geocodeCache.set(key, coords);
    return coords;
  } catch {
    geocodeCache.set(key, null);
    return null;
  }
}

// ── Broadcastify scraping ─────────────────────────────────────────────────────
function parseCountyIds(html) {
  const ids = [], seen = new Set();
  for (const m of html.matchAll(/href=['"]\/listen\/ctid\/(\d+)['"]/g)) {
    if (!seen.has(m[1])) { seen.add(m[1]); ids.push(m[1]); }
  }
  return ids;
}

function parseCountyPage(html) {
  const titleMatch = html.match(/<title>\s*([^,<]+?)(?:\s+County)?,?\s*(?:California|CA)[^<]*<\/title>/i);
  let countyName = (titleMatch?.[1] ?? '').trim().replace(/\s+(County|Feeds?|Audio|Live)\s*$/i, '').trim();

  const sortableMatch = html.match(/<table[^>]+listen-sortable[^>]*>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
  const tbodyMatch    = sortableMatch ?? html.match(/<table[^>]+listen-feed-table[^>]*>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return { countyName, feeds: [] };

  const feeds = [];
  for (const rowMatch of tbodyMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const row = rowMatch[1];
    const link = row.match(/href=['"]\/listen\/feed\/(\d+)['"][^>]*>([^<]+)</);
    if (!link) continue;
    const genre    = (row.match(/listen-genre-badge[^>]*>([^<]+)/) ?? [])[1]?.trim() ?? '';
    const listenRe = row.match(/data-sort-value=['"](\d+)['"]/);
    feeds.push({ id: link[1], name: link[2].trim(), genre, listeners: listenRe ? +listenRe[1] : 0 });
  }
  return { countyName, feeds };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Fetching California state page (stid=${CA_STID})...`);
  const stateHtml = await getBF(`${BASE}/listen/stid/${CA_STID}`);
  const countyIds = parseCountyIds(stateHtml);
  console.log(`Found ${countyIds.length} county IDs\n`);

  // ── Phase 1: scrape all county feed tables ────────────────────────────────
  const allFeedsMap = new Map(); // feedId → raw feed object

  for (let i = 0; i < countyIds.length; i++) {
    await sleep(350 + Math.random() * 250);
    try {
      const html      = await getBF(`${BASE}/listen/ctid/${countyIds[i]}`);
      const { countyName, feeds } = parseCountyPage(html);
      const centroid  = COUNTY_CENTROIDS[countyName] ?? [36.7783, -119.4179];
      for (const f of feeds) {
        if (allFeedsMap.has(f.id)) continue;
        allFeedsMap.set(f.id, { ...f, countyName, centroid });
      }
      process.stdout.write(`  [${String(i+1).padStart(2)}/${countyIds.length}] ${countyName.padEnd(22)} feeds=${feeds.length}\n`);
    } catch (err) {
      process.stdout.write(`  [${i+1}/${countyIds.length}] ctid=${countyIds[i]} ERROR: ${err.message}\n`);
    }
  }

  // ── Phase 2: geocode unique city candidates via Nominatim ─────────────────
  console.log('\nGeocoding feed locations via Nominatim (1 req/s)...');
  let geocoded = 0, fallback = 0;

  // Collect unique city candidates first to minimise requests
  const cityToFeeds = new Map(); // cityCandidate → [feedId, ...]
  for (const [id, f] of allFeedsMap) {
    const city = extractCityName(f.name);
    if (!city) continue;
    const list = cityToFeeds.get(city) ?? [];
    list.push(id);
    cityToFeeds.set(city, list);
  }
  console.log(`  ${cityToFeeds.size} unique city candidates to geocode`);

  for (const [city, ids] of cityToFeeds) {
    const coords = await geocodeCity(city);
    if (coords) {
      for (const id of ids) {
        const f = allFeedsMap.get(id);
        f._coords = coords;
      }
      process.stdout.write(`  ✓ ${city.padEnd(30)} → ${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}\n`);
      geocoded += ids.length;
    }
    // If null, feeds keep their centroid (logged at end)
  }

  // ── Phase 3: assemble final output ───────────────────────────────────────
  const result = [];
  for (const f of allFeedsMap.values()) {
    const [baseLat, baseLon] = f._coords ?? f.centroid;
    // Tiny jitter (~30 m) so stacked markers are still clickable
    const lat = baseLat + (Math.random() - 0.5) * 0.0005;
    const lon = baseLon + (Math.random() - 0.5) * 0.0005;
    if (f._coords) geocoded; else fallback++;
    result.push({
      id:        f.id,
      name:      f.name,
      county:    f.countyName || undefined,
      latitude:  parseFloat(lat.toFixed(6)),
      longitude: parseFloat(lon.toFixed(6)),
      category:  categorize(f.name, f.genre),
      webUrl:    `${BASE}/listen/feed/${f.id}`,
      listeners: f.listeners || undefined,
    });
  }

  result.sort((a, b) => (a.county ?? '').localeCompare(b.county ?? '') || a.name.localeCompare(b.name));

  writeFileSync(OUT_FILE, JSON.stringify(result, null, 2), 'utf8');

  const cats = {};
  for (const f of result) cats[f.category] = (cats[f.category] ?? 0) + 1;
  console.log(`\nWrote ${result.length} feeds → ${OUT_FILE}`);
  console.log(`Geocoded: ${geocoded}  County-centroid fallback: ${allFeedsMap.size - geocoded}`);
  console.log('By category:', Object.entries(cats).map(([k,v]) => `${k}=${v}`).join('  '));
}

main().catch(err => { console.error(err); process.exit(1); });
