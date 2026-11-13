import { describe, expect, it } from "vitest";
import { buildCandidates, toBrlCents, type CatalogDoc, type PriceSnapshot } from "./data";
import { delta, money, problemText } from "./texts";

const catalog: CatalogDoc = {
  generatedAt: "2026-11-12T00:00:00Z", colorRelease: "data-20261109", imagePrefix: "https://img/",
  items: [
    ["a_0", "skin-a", "AK-47 | Redline (Field-Tested)", "AK-47 | Redline (Field-Tested)", "AK-47", "Rifles", "Classified", "#d32ce6", "Field-Tested", 0, 0, null, "hashA"],
    ["k_1", "skin-p1", "★ Karambit | Doppler (Factory New)", "★ Karambit | Doppler (Factory New)", "Karambit", "Knives", "Covert", "#eb4b4b", "Factory New", 0, 0, "Phase 1", "hashP1"],
    ["k_2", "skin-ruby", "★ Karambit | Doppler (Factory New)", "★ Karambit | Doppler (Factory New)", "Karambit", "Knives", "Covert", "#eb4b4b", "Factory New", 0, 0, "Ruby", "hashRuby"],
    ["n_0", "skin-n", "P250 | No Price (Factory New)", "P250 | No Price (Factory New)", "P250", "Pistols", "Restricted", "#8847ff", "Factory New", 0, 0, null, null],
  ],
  colors: { "skin-a": [0, [["#22201e", 0.75, 0.24, 0.002, 0.005], ["#65241e", 0.25, 0.33, 0.09, 0.05]]] },
};
const snapshot: PriceSnapshot = {
  fxUsdBrl: 5.5, cycleCompletedAt: null, updatedAt: "2026-11-12T12:00:00Z", count: 2,
  prices: { "AK-47 | Redline (Field-Tested)": [3185, 1, 1210], "★ Karambit | Doppler (Factory New)": [171186, 1, 2] },
};

describe("data", () => {
  it("joins catalog, colors and prices, converting USD and skipping gem phases", () => {
    const data = buildCandidates(catalog, snapshot);
    expect(data.candidates.map((c) => c.itemId)).toEqual(["a_0", "k_1"]);
    const ak = data.candidates[0];
    expect(ak.priceCents).toBe(Math.round(3185 * 5.5));
    expect(ak.category).toBe("Rifle");
    expect(ak.rarity).toBe(5);
    expect(ak.exterior).toBe(3);
    expect(ak.colors?.colors).toHaveLength(2);
    expect(data.candidates[1].colors).toBeNull();
    expect(data.info.get("a_0")).toMatchObject({ rarityColor: "#d32ce6", imageUrl: "https://img/hashA/256fx256f" });
    expect(data.crawlComplete).toBe(false);
  });

  it("converts currencies and formats BRL", () => {
    expect(toBrlCents(1000, 7, null)).toBe(1000);
    expect(toBrlCents(1000, 1, null)).toBeNull();
    expect(money(123456)).toBe("R$ 1.234,56");
    expect(delta(-500)).toBe("−R$ 5,00");
    expect(problemText({
      reason: "BudgetTooLow", slotId: "knife", cheapestCents: 35000, cheapestIgnoringColorCents: null, boundCents: 5500,
      suggestions: ["IncreaseBudget", "DisableSlot"], minimumTotalCents: 66750, cheapestBySlot: null,
    })).toBe("O orçamento não cobre Faca: a opção mais barata no tom escolhido custa R$ 350,00. "
      + "O kit mais barato possível custa R$ 667,50. Tente: aumentar o orçamento, desligar esse item.");
  });
});

describe("appeal (market desirability)", () => {
  it("ranks skins of the same weapon and exterior by price and falls back to the category", async () => {
    const { assignAppeal } = await import("./data");
    const mk = (itemId: string, weapon: string, priceCents: number, exterior = 3): import("./engine/types").Candidate => ({
      itemId, skinId: itemId, name: itemId, weapon, category: "Rifle", rarity: 4, exterior, statTrak: false, souvenir: false, priceCents, colors: null,
    });
    const list = [mk("a", "AK-47", 100), mk("b", "AK-47", 200), mk("c", "AK-47", 300), mk("d", "AK-47", 400), mk("lonely", "M4A4", 250), mk("e", "AK-47", 50, 1)];
    assignAppeal(list);
    const by = Object.fromEntries(list.map((c) => [c.itemId, c.appeal]));
    expect(by.a).toBe(0);
    expect(by.d).toBe(1);
    expect(by.b).toBeCloseTo(1 / 3);
    // M4A4 has a group of 1: compared with all rifles in the same exterior instead.
    expect(by.lonely).toBeGreaterThan(0.4);
    expect(by.lonely).toBeLessThan(0.8);
  });

  it("makes the engine prefer the more wanted skin at the same price tier", async () => {
    const { buildKit } = await import("./engine/engine");
    const { MAIN_ITEMS } = await import("./engine/types");
    const mk = (itemId: string, priceCents: number, appeal: number): import("./engine/types").Candidate => ({
      itemId, skinId: itemId, name: itemId, weapon: "AK-47", category: "Rifle", rarity: 4, exterior: 3, statTrak: false, souvenir: false, priceCents, colors: null, appeal,
    });
    const ak = MAIN_ITEMS.find((s) => s.id === "ak47")!;
    const r = buildKit({ targetColor: null, colorTolerance: 0.5, budgetCents: 1000, budgetTolerance: 0.1, slots: [{ slot: ak }] }, [mk("plain", 1000, 0.1), mk("loved", 1000, 0.9)]);
    expect(r.best!.picks[0].candidate.itemId).toBe("loved");
  });
});
