// OKLab (Bjorn Ottosson). Must stay identical to the reference implementation in
// carlosgguilherme/cs2-kit-builder (KitBuilder.Core/Color/OkLab.cs); checked by fixtures/oklab.json.
export interface OkLab {
  l: number;
  a: number;
  b: number;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

export function fromRgb(r: number, g: number, b: number): OkLab {
  const lr = toLinear(r / 255), lg = toLinear(g / 255), lb = toLinear(b / 255);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function fromHex(hex: string): OkLab {
  const h = hex.replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Expected #RRGGBB, got '${hex}'.`);
  return fromRgb(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16));
}

export const chroma = (c: OkLab) => Math.sqrt(c.a * c.a + c.b * c.b);
