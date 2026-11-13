import type { OkLab } from "./oklab";

export type Category = "Rifle" | "Pistol" | "Smg" | "Heavy" | "Knife" | "Gloves" | "Equipment" | "Agent" | "Other";

/** Rarity rank: Consumer 1 ... Contraband 8 (0 = unknown). */
export const RARITY_RANK: Record<string, number> = {
  "Consumer Grade": 1, "Industrial Grade": 2, "Mil-Spec Grade": 3, "Mil-Spec": 3, Restricted: 4,
  Classified: 5, Covert: 6, Extraordinary: 7, Contraband: 8,
};

/** Exterior rank: lower = better. */
export const EXTERIOR_RANK: Record<string, number> = {
  "Factory New": 1, "Minimal Wear": 2, "Field-Tested": 3, "Well-Worn": 4, "Battle-Scarred": 5,
};

export const CATEGORY_BY_NAME: Record<string, Category> = {
  Rifles: "Rifle", Pistols: "Pistol", SMGs: "Smg", Heavy: "Heavy", Knives: "Knife", Gloves: "Gloves",
  Equipment: "Equipment", Agents: "Agent",
};

export interface PaletteColor {
  lab: OkLab;
  weight: number;
  hex: string;
}

export interface ColorProfile {
  colors: PaletteColor[];
  isMultiColor: boolean;
}

export interface Candidate {
  itemId: string;
  skinId: string;
  name: string;
  weapon: string;
  category: Category;
  /** Rarity rank (0-8). */
  rarity: number;
  /** Exterior rank 1-5, or null (vanilla). */
  exterior: number | null;
  statTrak: boolean;
  souvenir: boolean;
  priceCents: number;
  colors: ColorProfile | null;
  salesVolume?: number | null;
  /**
   * Optional 0..1 desirability: how the item's market price ranks among items of the same weapon,
   * rarity and exterior (the community pays more for skins it likes). Absent = neutral, and the
   * quality formula stays identical to the Windows reference (golden fixtures have no appeal).
   */
  appeal?: number | null;
  floatMin?: number | null;
  floatMax?: number | null;
  owned?: boolean;
}

export interface SlotDefinition {
  id: string;
  weapons: string[];
  categories: Category[];
  typicalWeight: number;
}

export interface SlotRequest {
  slot: SlotDefinition;
  priority?: number;
  lockedItemId?: string | null;
}

export type OwnedItemsPolicy = "Ignore" | "ZeroCost" | "MarketPrice";

export interface KitRequest {
  targetColor: OkLab | null;
  colorTolerance: number;
  budgetCents: number;
  budgetTolerance: number;
  slots: SlotRequest[];
  allowStatTrak?: boolean;
  allowSouvenir?: boolean;
  /** Worst acceptable exterior rank. */
  worstExterior?: number | null;
  minFloat?: number | null;
  maxFloat?: number | null;
  ownedItems?: OwnedItemsPolicy;
  seed?: number;
  maxAlternativeKits?: number;
  alternativesPerSide?: number;
}

export interface KitPick {
  slotId: string;
  candidate: Candidate;
  effectivePriceCents: number;
  colorScore: number;
  qualityScore: number;
  slotScore: number;
}

export interface KitProposal {
  picks: KitPick[];
  totalCents: number;
  budgetCents: number;
  withinBudgetBand: boolean;
  score: number;
  colorHarmony: number;
}

export interface AlternativeOption {
  candidate: Candidate;
  effectivePriceCents: number;
  deltaCents: number;
  colorScore: number;
  keepsKitWithinBand: boolean;
}

export interface SlotAlternatives {
  slotId: string;
  cheaper: AlternativeOption[];
  pricier: AlternativeOption[];
}

export type InfeasibilityReason =
  | "NoCandidatesForSlot" | "LockedItemUnavailable" | "BudgetTooLow" | "BudgetTooHigh" | "NoSlots";

export type Suggestion =
  | "IncreaseBudget" | "DecreaseBudget" | "DisableSlot" | "RelaxColor"
  | "AllowStatTrakOrSouvenir" | "RelaxExteriorOrFloat" | "AddSlots";

export interface Infeasibility {
  reason: InfeasibilityReason;
  slotId: string | null;
  cheapestCents: number | null;
  cheapestIgnoringColorCents: number | null;
  boundCents: number | null;
  suggestions: Suggestion[];
  minimumTotalCents: number | null;
  cheapestBySlot: Record<string, number> | null;
}

export interface KitResult {
  feasible: boolean;
  best: KitProposal | null;
  alternativeKits: KitProposal[];
  alternativesBySlot: Record<string, SlotAlternatives>;
  problem: Infeasibility | null;
  bandMinCents: number;
  bandMaxCents: number;
}

const slot = (id: string, typicalWeight: number, weapons: string[], categories: Category[] = []): SlotDefinition =>
  ({ id, weapons, categories, typicalWeight });

export const MAIN_ITEMS: SlotDefinition[] = [
  slot("knife", 40, [], ["Knife"]),
  slot("gloves", 30, [], ["Gloves"]),
  slot("ak47", 8, ["AK-47"]),
  slot("m4", 7, ["M4A4", "M4A1-S"]),
  slot("awp", 8, ["AWP"]),
  slot("deagle", 3.5, ["Desert Eagle"]),
  slot("pistol", 3.5, ["USP-S", "Glock-18"]),
];

/** Single-weapon slots, so the user can pick a specific M4 or pistol (or both, as two slots). */
export const EXTRA_SLOTS: Record<string, SlotDefinition> = {
  m4a4: slot("m4a4", 7, ["M4A4"]),
  m4a1s: slot("m4a1s", 7, ["M4A1-S"]),
  usp: slot("usp", 3.5, ["USP-S"]),
  glock: slot("glock", 3.5, ["Glock-18"]),
};
