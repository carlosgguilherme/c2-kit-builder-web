import { EXTRA_SLOTS, MAIN_ITEMS, type SlotDefinition } from "./engine/types";

export type M4Choice = "off" | "any" | "m4a4" | "m4a1s" | "both";
export type PistolChoice = "off" | "any" | "usp" | "glock" | "both";

export interface SlotChoices {
  knife: boolean;
  gloves: boolean;
  ak47: boolean;
  m4: M4Choice;
  awp: boolean;
  deagle: boolean;
  pistol: PistolChoice;
}

export const DEFAULT_CHOICES: SlotChoices = {
  knife: false, gloves: false, ak47: true, m4: "any", awp: true, deagle: true, pistol: "any",
};

const main = (id: string) => MAIN_ITEMS.find((s) => s.id === id)!;

/** Slots for the engine, in a stable order. "both" adds one slot per weapon. */
export function buildSlots(c: SlotChoices): SlotDefinition[] {
  const out: SlotDefinition[] = [];
  if (c.knife) out.push(main("knife"));
  if (c.gloves) out.push(main("gloves"));
  if (c.ak47) out.push(main("ak47"));
  if (c.m4 === "any") out.push(main("m4"));
  if (c.m4 === "m4a4" || c.m4 === "both") out.push(EXTRA_SLOTS.m4a4);
  if (c.m4 === "m4a1s" || c.m4 === "both") out.push(EXTRA_SLOTS.m4a1s);
  if (c.awp) out.push(main("awp"));
  if (c.deagle) out.push(main("deagle"));
  if (c.pistol === "any") out.push(main("pistol"));
  if (c.pistol === "usp" || c.pistol === "both") out.push(EXTRA_SLOTS.usp);
  if (c.pistol === "glock" || c.pistol === "both") out.push(EXTRA_SLOTS.glock);
  return out;
}

/**
 * Parses what the user typed in the budget field: "200", "1500,50", "1.500", "1.500,50", "R$ 2.000".
 * Returns null while the field is empty or not a valid amount.
 */
export function parseBudget(text: string): number | null {
  let t = text.replace(/R\$|\s/gi, "");
  if (t === "") return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Keeps only characters that can be part of an amount. */
export const cleanBudgetInput = (text: string) => text.replace(/[^\d.,]/g, "").slice(0, 12);
