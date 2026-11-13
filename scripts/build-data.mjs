// Builds public/data/catalog.json: a compact catalog (ByMykel/CSGO-API, MIT) joined with the
// color index published weekly by carlosgguilherme/cs2-kit-builder (data-* releases).
// Runs before every site build, so each deploy ships the current catalog and colors.
import { mkdir, writeFile } from "node:fs/promises";

const CATALOG_URL = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins_not_grouped.json";
const RELEASES_URL = "https://api.github.com/repos/carlosgguilherme/cs2-kit-builder/releases?per_page=30";
const IMAGE_PREFIX = "https://community.akamai.steamstatic.com/economy/image/";
// Used only when the GitHub API cannot be reached (rate limit, outage); updated when a release is checked.
const FALLBACK_COLOR_INDEX = {
  tag: "data-20261109",
  url: "https://github.com/carlosgguilherme/cs2-kit-builder/releases/download/data-20261109/color-index.json",
};

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { "User-Agent": "cs2-kit-builder-web build", Accept: "application/json", ...headers } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

/** GitHub API call, authenticated when a token is available (CI), retried once. */
async function githubJson(url) {
  const token = process.env.GITHUB_TOKEN;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  try {
    return await getJson(url, headers);
  } catch (first) {
    await new Promise((r) => setTimeout(r, 3000));
    return getJson(url, headers).catch(() => { throw first; });
  }
}

/** Newest non-draft data-* release that has color-index.json (COLOR_INDEX_URL overrides the lookup). */
async function colorIndexUrl() {
  if (process.env.COLOR_INDEX_URL) {
    return { tag: process.env.COLOR_INDEX_URL.match(/data-\d+/)?.[0] ?? "custom", url: process.env.COLOR_INDEX_URL };
  }
  let releases;
  try {
    releases = await githubJson(RELEASES_URL);
  } catch (e) {
    console.warn(`warning: ${e.message}; using the last known color index ${FALLBACK_COLOR_INDEX.tag}`);
    return FALLBACK_COLOR_INDEX;
  }
  let best = null;
  for (const r of releases) {
    if (r.draft || !r.tag_name.startsWith("data-")) continue;
    const asset = r.assets.find((a) => a.name === "color-index.json");
    if (asset && (!best || r.tag_name > best.tag)) best = { tag: r.tag_name, url: asset.browser_download_url };
  }
  if (!best) throw new Error("No data release with color-index.json found");
  return best;
}

const release = await colorIndexUrl();
const [items, index] = await Promise.all([getJson(CATALOG_URL), getJson(release.url)]);

const colors = {};
for (const s of index.skins) {
  colors[s.skinId] = [s.isMultiColor ? 1 : 0, s.colors.map((c) => [c.hex, c.weight, c.l, c.a, c.b])];
}

// Row: [itemId, skinId, marketHashName, name, weapon, category, rarity, rarityColor, exterior, statTrak, souvenir, phase, image]
const rows = items.map((i) => [
  i.id, i.skin_id, i.market_hash_name ?? i.name, i.name, i.weapon?.name ?? "", i.category?.name ?? "",
  i.rarity?.name ?? "", i.rarity?.color ?? "#b0c3d9", i.wear?.name ?? null, i.stattrak ? 1 : 0, i.souvenir ? 1 : 0,
  i.phase ?? null, (i.image ?? "").startsWith(IMAGE_PREFIX) ? i.image.slice(IMAGE_PREFIX.length) : i.image ?? null,
]);

await mkdir("public/data", { recursive: true });
const doc = { generatedAt: new Date().toISOString(), colorRelease: release.tag, imagePrefix: IMAGE_PREFIX, items: rows, colors };
await writeFile("public/data/catalog.json", JSON.stringify(doc));
console.log(`catalog: ${rows.length} items, ${Object.keys(colors).length} color profiles (${release.tag})`);
