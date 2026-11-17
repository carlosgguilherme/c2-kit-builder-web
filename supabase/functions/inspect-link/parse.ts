// Pure parser for Steam Community Market listings (new market UI, late 2026).
// The market page groups every wear of a skin and shows the cheapest listings of any wear, so the
// function asks the page's own query action instead:
//   GET /market/actions?q=QueryListingsForItem&qp=[{appid, strItemName, disableGrouping: true, ...}]
//   header x-valve-request-type: queryAction  ->  { data: { listings: [...], total_count, more } }
// Each listing carries Valve's own renders of that exact item ("enhanced_appearances") and asset
// properties: 1 = pattern template, 2 = wear (float), 6 = item certificate, which fills the
// "Inspect in Game" link template "...%propid:6%" found in the listing description's actions.

export interface ListingView {
  /** steam://run/730//+csgo_econ_action_preview%20<certificate>, or null when not found. */
  link: string | null;
  /** Valve-hosted renders of the listed item (AVIF, 1920x1080), in the order Steam gives them. */
  views: string[];
  float: number | null;
  pattern: number | null;
  /** Listings of this exact item on the first page. */
  listings: number;
}

const VIEW_PREFIX = "https://shared.akamai.steamstatic.com/market_listings/";
const MAX_DEPTH = 60;

type Obj = Record<string, unknown>;

/** Visits every object, also descending into strings that hold JSON. */
function walk(v: unknown, visit: (o: Obj) => void, depth = 0): void {
  if (depth > MAX_DEPTH) return;
  if (typeof v === "string") {
    const c = v.trimStart()[0];
    if (v.length > 50 && (c === "{" || c === "[")) {
      try {
        walk(JSON.parse(v), visit, depth + 1);
      } catch {
        // not JSON
      }
    }
    return;
  }
  if (v === null || typeof v !== "object") return;
  if (Array.isArray(v)) {
    for (const x of v) walk(x, visit, depth + 1);
    return;
  }
  visit(v as Obj);
  for (const x of Object.values(v as Obj)) walk(x, visit, depth + 1);
}

function findTemplate(o: Obj): string | null {
  for (const key of ["actions", "market_actions"]) {
    const acts = o[key];
    if (!Array.isArray(acts)) continue;
    for (const a of acts) {
      const link = (a as Obj | null)?.link;
      if (typeof link === "string" && link.startsWith("steam://") && link.includes("csgo_econ_action_preview")) return link;
    }
  }
  return null;
}

function property(asset: Obj | undefined, id: number): Obj | undefined {
  const props = asset?.asset_properties;
  if (!Array.isArray(props)) return undefined;
  return props.find((p) => (p as Obj | null)?.propertyid === id) as Obj | undefined;
}

/** Query string of the listings request for one exact item (one wear, StatTrak or not). */
export function listingsQuery(marketHashName: string): string {
  const qp = [{ appid: 730, strItemName: marketHashName, filters: {}, accessoryFilters: {}, propertyFilters: {}, disableGrouping: true, start: 0 }];
  return `q=QueryListingsForItem&qp=${encodeURIComponent(JSON.stringify(qp))}`;
}

/** Reads the query action response; only listings of exactly marketHashName are considered. */
export function parseListings(response: unknown, marketHashName: string): ListingView {
  if (response === null || typeof response !== "object" || !("data" in response)) throw new Error("unexpected response");

  let template: string | null = null;
  const listings: Obj[] = [];
  const seen = new Set<string>();
  walk((response as Obj).data, (o) => {
    if (typeof o.listingid !== "string" || !o.asset || typeof o.asset !== "object" || seen.has(o.listingid)) return;
    const desc = (o.description ?? {}) as Obj;
    if (typeof desc.market_hash_name === "string" && desc.market_hash_name !== marketHashName) return;
    seen.add(o.listingid);
    listings.push(o);
    template ??= findTemplate(desc);
  });
  if (listings.length === 0) return { link: null, views: [], float: null, pattern: null, listings: 0 };

  // Listings come cheapest first; prefer the cheapest one that has renders.
  const viewsOf = (l: Obj) =>
    (Array.isArray(l.enhanced_appearances) ? l.enhanced_appearances : [])
      .map((e) => (e as Obj | null)?.url)
      .filter((u): u is string => typeof u === "string" && u.startsWith(VIEW_PREFIX));
  const chosen = listings.find((l) => viewsOf(l).length > 0) ?? listings[0];
  const asset = chosen.asset as Obj;

  const cert = property(asset, 6)?.string_value;
  const t = template as string | null;
  let link: string | null = null;
  if (t && typeof cert === "string" && /^[0-9A-Fa-f]+$/.test(cert)) link = t.replace(/%propid:6%/g, cert);
  if (link && /%[a-z_]+(:\d+)?%/i.test(link)) link = null;

  const f = property(asset, 2)?.float_value;
  const p = Number(property(asset, 1)?.int_value);
  return {
    link,
    views: viewsOf(chosen),
    float: typeof f === "number" && f >= 0 && f <= 1 ? f : null,
    pattern: Number.isInteger(p) && p >= 0 ? p : null,
    listings: listings.length,
  };
}
