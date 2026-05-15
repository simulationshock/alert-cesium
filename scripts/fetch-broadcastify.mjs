#!/usr/bin/env node
/**
 * Crawls Broadcastify's public California county pages and writes
 * web-demo/data/radio-feeds.json with every available CA public-safety feed.
 *
 * Run:  node scripts/fetch-broadcastify.mjs
 *
 * No API key required. Re-run periodically to refresh the feed list.
 * Broadcastify's HTML is server-side rendered so a plain fetch works.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
// Vite copies web-demo/public/** verbatim to dist-site/ — this is the right place for
// static assets that are fetched at runtime rather than imported as modules.
const OUT_DIR  = join(__dir, '../web-demo/public/data');
const OUT_FILE = join(OUT_DIR, 'radio-feeds.json');

const BASE    = 'https://www.broadcastify.com';
const CA_STID = 6;   // Broadcastify state ID for California
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** California county centroids [lat, lon] keyed by Broadcastify county name. */
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

function categorize(name, genre = '') {
  const n = (name + ' ' + genre).toLowerCase();
  if (/police|sheriff|pd\b|constable|marshal|dispatch law|corrections/.test(n)) return 'law';
  if (/\bems\b|medical|ambulance|paramedic/.test(n)) return 'ems';
  if (/\bfire\b/.test(n)) return 'fire';
  if (/aircraft|aviation|tracon|approach|center\b|tower|unicom|atis|ctaf|fss/.test(n)) return 'aircraft';
  if (/interop|mutual|tac\b|\bops\b|multi/.test(n)) return 'multi';
  return 'other';
}

/** Parse county ID list from the CA state page. */
function parseCountyIds(html) {
  const ids = [];
  const seen = new Set();
  for (const m of html.matchAll(/href=['"]\/listen\/ctid\/(\d+)['"]/g)) {
    if (!seen.has(m[1])) { seen.add(m[1]); ids.push(m[1]); }
  }
  return ids;
}

/** Parse feeds table from a county page. Returns { countyName, feeds[] }. */
function parseCountyPage(html, countyId) {
  // County name from <title> tag: "Alameda County, California Audio Feeds" → "Alameda"
  const titleMatch = html.match(/<title>\s*([^,<]+?)(?:\s+County)?,?\s*(?:California|CA)[^<]*<\/title>/i);
  const h1Match    = html.match(/<h1[^>]*>\s*([^<]+?)\s*(?:County\s*)?(?:[-–]\s*Live\s*Audio\s*)?<\/h1>/i);
  let countyName = (titleMatch?.[1] ?? h1Match?.[1] ?? '').trim();
  // Strip trailing noise
  countyName = countyName.replace(/\s+(County|Feeds?|Audio|Live)\s*$/i, '').trim();

  // Use the listen-sortable table which is the actual feed listing.
  // Large counties have multiple tables (incident audio, radio gateways, feeds);
  // the sortable one is always the main feed table.
  const sortableMatch = html.match(/<table[^>]+listen-sortable[^>]*>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
  const tbodyMatch    = sortableMatch
    ?? html.match(/<table[^>]+listen-feed-table[^>]*>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return { countyName, feeds: [] };
  const tbody = tbodyMatch[1];

  const feeds = [];
  // Each <tr> is one feed; extract anchor href+text and genre badge per row
  for (const rowMatch of tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const row = rowMatch[1];
    const linkMatch = row.match(/href=['"]\/listen\/feed\/(\d+)['"][^>]*>([^<]+)</);
    if (!linkMatch) continue;
    const id   = linkMatch[1];
    const name = linkMatch[2].trim();
    const genreMatch = row.match(/listen-genre-badge[^>]*>([^<]+)</);
    const genre = genreMatch ? genreMatch[1].trim() : '';
    const listMatch = row.match(/data-sort-value=['"](\d+)['"]/);
    const listeners = listMatch ? parseInt(listMatch[1], 10) : 0;
    feeds.push({ id, name, genre, listeners });
  }

  return { countyName, feeds };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Fetching California state page (stid=${CA_STID})...`);
  const stateHtml  = await get(`${BASE}/listen/stid/${CA_STID}`);
  const countyIds  = parseCountyIds(stateHtml);
  console.log(`Found ${countyIds.length} county IDs`);

  const allFeedsMap = new Map(); // keyed by feed ID to deduplicate

  for (let i = 0; i < countyIds.length; i++) {
    const ctid = countyIds[i];
    await sleep(350 + Math.random() * 250);

    let countyName = '(unknown)';
    try {
      const html = await get(`${BASE}/listen/ctid/${ctid}`);
      const parsed = parseCountyPage(html, ctid);
      countyName = parsed.countyName || '(unknown)';

      const centroid = COUNTY_CENTROIDS[countyName] ?? [36.7783, -119.4179];

      for (const f of parsed.feeds) {
        if (allFeedsMap.has(f.id)) continue; // first county wins for dedup
        // Small jitter so markers don't stack exactly
        const lat = centroid[0] + (Math.random() - 0.5) * 0.08;
        const lon = centroid[1] + (Math.random() - 0.5) * 0.08;
        allFeedsMap.set(f.id, {
          id:        f.id,
          name:      f.name,
          county:    countyName !== '(unknown)' ? countyName : undefined,
          latitude:  parseFloat(lat.toFixed(5)),
          longitude: parseFloat(lon.toFixed(5)),
          category:  categorize(f.name, f.genre),
          webUrl:    `${BASE}/listen/feed/${f.id}`,
          listeners: f.listeners || undefined,
        });
      }

      console.log(`  [${String(i+1).padStart(2)}/${countyIds.length}] ${countyName.padEnd(20)} ctid=${ctid}  feeds=${parsed.feeds.length}`);
    } catch (err) {
      console.warn(`  [${i+1}/${countyIds.length}] ctid=${ctid} (${countyName}): ${err.message}`);
    }
  }

  const feeds = [...allFeedsMap.values()];
  feeds.sort((a, b) => (a.county ?? '').localeCompare(b.county ?? '') || a.name.localeCompare(b.name));

  writeFileSync(OUT_FILE, JSON.stringify(feeds, null, 2), 'utf8');
  console.log(`\nWrote ${feeds.length} feeds → ${OUT_FILE}`);

  // Summary by category
  const counts = {};
  for (const f of feeds) counts[f.category] = (counts[f.category] ?? 0) + 1;
  console.log('By category:', Object.entries(counts).map(([k,v]) => `${k}=${v}`).join('  '));
}

main().catch(err => { console.error(err); process.exit(1); });
