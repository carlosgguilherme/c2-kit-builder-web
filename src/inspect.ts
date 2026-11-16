import { SUPABASE_KEY, SUPABASE_URL } from "./config";

/** What the inspect-link Edge Function returns for one item (see supabase/functions/inspect-link). */
export interface ListingView {
  link: string | null;
  views: string[];
  float: number | null;
  pattern: number | null;
  listings: number;
}

export type ViewKey = "hand" | "angle" | "left" | "right";

/** Steam renders come in a fixed order: 3/4, left side, right side, in hand (gloves have no "in hand"). */
const VIEW_INDEX: Record<ViewKey, number> = { angle: 0, left: 1, right: 2, hand: 3 };

export const VIEW_LABEL: Record<ViewKey, string> = { hand: "Na mão", angle: "3/4", left: "Esquerda", right: "Direita" };

/** Order of the drag/arrow rotation, as if turning the item in the hand. */
export const TURN_ORDER: ViewKey[] = ["left", "angle", "right"];

export function viewUrl(v: ListingView, key: ViewKey): string | null {
  return v.views[VIEW_INDEX[key]] ?? null;
}

export function availableViews(v: ListingView): ViewKey[] {
  return (["hand", "angle", "left", "right"] as ViewKey[]).filter((k) => viewUrl(v, k) !== null);
}

/** The game-like default: the item in hand when Steam has that render. */
export function defaultView(v: ListingView): ViewKey {
  return viewUrl(v, "hand") ? "hand" : "angle";
}

/** Next view when turning the item left (-1) or right (+1); from "in hand" it starts at 3/4. */
export function turn(current: ViewKey, dir: -1 | 1, available: ViewKey[]): ViewKey {
  const order = TURN_ORDER.filter((k) => available.includes(k));
  if (order.length === 0) return current;
  const i = order.indexOf(current);
  if (i < 0) return order.includes("angle") ? "angle" : order[0];
  return order[Math.min(order.length - 1, Math.max(0, i + dir))];
}

/** The "inspect" sequence: in hand, turn the item over, and back to the hand. */
export function inspectSequence(available: ViewKey[]): ViewKey[] {
  const seq = (["hand", "angle", "left", "right", "angle", "hand"] as ViewKey[]).filter((k) => available.includes(k));
  return seq.filter((k, i) => i === 0 || seq[i - 1] !== k);
}

export function formatFloat(f: number): string {
  return f.toFixed(6).replace(".", ",");
}

const cache = new Map<string, Promise<ListingView>>();

export class InspectError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

/** Fetches (once per page load) the listing view of an item by its market hash name. */
export function fetchListingView(marketHashName: string): Promise<ListingView> {
  let p = cache.get(marketHashName);
  if (!p) {
    p = fetch(`${SUPABASE_URL}/functions/v1/inspect-link?name=${encodeURIComponent(marketHashName)}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    }).then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new InspectError(typeof body?.error === "string" ? body.error : `http_${res.status}`);
      return {
        link: typeof body.link === "string" && body.link.startsWith("steam://") ? body.link : null,
        views: Array.isArray(body.views) ? body.views.filter((u: unknown) => typeof u === "string" && u.startsWith("https://")) : [],
        float: typeof body.float === "number" ? body.float : null,
        pattern: typeof body.pattern === "number" ? body.pattern : null,
        listings: typeof body.listings === "number" ? body.listings : 0,
      };
    });
    p.catch(() => cache.delete(marketHashName));
    cache.set(marketHashName, p);
  }
  return p;
}
