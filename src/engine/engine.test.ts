import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { colorScore, threshold } from "./color";
import { buildKit, rebalance, replacePick, unitHash } from "./engine";
import { fromHex } from "./oklab";
import { CATEGORY_BY_NAME, EXTERIOR_RANK, MAIN_ITEMS, RARITY_RANK, type Candidate, type KitRequest } from "./types";

const load = (p: string) => JSON.parse(readFileSync(new URL(`../../fixtures/${p}`, import.meta.url), "utf8"));

const catalog: Candidate[] = load("kit-engine/catalog.json").candidates.map((c: any) => ({
  itemId: c.itemId, skinId: c.skinId, name: c.name, weapon: c.weapon, category: CATEGORY_BY_NAME[c.category] ?? "Other",
  rarity: RARITY_RANK[c.rarity] ?? 0, exterior: c.exterior ? EXTERIOR_RANK[c.exterior] : null,
  statTrak: c.statTrak, souvenir: c.souvenir, priceCents: c.priceCents,
  colors: { colors: c.colors.map((x: any) => ({ lab: fromHex(x.hex), weight: x.weight, hex: x.hex })), isMultiColor: c.isMultiColor },
  salesVolume: c.salesVolume, owned: c.owned,
}));
const slotsById = Object.fromEntries(MAIN_ITEMS.map((s) => [s.id, s]));
const cases: any[] = load("kit-engine/cases.json").cases;

const request = (r: any): KitRequest => ({
  targetColor: r.targetHex ? fromHex(r.targetHex) : null,
  colorTolerance: r.colorTolerance ?? 0.5,
  budgetCents: r.budgetCents,
  budgetTolerance: r.budgetTolerance ?? 0.1,
  slots: r.slots.map((s: any) => ({ slot: slotsById[s.slot], priority: s.priority ?? 1.0, lockedItemId: s.locked ?? null })),
  allowStatTrak: r.allowStatTrak ?? false,
  allowSouvenir: r.allowSouvenir ?? false,
  worstExterior: r.worstExterior ? EXTERIOR_RANK[r.worstExterior] : null,
  ownedItems: r.ownedItems ?? "ZeroCost",
  seed: r.seed ?? 0,
});
const byName = (name: string) => request(cases.find((c) => c.name === name).request);

describe("OKLab", () => {
  it("matches the shared reference values", () => {
    const fx = load("oklab.json");
    for (const c of fx.cases) {
      const lab = fromHex(c.hex);
      expect(Math.abs(lab.l - c.l)).toBeLessThan(fx.tolerance);
      expect(Math.abs(lab.a - c.a)).toBeLessThan(fx.tolerance);
      expect(Math.abs(lab.b - c.b)).toBeLessThan(fx.tolerance);
    }
  });
});

describe("kit engine (same golden output as the Windows reference)", () => {
  for (const c of cases) {
    it(c.name, () => {
      const r = buildKit(request(c.request), catalog);
      const actual = {
        feasible: r.feasible,
        reason: r.problem?.reason ?? null,
        problemSlot: r.problem?.slotId ?? null,
        picks: r.best ? Object.fromEntries(r.best.picks.map((p) => [p.slotId, p.candidate.itemId])) : null,
        totalCents: r.best?.totalCents ?? null,
      };
      expect(actual).toEqual(c.expect);
      if (r.best && r.feasible) {
        expect(r.best.totalCents).toBeGreaterThanOrEqual(r.bandMinCents);
        expect(r.best.totalCents).toBeLessThanOrEqual(r.bandMaxCents);
      }
    });
  }

  it("reports the cheapest option per slot when the budget is too low", () => {
    const p = buildKit(byName("impossible-budget"), catalog).problem!;
    expect(p.minimumTotalCents).toBe(66750);
    expect(p.slotId).toBe("knife");
    expect(p.cheapestCents).toBe(35000);
  });

  it("keeps alternatives for locked slots and supports swap and rebalance", () => {
    const req = byName("acceptance-red-200-main-without-knife-gloves");
    const r = buildKit(req, catalog);
    const alts = r.alternativesBySlot["awp"];
    const option = [...alts.cheaper, ...alts.pricier][0];
    const swapped = replacePick(req, r.best!, "awp", option.candidate);
    expect(swapped.totalCents).toBe(r.best!.totalCents + option.deltaCents);
    const rebalanced = rebalance(req, catalog, "awp", option.candidate.itemId);
    expect(rebalanced.best!.picks.find((p) => p.slotId === "awp")!.candidate.itemId).toBe(option.candidate.itemId);
    const lockedAlts = rebalanced.alternativesBySlot["awp"];
    expect([...lockedAlts.cheaper, ...lockedAlts.pricier].length).toBeGreaterThan(0);
  });

  it("is deterministic and seeds are reproducible", () => {
    const req = byName("acceptance-red-200-main-without-knife-gloves");
    const ids = (seed: number) => buildKit({ ...req, seed }, catalog).best!.picks.map((p) => p.candidate.itemId).join("|");
    expect(ids(0)).toBe(ids(0));
    expect(ids(4)).toBe(ids(4));
    expect(unitHash(7, "ak-stripe-ft")).toBeGreaterThanOrEqual(0);
    expect(unitHash(7, "ak-stripe-ft")).toBeLessThan(1);
  });

  it("does not let gray or off-hue palettes match a colored target", () => {
    const blue = fromHex("#1e88e5");
    const profile = (...c: [string, number][]) => ({ colors: c.map(([hex, weight]) => ({ lab: fromHex(hex), weight, hex })), isMultiColor: false });
    expect(colorScore(blue, profile(["#363531", 0.7278], ["#63645d", 0.2722]), 0.5)).toBeLessThan(threshold(0.5));
    expect(colorScore(blue, profile(["#353531", 0.5505], ["#64645d", 0.2032], ["#596441", 0.1251], ["#67945b", 0.1212]), 0.5)).toBeLessThan(threshold(0.5));
    expect(colorScore(blue, profile(["#343433", 0.5483], ["#5f6061", 0.2867], ["#405984", 0.1131], ["#577eb2", 0.0519]), 0.5)).toBeGreaterThanOrEqual(threshold(0.5));
  });
});
