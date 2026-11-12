import { chroma, type OkLab } from "./oklab";
import type { ColorProfile, PaletteColor } from "./types";

export const COLORED_CHROMA = 0.05;
export const MULTI_COLOR_FACTOR = 0.9;
export const LIGHTNESS_WEIGHT = 0.5;

export const sigma = (tolerance: number) => 0.08 + 0.17 * Math.min(1, Math.max(0, tolerance));
export const threshold = (tolerance: number) => 0.45 - 0.35 * Math.min(1, Math.max(0, tolerance));

/** OKLab distance with lightness half-weighted (images contain shading). */
export function distance(x: OkLab, y: OkLab): number {
  const dl = LIGHTNESS_WEIGHT * (x.l - y.l), da = x.a - y.a, db = x.b - y.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

export function colorScore(target: OkLab, profile: ColorProfile | null, tolerance: number): number {
  if (!profile || profile.colors.length === 0) return 0;
  const sg = sigma(tolerance);
  const targetChroma = chroma(target);
  const chromaRef = targetChroma >= COLORED_CHROMA ? 0.5 * targetChroma : 0;
  let area = 0, accent = 0;
  for (const c of profile.colors) {
    const d = distance(target, c.lab) / sg;
    let sim = Math.exp(-d * d);
    if (chromaRef > 0) sim *= Math.min(1.0, chroma(c.lab) / chromaRef);
    area += c.weight * sim;
    accent = Math.max(accent, sim * Math.min(1.0, Math.sqrt(c.weight / 0.2)));
  }
  const score = Math.max(area, accent);
  return profile.isMultiColor ? score * MULTI_COLOR_FACTOR : score;
}

/** Heaviest colored palette entry, else the heaviest entry. */
export function signature(profile: ColorProfile | null): PaletteColor | null {
  if (!profile) return null;
  let best: PaletteColor | null = null;
  for (const c of profile.colors) {
    if (chroma(c.lab) >= COLORED_CHROMA && (best === null || c.weight > best.weight)) best = c;
  }
  if (best) return best;
  for (const c of profile.colors) {
    if (best === null || c.weight > best.weight) best = c;
  }
  return best;
}

export function harmony(sa: PaletteColor | null, sb: PaletteColor | null): number {
  if (!sa || !sb) return 0.5;
  if (chroma(sa.lab) < COLORED_CHROMA || chroma(sb.lab) < COLORED_CHROMA) return 0.7;
  const d = distance(sa.lab, sb.lab) / 0.15;
  return Math.exp(-d * d);
}
