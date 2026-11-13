// Kit engine: TypeScript port of KitBuilder.Core/Kits/KitEngine.cs (carlosgguilherme/cs2-kit-builder).
// Spec: docs/kit-engine.md in that repository. It must produce the same picks for
// fixtures/kit-engine/cases.json (golden output of the reference implementation).
import { colorScore, harmony as pairHarmony, signature, threshold } from "./color";
import type {
  AlternativeOption, Candidate, Infeasibility, KitProposal, KitRequest, KitResult, PaletteColor,
  SlotAlternatives, SlotDefinition, SlotRequest, Suggestion,
} from "./types";

export const CANDIDATES_PER_SLOT = 60;
export const MIN_UNDERSPEND = 0.05;
const BEAM_BUCKETS = 48;
const BEAM_PER_BUCKET = 32;
const PRICE_SPREAD_SAMPLES = 12;
const MAX_REFINE_PASSES = 8;
const EPSILON = 1e-12;

interface Scored {
  c: Candidate;
  price: number;
  value: number;
  color: number;
  quality: number;
  slotScore: number;
  signature: PaletteColor | null;
}

const ordinal = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const accepts = (slot: SlotDefinition, c: Candidate) => slot.weapons.includes(c.weapon) || slot.categories.includes(c.category);
const harmony = (a: Scored, b: Scored) => pairHarmony(a.signature, b.signature);

export function band(r: KitRequest): { min: number; max: number } {
  const t = clamp(r.budgetTolerance, 0, 0.3);
  const hi = Math.floor(r.budgetCents * (1 + t));
  const lo = Math.ceil(r.budgetCents * (1 - Math.max(t, MIN_UNDERSPEND)));
  return { min: Math.max(0, lo), max: hi };
}

export function quality(c: Candidate): number {
  const rarity = c.rarity === 0 ? 0 : Math.min(1.0, (c.rarity - 1) / 7.0);
  const exterior = c.exterior === 1 ? 1.0 : c.exterior === 2 ? 0.8 : c.exterior === 3 ? 0.6 : c.exterior === 4 ? 0.4
    : c.exterior === 5 ? 0.25 : 0.7;
  const popularity = c.salesVolume != null ? Math.min(1.0, Math.log10(1 + Math.max(0, c.salesVolume)) / 4.0) : 0.5;
  if (c.appeal != null) {
    // Web extension: desirability dominates, so liked skins win over plain ones of the same tier.
    return 0.3 * rarity + 0.15 * exterior + 0.05 * popularity + 0.5 * Math.min(1, Math.max(0, c.appeal));
  }
  return 0.45 * rarity + 0.35 * exterior + 0.2 * popularity;
}

/** Deterministic value in [0,1): FNV-1a 64-bit over UTF-8 "seed:itemId", (h >> 11) / 2^53. */
export function unitHash(seed: number, itemId: string): number {
  const mask = (1n << 64n) - 1n;
  let h = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(`${seed}:${itemId}`)) {
    h ^= BigInt(byte);
    h = (h * 1099511628211n) & mask;
  }
  return Number(h >> 11n) / 2 ** 53;
}

class Context {
  readonly hasTarget: boolean;
  readonly prioritySum: number;
  readonly targetShare: number[];
  readonly priorities: number[];
  readonly owned: string;
  readonly seed: number;

  constructor(readonly request: KitRequest) {
    this.hasTarget = request.targetColor !== null;
    this.owned = request.ownedItems ?? "ZeroCost";
    this.seed = request.seed ?? 0;
    this.priorities = request.slots.map((s) => s.priority ?? 1.0);
    const n = request.slots.length;
    let prioritySum = 0, weightSum = 0;
    request.slots.forEach((s, i) => {
      prioritySum += this.priorities[i];
      weightSum += s.slot.typicalWeight * this.priorities[i];
    });
    this.prioritySum = prioritySum;
    this.targetShare = request.slots.map((s, i) => (weightSum > 0 ? (s.slot.typicalWeight * this.priorities[i]) / weightSum : 1.0 / n));
  }

  score(c: Candidate): Scored {
    const price = c.owned && this.owned === "ZeroCost" ? 0 : c.priceCents;
    const color = this.hasTarget ? colorScore(this.request.targetColor!, c.colors, this.request.colorTolerance) : 0;
    const q = quality(c);
    let slotScore = this.hasTarget ? 0.65 * color + 0.35 * q : q;
    if (this.seed !== 0) slotScore *= 1 + 0.16 * (unitHash(this.seed, c.itemId) - 0.5);
    return { c, price, value: Math.max(0, c.priceCents), color, quality: q, slotScore, signature: signature(c.colors) };
  }

  share(value: number, totalValue: number, n: number) {
    return totalValue > 0 ? value / totalValue : 1.0 / n;
  }

  closeness(total: number) {
    const margin = this.request.budgetCents * Math.max(clamp(this.request.budgetTolerance, 0, 0.3), MIN_UNDERSPEND);
    return margin > 0 ? clamp(1 - Math.abs(total - this.request.budgetCents) / margin, 0, 1) : 1;
  }

  compose(slotPart: number, harm: number, allocation: number, closeness: number) {
    return this.hasTarget
      ? 0.55 * slotPart + 0.2 * harm + 0.15 * allocation + 0.1 * closeness
      : 0.55 * slotPart + 0.1 * harm + 0.2 * allocation + 0.15 * closeness;
  }

  fullScore(picks: Scored[]): number {
    const n = picks.length;
    let slotSum = 0, harm = 0, total = 0, value = 0;
    for (let i = 0; i < n; i++) {
      slotSum += this.priorities[i] * picks[i].slotScore;
      total += picks[i].price;
      value += picks[i].value;
      for (let j = i + 1; j < n; j++) harm += harmony(picks[i], picks[j]);
    }
    let deviation = 0;
    for (let i = 0; i < n; i++) deviation += Math.abs(this.share(picks[i].value, value, n) - this.targetShare[i]);
    const pairs = (n * (n - 1)) / 2;
    return this.compose(slotSum / this.prioritySum, pairs === 0 ? 0.5 : harm / pairs, 1 - 0.5 * deviation, this.closeness(total));
  }

  toProposal(picks: Scored[], lo: number, hi: number): KitProposal {
    const n = picks.length;
    let total = 0, harm = 0;
    for (let i = 0; i < n; i++) {
      total += picks[i].price;
      for (let j = i + 1; j < n; j++) harm += harmony(picks[i], picks[j]);
    }
    const pairs = (n * (n - 1)) / 2;
    return {
      picks: picks.map((p, i) => ({
        slotId: this.request.slots[i].slot.id, candidate: p.c, effectivePriceCents: p.price,
        colorScore: p.color, qualityScore: p.quality, slotScore: p.slotScore,
      })),
      totalCents: total,
      budgetCents: this.request.budgetCents,
      withinBudgetBand: total >= lo && total <= hi,
      score: this.fullScore(picks),
      colorHarmony: pairs === 0 ? 1.0 : harm / pairs,
    };
  }
}

function fail(problem: Partial<Infeasibility> & Pick<Infeasibility, "reason" | "suggestions">, lo: number, hi: number): KitResult {
  return {
    feasible: false, best: null, alternativeKits: [], alternativesBySlot: {},
    problem: {
      slotId: null, cheapestCents: null, cheapestIgnoringColorCents: null, boundCents: null,
      minimumTotalCents: null, cheapestBySlot: null, ...problem,
    },
    bandMinCents: lo, bandMaxCents: hi,
  };
}

function filter(ctx: Context, slot: SlotRequest, catalog: readonly Candidate[], applyColor: boolean, applyVariantRules = true): Scored[] {
  const r = ctx.request;
  const list: Scored[] = [];
  for (const c of catalog) {
    if (!accepts(slot.slot, c) || (c.owned && ctx.owned === "Ignore")) continue;
    if (applyVariantRules) {
      if ((c.statTrak && !r.allowStatTrak) || (c.souvenir && !r.allowSouvenir)) continue;
      if (r.worstExterior != null && c.exterior != null && c.exterior > r.worstExterior) continue;
      if ((r.minFloat != null && c.floatMax != null && c.floatMax < r.minFloat)
        || (r.maxFloat != null && c.floatMin != null && c.floatMin > r.maxFloat)) continue;
    }
    const scored = ctx.score(c);
    if (scored.price <= 0 && !(c.owned && ctx.owned === "ZeroCost")) continue;
    if (applyColor && ctx.hasTarget && scored.color < threshold(r.colorTolerance)) continue;
    list.push(scored);
  }
  return list;
}

function explainEmptySlot(ctx: Context, slot: SlotRequest, catalog: readonly Candidate[], lo: number, hi: number): KitResult {
  const suggestions: Suggestion[] = [];
  let cheapestNoColor: number | null = null;
  if (ctx.hasTarget) {
    const noColor = filter(ctx, slot, catalog, false);
    if (noColor.length > 0) {
      cheapestNoColor = Math.min(...noColor.map((x) => x.price));
      suggestions.push("RelaxColor");
    }
  }
  if (cheapestNoColor === null && filter(ctx, slot, catalog, false, false).length > 0) {
    suggestions.push("AllowStatTrakOrSouvenir", "RelaxExteriorOrFloat");
  }
  suggestions.push("DisableSlot");
  return fail({ reason: "NoCandidatesForSlot", slotId: slot.slot.id, cheapestIgnoringColorCents: cheapestNoColor, boundCents: hi, suggestions }, lo, hi);
}

const byPriceThenId = (a: Scored, b: Scored) => a.price - b.price || ordinal(a.c.itemId, b.c.itemId);

function prune(all: Scored[]): Scored[] {
  if (all.length <= CANDIDATES_PER_SLOT) return [...all].sort(byPriceThenId);
  const byPrice = [...all].sort((a, b) => a.price - b.price || b.slotScore - a.slotScore || ordinal(a.c.itemId, b.c.itemId));
  const keep: Scored[] = [];
  const seen = new Set<string>();
  const add = (x: Scored) => {
    if (keep.length < CANDIDATES_PER_SLOT && !seen.has(x.c.itemId)) {
      seen.add(x.c.itemId);
      keep.push(x);
    }
  };
  let bestScore = -Infinity;
  for (const x of byPrice) {
    if (x.slotScore > bestScore + EPSILON) {
      bestScore = x.slotScore;
      if (keep.length < CANDIDATES_PER_SLOT / 2) add(x);
    }
  }
  for (let i = 0; i < PRICE_SPREAD_SAMPLES; i++) {
    add(byPrice[Math.trunc((i * (byPrice.length - 1)) / (PRICE_SPREAD_SAMPLES - 1))]);
  }
  for (const x of [...all].sort((a, b) => b.slotScore - a.slotScore || a.price - b.price || ordinal(a.c.itemId, b.c.itemId))) {
    if (keep.length >= CANDIDATES_PER_SLOT) break;
    add(x);
  }
  return keep.sort(byPriceThenId);
}

interface BeamNode {
  parent: BeamNode | null;
  candidate: number;
  cost: number;
  slotSum: number;
  harmonySum: number;
  pairs: number;
  key: number;
}

function beamSearch(ctx: Context, pruned: Scored[][], lo: number, hi: number): Scored[][] {
  const n = pruned.length;
  const slots = ctx.request.slots;
  const order = [...Array(n).keys()].sort((i, j) =>
    slots[j].slot.typicalWeight * ctx.priorities[j] - slots[i].slot.typicalWeight * ctx.priorities[i] || i - j);
  const minRem = new Array<number>(n + 1).fill(0);
  const maxRem = new Array<number>(n + 1).fill(0);
  for (let k = n - 1; k >= 0; k--) {
    minRem[k] = minRem[k + 1] + Math.min(...pruned[order[k]].map((x) => x.price));
    maxRem[k] = maxRem[k + 1] + Math.max(...pruned[order[k]].map((x) => x.price));
  }

  // Harmony between pruned candidates of every pair of positions, computed once.
  const harm: Float64Array[][] = [];
  for (let j = 0; j < n; j++) {
    harm.push([]);
    const a = pruned[order[j]];
    for (let k = j + 1; k < n; k++) {
      const b = pruned[order[k]];
      const m = new Float64Array(a.length * b.length);
      for (let x = 0; x < a.length; x++) for (let y = 0; y < b.length; y++) m[x * b.length + y] = harmony(b[y], a[x]);
      harm[j][k] = m;
    }
  }

  let beam: (BeamNode | null)[] = [null];
  const path = new Array<number>(n).fill(0);
  for (let k = 0; k < n; k++) {
    const cands = pruned[order[k]];
    const priority = ctx.priorities[order[k]];
    const buckets: BeamNode[][] = Array.from({ length: BEAM_BUCKETS }, () => []);
    for (const state of beam) {
      let node = state;
      for (let j = k - 1; j >= 0; j--) {
        path[j] = node!.candidate;
        node = node!.parent;
      }
      const baseCost = state?.cost ?? 0, baseSlot = state?.slotSum ?? 0, baseHarmony = state?.harmonySum ?? 0;
      const pairs = (state?.pairs ?? 0) + k;
      for (let c = 0; c < cands.length; c++) {
        const cost = baseCost + cands[c].price;
        if (cost + minRem[k + 1] > hi || cost + maxRem[k + 1] < lo) continue;
        let h = baseHarmony;
        for (let j = 0; j < k; j++) h += harm[j][k][path[j] * cands.length + c];
        const slotSum = baseSlot + priority * cands[c].slotScore;
        const key = slotSum + 0.2 * (pairs === 0 ? 0.5 : h / pairs);
        const arr = buckets[Math.trunc((cost * BEAM_BUCKETS) / (hi + 1))];
        // Bounded selection equivalent to a stable descending sort + take: earlier states win ties.
        if (arr.length === BEAM_PER_BUCKET && key <= arr[arr.length - 1].key) continue;
        let pos = arr.length;
        while (pos > 0 && arr[pos - 1].key < key) pos--;
        arr.splice(pos, 0, { parent: state, candidate: c, cost, slotSum, harmonySum: h, pairs, key });
        if (arr.length > BEAM_PER_BUCKET) arr.pop();
      }
    }
    beam = buckets.flat();
    if (beam.length === 0) return [];
  }

  const complete = beam.map((state) => {
    const picks = new Array<Scored>(n);
    let node = state;
    for (let k = n - 1; k >= 0; k--) {
      picks[order[k]] = pruned[order[k]][node!.candidate];
      node = node!.parent;
    }
    return { picks, score: ctx.fullScore(picks) };
  });
  return complete.sort((a, b) => b.score - a.score).map((x) => x.picks);
}

function refine(ctx: Context, start: Scored[], pool: Scored[][], lo: number, hi: number): Scored[] {
  const current = [...start];
  const n = current.length;
  for (let pass = 0; pass < MAX_REFINE_PASSES; pass++) {
    let improved = false;
    for (let s = 0; s < n; s++) {
      if (ctx.request.slots[s].lockedItemId != null) continue;
      // Parts of the score that do not depend on slot s.
      let othersSlotSum = 0, othersHarmony = 0, othersCost = 0, othersValue = 0;
      for (let i = 0; i < n; i++) {
        if (i === s) continue;
        othersSlotSum += ctx.priorities[i] * current[i].slotScore;
        othersCost += current[i].price;
        othersValue += current[i].value;
        for (let j = i + 1; j < n; j++) if (j !== s) othersHarmony += harmony(current[i], current[j]);
      }
      const pairs = (n * (n - 1)) / 2;
      const score = (cand: Scored) => {
        let h = othersHarmony;
        for (let i = 0; i < n; i++) if (i !== s) h += harmony(cand, current[i]);
        const value = othersValue + cand.value;
        let deviation = 0;
        for (let i = 0; i < n; i++) {
          deviation += Math.abs(ctx.share(i === s ? cand.value : current[i].value, value, n) - ctx.targetShare[i]);
        }
        return ctx.compose((othersSlotSum + ctx.priorities[s] * cand.slotScore) / ctx.prioritySum,
          pairs === 0 ? 0.5 : h / pairs, 1 - 0.5 * deviation, ctx.closeness(othersCost + cand.price));
      };
      const original = current[s];
      let bestScore = score(original);
      let bestSwap: Scored | null = null;
      for (const cand of pool[s]) {
        if (cand === original) continue;
        const newTotal = othersCost + cand.price;
        if (newTotal < lo || newTotal > hi) continue;
        const sc = score(cand);
        if (sc > bestScore + EPSILON) {
          bestScore = sc;
          bestSwap = cand;
        }
      }
      if (bestSwap) {
        current[s] = bestSwap;
        improved = true;
      }
    }
    if (!improved) break;
  }
  return current;
}

const differences = (a: Scored[], b: Scored[]) => a.reduce((d, x, i) => d + (x.c.skinId !== b[i].c.skinId ? 1 : 0), 0);

function slotOptions(ctx: Context, kit: Scored[], s: number, eligible: Scored[], lo: number, hi: number): SlotAlternatives {
  const chosen = kit[s];
  const total = kit.reduce((t, x) => t + x.price, 0);
  const similar = (x: Scored) => (ctx.hasTarget ? Math.abs(x.color - chosen.color) <= 0.2 : harmony(x, chosen) >= 0.5);
  // One entry per skin/variant and side: the exterior whose price is closest to the current pick.
  const groups = new Map<string, Scored[]>();
  for (const x of eligible) {
    if (x.c.itemId === chosen.c.itemId || x.price > hi || !similar(x)) continue;
    const key = `${x.c.skinId}|${x.c.statTrak}|${x.c.souvenir}|${x.price < chosen.price}`;
    const g = groups.get(key);
    if (g) g.push(x);
    else groups.set(key, [x]);
  }
  const reps = [...groups.values()].map((g) =>
    g.sort((a, b) => Math.abs(a.price - chosen.price) - Math.abs(b.price - chosen.price) || ordinal(a.c.itemId, b.c.itemId))[0]);
  const k = ctx.request.alternativesPerSide ?? 5;
  const opt = (x: Scored): AlternativeOption => {
    const newTotal = total - chosen.price + x.price;
    return { candidate: x.c, effectivePriceCents: x.price, deltaCents: x.price - chosen.price, colorScore: x.color,
      keepsKitWithinBand: newTotal >= lo && newTotal <= hi };
  };
  return {
    slotId: ctx.request.slots[s].slot.id,
    cheaper: reps.filter((x) => x.price < chosen.price).sort((a, b) => b.price - a.price || ordinal(a.c.itemId, b.c.itemId)).slice(0, k).map(opt),
    pricier: reps.filter((x) => x.price >= chosen.price).sort(byPriceThenId).slice(0, k).map(opt),
  };
}

export function buildKit(request: KitRequest, catalog: readonly Candidate[]): KitResult {
  const { min: lo, max: hi } = band(request);
  if (request.slots.length === 0) return fail({ reason: "NoSlots", suggestions: ["AddSlots"] }, lo, hi);
  const ctx = new Context(request);
  const n = request.slots.length;

  // 1. Candidates per slot (all filters except price).
  const eligible: Scored[][] = [];
  const alternativeSource: Scored[][] = [];
  for (let s = 0; s < n; s++) {
    const slotReq = request.slots[s];
    if (slotReq.lockedItemId != null) {
      const locked = catalog.find((c) => c.itemId === slotReq.lockedItemId && accepts(slotReq.slot, c) && !(c.owned && ctx.owned === "Ignore"));
      if (!locked) return fail({ reason: "LockedItemUnavailable", slotId: slotReq.slot.id, suggestions: ["DisableSlot"] }, lo, hi);
      eligible.push([ctx.score(locked)]);
      alternativeSource.push(filter(ctx, slotReq, catalog, true));
      continue;
    }
    const list = filter(ctx, slotReq, catalog, true);
    if (list.length === 0) return explainEmptySlot(ctx, slotReq, catalog, lo, hi);
    eligible.push(list);
    alternativeSource.push(list);
  }

  // 2. Budget feasibility.
  const slotMin = eligible.map((l) => Math.min(...l.map((x) => x.price)));
  const minSum = slotMin.reduce((a, b) => a + b, 0);
  const maxSum = eligible.reduce((t, l) => t + Math.max(...l.map((x) => x.price)), 0);
  if (minSum > hi) {
    let worst = -1;
    for (let s = 0; s < n; s++) if (slotMin[s] > hi && (worst < 0 || slotMin[s] > slotMin[worst])) worst = s;
    const suggestions: Suggestion[] = ["IncreaseBudget", "DisableSlot"];
    if (ctx.hasTarget) suggestions.push("RelaxColor");
    return fail({
      reason: "BudgetTooLow", slotId: worst >= 0 ? request.slots[worst].slot.id : null,
      cheapestCents: worst >= 0 ? slotMin[worst] : null, boundCents: hi, suggestions, minimumTotalCents: minSum,
      cheapestBySlot: Object.fromEntries(request.slots.map((r, i) => [r.slot.id, slotMin[i]])),
    }, lo, hi);
  }
  let warning: Infeasibility | null = null;
  let loEff = lo;
  if (maxSum < lo) {
    warning = {
      reason: "BudgetTooHigh", slotId: null, cheapestCents: null, cheapestIgnoringColorCents: null, boundCents: maxSum,
      suggestions: ["DecreaseBudget", "AddSlots", "RelaxColor"], minimumTotalCents: null, cheapestBySlot: null,
    };
    loEff = 0;
  }

  // 3. Each slot must leave room for the cheapest option of every other slot.
  const pool = eligible.map((l, s) => l.filter((x) => x.price <= hi - (minSum - slotMin[s])));

  // 4. Search.
  const complete = beamSearch(ctx, pool.map(prune), loEff, hi);
  if (complete.length === 0) {
    return fail({ reason: "BudgetTooLow", boundCents: hi, suggestions: ["IncreaseBudget", "DisableSlot"], minimumTotalCents: minSum }, lo, hi);
  }
  const best = refine(ctx, complete[0], pool, loEff, hi);
  const chosen: Scored[][] = [best];
  const minDiff = Math.max(1, Math.ceil(n / 3.0));
  const maxAlternatives = request.maxAlternativeKits ?? 3;
  for (const kit of complete) {
    if (chosen.length > maxAlternatives) break;
    if (!chosen.every((k) => differences(k, kit) >= minDiff)) continue;
    const refined = refine(ctx, kit, pool, loEff, hi);
    chosen.push(chosen.every((k) => differences(k, refined) >= minDiff) ? refined : kit);
  }

  const alternativesBySlot: Record<string, SlotAlternatives> = {};
  for (let s = 0; s < n; s++) alternativesBySlot[request.slots[s].slot.id] = slotOptions(ctx, best, s, alternativeSource[s], loEff, hi);
  return {
    feasible: warning === null, best: ctx.toProposal(best, lo, hi),
    alternativeKits: chosen.slice(1).map((k) => ctx.toProposal(k, lo, hi)), alternativesBySlot, problem: warning,
    bandMinCents: lo, bandMaxCents: hi,
  };
}

/** Replaces one pick without touching the others. */
export function replacePick(request: KitRequest, current: KitProposal, slotId: string, replacement: Candidate): KitProposal {
  const ctx = new Context(request);
  const { min, max } = band(request);
  return ctx.toProposal(current.picks.map((p) => ctx.score(p.slotId === slotId ? replacement : p.candidate)), min, max);
}

/** Locks itemId in the slot and rebuilds the rest of the kit. */
export function rebalance(request: KitRequest, catalog: readonly Candidate[], slotId: string, itemId: string): KitResult {
  return buildKit({ ...request, slots: request.slots.map((s) => (s.slot.id === slotId ? { ...s, lockedItemId: itemId } : s)) }, catalog);
}
