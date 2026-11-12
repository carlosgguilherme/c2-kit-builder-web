import { describe, expect, it } from "vitest";
import { buildKit } from "./engine/engine";
import { DEFAULT_CHOICES, buildSlots, cleanBudgetInput, parseBudget } from "./kitOptions";
import type { Candidate } from "./engine/types";

describe("weapon choices", () => {
  const ids = (c: Partial<typeof DEFAULT_CHOICES>) => buildSlots({ ...DEFAULT_CHOICES, ...c }).map((s) => s.id);

  it("lets the user pick a specific M4, both, any or none", () => {
    expect(ids({ m4: "any" })).toContain("m4");
    expect(ids({ m4: "m4a4" })).toEqual(expect.arrayContaining(["m4a4"]));
    expect(ids({ m4: "m4a4" })).not.toContain("m4a1s");
    expect(ids({ m4: "m4a1s" })).not.toContain("m4a4");
    expect(ids({ m4: "both" })).toEqual(expect.arrayContaining(["m4a4", "m4a1s"]));
    expect(ids({ m4: "off" }).some((id) => id.startsWith("m4"))).toBe(false);
  });

  it("does the same for the pistol", () => {
    expect(ids({ pistol: "usp" })).toContain("usp");
    expect(ids({ pistol: "glock" })).not.toContain("usp");
    expect(ids({ pistol: "both" })).toEqual(expect.arrayContaining(["usp", "glock"]));
  });

  it("builds a kit with both M4s as two separate pieces", () => {
    const cand = (itemId: string, weapon: string, priceCents: number): Candidate => ({
      itemId, skinId: itemId, name: itemId, weapon, category: "Rifle", rarity: 4, exterior: 3, statTrak: false, souvenir: false,
      priceCents, colors: null,
    });
    const catalog = [cand("a4-1", "M4A4", 1000), cand("a4-2", "M4A4", 1500), cand("a1-1", "M4A1-S", 900), cand("a1-2", "M4A1-S", 1400)];
    const slots = buildSlots({ knife: false, gloves: false, ak47: false, m4: "both", awp: false, deagle: false, pistol: "off" });
    const r = buildKit({ targetColor: null, colorTolerance: 0.5, budgetCents: 2500, budgetTolerance: 0.1, slots: slots.map((slot) => ({ slot })) }, catalog);
    expect(r.feasible).toBe(true);
    expect(r.best!.picks.map((p) => p.candidate.weapon).sort()).toEqual(["M4A1-S", "M4A4"]);
  });
});

describe("budget field", () => {
  it("accepts the formats people type", () => {
    expect(parseBudget("200")).toBe(200);
    expect(parseBudget("1500,50")).toBe(1500.5);
    expect(parseBudget("1.500")).toBe(1500);
    expect(parseBudget("1.500,50")).toBe(1500.5);
    expect(parseBudget("R$ 2.000")).toBe(2000);
    expect(parseBudget("99.9")).toBe(99.9);
  });

  it("allows an empty field while typing", () => {
    expect(parseBudget("")).toBeNull();
    expect(parseBudget("0")).toBeNull();
    expect(parseBudget("1,2,3")).toBeNull();
    expect(cleanBudgetInput("R$ 1a2")).toBe("12");
  });
});
