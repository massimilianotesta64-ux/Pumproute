// PumpRoute: live UK fuel prices from the government Fuel Finder API.
// Runs in GitHub Actions every 15 minutes. Credentials come from repository secrets
// (FF_CLIENT_ID, FF_CLIENT_SECRET) and never reach the app or the public site.
// Output (inside the site folder given as argv[2], default "dist"):
//   data/meta.json        { fetchedAt, tile:{lat,lng}, tiles:[keys], stations }
//   data/t/<key>.json     stations in one grid cell (~17 x 17 miles)
// If the API fails, the previously published data is copied from the live site so prices never disappear.

import { mkdir, writeFile } from "node:fs/promises";

const OUT = (process.argv[2] || "dist") + "/data";
const BASE = process.env.FF_BASE_URL || "https://www.fuel-finder.service.gov.uk";
// Optional London relay (Vercel). Fuel Finder blocks non-UK servers such as GitHub's.
const PROXY_URL = (process.env.PROXY_URL || "").trim(), PROXY_KEY = (process.env.PROXY_KEY || "").trim();
function ff(path, query, init = {}) {
  init.headers = Object.assign({ "user-agent": UA, accept: "application/json" }, init.headers || {});
  if (PROXY_URL) {
    const u = new URL(PROXY_URL); u.searchParams.set("path", path);
    for (const [k, v] of Object.entries(query || {})) u.searchParams.set(k, v);
    init.headers["x-proxy-key"] = PROXY_KEY;
    return fetch(u, init);
  }
  const qs = new URLSearchParams(query || {}).toString();
  return fetch(BASE + path + (qs ? "?" + qs : ""), init);
}
const UA = "PumpRoute/1.0 (+https://github.com/" + (process.env.GITHUB_REPOSITORY || "pumproute") + ")";
const TILE = { lat: 0.25, lng: 0.4 };
const MAX_AGE_DAYS = 30;
// Fuel Finder fuel codes -> PumpRoute codes
const FUEL_MAP = { E10: "E10", E5: "E5", B7: "B7", B7_STANDARD: "B7", SDV: "SDV", B7_PREMIUM: "SDV" };

async function token() {
  const { FF_CLIENT_ID: id, FF_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) throw new Error("Secrets FF_CLIENT_ID / FF_CLIENT_SECRET are not set in the repository");
  if (PROXY_URL) console.log("Using London relay " + new URL(PROXY_URL).host);
  const body = JSON.stringify({ client_id: id.trim(), client_secret: secret.trim() });
  const r = await ff("/api/v1/oauth/generate_access_token", null, { method: "POST", headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) }, body });
  if (PROXY_URL) console.log("Relay region: " + (r.headers.get("x-relay-region") || "?"));
  if (r.status === 401 && PROXY_URL && /x-proxy-key/.test(await r.clone().text())) throw new Error("Relay refused: PROXY_KEY in GitHub does not match PROXY_KEY in Vercel");
  if (r.status === 403) throw new Error("403 from Fuel Finder: probably blocking non-UK servers" + (PROXY_URL ? " (check the relay runs in London: lhr1)" : ". Set up the London relay"));
  if (r.status === 429) throw new Error("429: too many attempts (wrong credentials lock you out for 5 minutes)");
  if (!r.ok) throw new Error(`Token request failed ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const b = await r.json(); const t = (b.data || b).access_token;
  if (!t) throw new Error("No access_token in response");
  return t;
}

async function batched(tok, path) {
  const out = [];
  for (let n = 1; n <= 100; n++) {
    let r;
    for (let attempt = 1; attempt <= 3; attempt++) {
      r = await ff(path, { "batch-number": String(n) }, { headers: { authorization: `Bearer ${tok}` } });
      if (r.status !== 429 && r.status < 500) break;
      await new Promise(res => setTimeout(res, 2000 * attempt));
    }
    if (r.status === 404 && n > 1) break;
    if (!r.ok) throw new Error(`${path} batch ${n} failed ${r.status}`);
    const page = await r.json();
    const rows = Array.isArray(page) ? page : (page.data || []);
    if (!rows.length) break;
    out.push(...rows);
    if (rows.length < 500) break;
  }
  return out;
}

function build(stationsRaw, pricesRaw) {
  const byId = new Map();
  for (const s of stationsRaw) {
    if (s.permanent_closure || s.temporary_closure) continue;
    const loc = s.location || {}; const lat = +loc.latitude, lng = +loc.longitude;
    if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0) || lat < 49 || lat > 61.5 || lng < -9 || lng > 2.5) continue;
    byId.set(s.node_id, {
      id: s.node_id, name: (s.trading_name || "").trim(), brand: (s.brand_name || "").trim(),
      addr: [loc.address_line_1, loc.city].filter(Boolean).join(", "), pc: loc.postcode || "",
      lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5,
      mway: !!s.is_motorway_service_station, smkt: !!s.is_supermarket_service_station, p: {},
    });
  }
  const oldest = Date.now() - MAX_AGE_DAYS * 864e5;
  for (const row of pricesRaw) {
    const st = byId.get(row.node_id); if (!st) continue;
    for (const fp of row.fuel_prices || []) {
      const code = FUEL_MAP[fp.fuel_type]; let price = +fp.price; if (price > 0.5 && price < 5) price *= 100; // reported in pounds
      if (!code || !isFinite(price) || price < 50 || price > 400) continue;
      const ts = Date.parse(fp.price_last_updated); if (!(ts >= oldest)) continue;
      if (!st.p[code] || ts > Date.parse(st.p[code][1])) st.p[code] = [Math.round(price * 10) / 10, fp.price_last_updated];
    }
  }
  // drop prices far from the national median (typos, wrong fuel code)
  const all = {};
  for (const s of byId.values()) for (const [f, [p]] of Object.entries(s.p)) (all[f] ??= []).push(p);
  for (const [f, list] of Object.entries(all)) {
    if (list.length < 20) continue; list.sort((a, b) => a - b); const med = list[list.length >> 1];
    for (const s of byId.values()) if (s.p[f] && (s.p[f][0] < med * 0.8 || s.p[f][0] > med * 1.4)) delete s.p[f];
  }
  return [...byId.values()].filter(s => Object.keys(s.p).length);
}

async function write(stations) {
  const tiles = new Map();
  for (const s of stations) { const k = `${Math.floor(s.lat / TILE.lat)}_${Math.floor(s.lng / TILE.lng)}`; if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(s); }
  await mkdir(`${OUT}/t`, { recursive: true });
  await Promise.all([...tiles].map(([k, l]) => writeFile(`${OUT}/t/${k}.json`, JSON.stringify(l))));
  await writeFile(`${OUT}/meta.json`, JSON.stringify({ fetchedAt: new Date().toISOString(), tile: TILE, tiles: [...tiles.keys()].sort(), stations: stations.length }));
  console.log(`Wrote ${stations.length} stations in ${tiles.size} tiles`);
}

async function reusePublished() {
  const site = process.env.SITE_URL; if (!site) throw new Error("SITE_URL not set");
  const meta = await (await fetch(site + "data/meta.json", { headers: { "user-agent": UA } })).json();
  if (!meta.stations) throw new Error("no previous data");
  await mkdir(`${OUT}/t`, { recursive: true });
  for (const k of meta.tiles) { const r = await fetch(`${site}data/t/${k}.json`); if (r.ok) await writeFile(`${OUT}/t/${k}.json`, await r.text()); }
  await writeFile(`${OUT}/meta.json`, JSON.stringify(meta));
  console.log(`Kept previously published prices from ${meta.fetchedAt}`);
}

try {
  const tok = await token();
  const stationsRaw = await batched(tok, "/api/v1/pfs");
  const pricesRaw = await batched(tok, "/api/v1/pfs/fuel-prices");
  console.log(`Fetched ${stationsRaw.length} stations, ${pricesRaw.length} price rows`);
  const st = build(stationsRaw, pricesRaw);
  if (!st.length) throw new Error("No stations with prices");
  await write(st);
} catch (e) {
  console.log("::warning::Live prices not refreshed: " + e.message);
  try { await reusePublished(); }
  catch (e2) {
    console.log("No previous data to keep: " + e2.message);
    if (process.env.GITHUB_EVENT_NAME === "schedule") process.exit(1); // keep the current site as it is
    await mkdir(OUT, { recursive: true });
    await writeFile(`${OUT}/meta.json`, JSON.stringify({ fetchedAt: null, stations: 0, error: e.message }));
  }
}
