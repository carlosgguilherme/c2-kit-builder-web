import { CATALOG_URL, SUPABASE_KEY, SUPABASE_URL } from "./config";
import { CATEGORY_BY_NAME, EXTERIOR_RANK, RARITY_RANK, type Candidate, type ColorProfile } from "./engine/types";

/** Doppler phases that share a market name with the common phases: no reliable Steam price. */
export const GEM_PHASES = new Set(["Ruby", "Sapphire", "Black Pearl", "Emerald"]);

export interface ItemInfo {
  marketHashName: string;
  rarityName: string;
  rarityColor: string;
  exteriorName: string | null;
  imageUrl: string | null;
}

export interface CatalogDoc {
  generatedAt: string;
  colorRelease: string;
  imagePrefix: string;
  /** [itemId, skinId, marketHashName, name, weapon, category, rarity, rarityColor, exterior, statTrak, souvenir, phase, image] */
  items: [string, string, string, string, string, string, string, string, string | null, number, number, string | null, string | null][];
  /** skinId -> [isMultiColor, [[hex, weight, l, a, b], ...]] */
  colors: Record<string, [number, [string, number, number, number, number][]]>;
}

export interface PriceSnapshot {
  fxUsdBrl: number | null;
  cycleCompletedAt: string | null;
  updatedAt: string | null;
  count: number;
  /** name -> [cents, steam currency (1 USD, 7 BRL), listings] */
  prices: Record<string, [number, number, number | null]>;
}

export interface KitData {
  candidates: Candidate[];
  info: Map<string, ItemInfo>;
  pricedItems: number;
  catalogItems: number;
  pricesUpdatedAt: string | null;
  crawlComplete: boolean;
}

export async function fetchCatalog(): Promise<CatalogDoc> {
  const res = await fetch(CATALOG_URL);
  if (!res.ok) throw new Error(`Catálogo indisponível (HTTP ${res.status})`);
  return res.json();
}

export async function fetchPrices(): Promise<PriceSnapshot> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/prices_snapshot`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`Preços indisponíveis (HTTP ${res.status})`);
  return res.json();
}

/** Price in BRL cents, or null when it cannot be converted yet. */
export function toBrlCents(cents: number, currency: number, fxUsdBrl: number | null): number | null {
  if (currency === 7) return cents;
  if (currency === 1 && fxUsdBrl) return Math.round(cents * fxUsdBrl);
  return null;
}

/** Joins catalog, colors and prices into engine candidates (same rules as CandidateFactory in the Windows app). */
export function buildCandidates(catalog: CatalogDoc, snapshot: PriceSnapshot): KitData {
  const profiles = new Map<string, ColorProfile>();
  for (const [skinId, [multi, colors]] of Object.entries(catalog.colors)) {
    profiles.set(skinId, {
      isMultiColor: multi === 1,
      colors: colors.map(([hex, weight, l, a, b]) => ({ hex, weight, lab: { l, a, b } })),
    });
  }
  const candidates: Candidate[] = [];
  const info = new Map<string, ItemInfo>();
  for (const [itemId, skinId, marketHashName, name, weapon, category, rarity, rarityColor, exterior, st, sv, phase, image] of catalog.items) {
    if (phase && GEM_PHASES.has(phase)) continue;
    const price = snapshot.prices[marketHashName];
    if (!price) continue;
    const priceCents = toBrlCents(price[0], price[1], snapshot.fxUsdBrl);
    if (priceCents === null || priceCents <= 0) continue;
    candidates.push({
      itemId, skinId, name, weapon, category: CATEGORY_BY_NAME[category] ?? "Other", rarity: RARITY_RANK[rarity] ?? 0,
      exterior: exterior ? EXTERIOR_RANK[exterior] ?? null : null, statTrak: st === 1, souvenir: sv === 1, priceCents,
      colors: profiles.get(skinId) ?? null, salesVolume: null,
    });
    info.set(itemId, {
      marketHashName, rarityName: rarity, rarityColor, exteriorName: exterior,
      imageUrl: image ? (image.startsWith("http") ? image : catalog.imagePrefix + image) + "/256fx256f" : null,
    });
  }
  assignAppeal(candidates);
  return {
    candidates, info, pricedItems: candidates.length, catalogItems: catalog.items.length,
    pricesUpdatedAt: snapshot.updatedAt, crawlComplete: snapshot.cycleCompletedAt !== null,
  };
}

export const marketUrl = (marketHashName: string) =>
  "https://steamcommunity.com/market/listings/730/" + encodeURIComponent(marketHashName);

/**
 * Desirability from the market: percentile of an item's price among all skins of the same weapon,
 * exterior and StatTrak/Souvenir variant (falls back to the whole category when the group is small).
 * Same gun and condition, higher price = rarer and/or more people want it.
 */
export function assignAppeal(candidates: Candidate[]): void {
  const key = (c: Candidate, broad: boolean) =>
    [broad ? c.category : c.weapon, c.exterior ?? "-", c.statTrak ? "st" : "", c.souvenir ? "sv" : ""].join("|");
  const groups = new Map<string, number[]>();
  for (const c of candidates) {
    for (const broad of [false, true]) {
      const k = key(c, broad);
      const g = groups.get(k);
      if (g) g.push(c.priceCents);
      else groups.set(k, [c.priceCents]);
    }
  }
  for (const g of groups.values()) g.sort((a, b) => a - b);
  for (const c of candidates) {
    let g = groups.get(key(c, false))!;
    if (g.length < 4) g = groups.get(key(c, true))!;
    if (g.length < 2) {
      c.appeal = 0.5;
      continue;
    }
    // Mid-rank percentile, so ties share a value.
    let below = 0, equal = 0;
    for (const p of g) {
      if (p < c.priceCents) below++;
      else if (p === c.priceCents) equal++;
    }
    c.appeal = (below + (equal - 1) / 2) / (g.length - 1);
  }
}
