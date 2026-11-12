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
