// Steam Market price crawler, run in small slices by pg_cron (one call per minute).
// Each call fetches a few search pages (10 items each, >= 3.5 s apart), upserts them into
// public.prices and advances the cursor in public.crawl_state. A full cycle (~1,580 pages)
// takes about 2.5 hours; a new cycle starts when the last one is older than CYCLE_TTL_HOURS.
// On HTTP 429 the crawler pauses (blocked_until) instead of retrying.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TYPES = ["tag_CSGO_Type_Pistol", "tag_CSGO_Type_SMG", "tag_CSGO_Type_Rifle", "tag_CSGO_Type_SniperRifle",
  "tag_CSGO_Type_Shotgun", "tag_CSGO_Type_Machinegun", "tag_CSGO_Type_Knife", "tag_Type_Hands"];
const SEARCH = "https://steamcommunity.com/market/search/render/?appid=730&norender=1&count=10&sort_column=name&sort_dir=asc"
  + TYPES.map((t) => "&category_730_Type%5B%5D=" + t).join("");
const OVERVIEW = "https://steamcommunity.com/market/priceoverview/?appid=730&market_hash_name="
  + encodeURIComponent("AK-47 | Redline (Field-Tested)") + "&currency=";
const REQUEST_INTERVAL_MS = 3500;
const SLICE_BUDGET_MS = 42_000;
const MIN_GAP_BETWEEN_RUNS_MS = 50_000;
const CYCLE_TTL_HOURS = 6;
const BLOCK_MINUTES = 15;
const HEADERS = { "User-Agent": "cs2-kit-builder-web price cache (noncommercial)" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** "R$ 1.234,56" / "$1,234.56" -> cents. */
function moneyToCents(text: string | undefined): number | null {
  const m = text?.match(/\d[\d.,]*/);
  if (!m) return null;
  const digits = m[0];
  const sep = Math.max(digits.lastIndexOf(","), digits.lastIndexOf("."));
  const hasCents = sep >= 0 && digits.length - sep - 1 === 2;
  const whole = (hasCents ? digits.slice(0, sep) : digits).replace(/[.,]/g, "");
  return Number(whole) * 100 + (hasCents ? Number(digits.slice(sep + 1)) : 0);
}

const currencyOf = (text: string | undefined) => (text?.trim().startsWith("R$") ? 7 : 1);

Deno.serve(async () => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  const { data: state, error } = await db.from("crawl_state").select("*").eq("id", 1).single();
  if (error || !state) return json({ error: error?.message ?? "no state" }, 500);
  const now = Date.now();
  const at = (v: string | null) => (v ? Date.parse(v) : 0);

  if (at(state.blocked_until) > now) return json({ skipped: "blocked", until: state.blocked_until });
  if (now - at(state.last_run_at) < MIN_GAP_BETWEEN_RUNS_MS) return json({ skipped: "another run is recent" });
  const cycleDone = state.cycle_completed_at && at(state.cycle_completed_at) >= at(state.cycle_started_at);
  if (cycleDone && now - at(state.cycle_completed_at) < CYCLE_TTL_HOURS * 3600_000) return json({ skipped: "cache is fresh" });

  // Claim this slice (guards against overlapping invocations).
  const { data: claimed } = await db.from("crawl_state").update({ last_run_at: new Date(now).toISOString() })
    .eq("id", 1).or(`last_run_at.is.null,last_run_at.lt.${new Date(now - MIN_GAP_BETWEEN_RUNS_MS).toISOString()}`).select("id");
  if (!claimed?.length) return json({ skipped: "claimed by another run" });

  let start: number = cycleDone ? 0 : state.next_start;
  let total: number = cycleDone ? 0 : state.total;
  const patch: Record<string, unknown> = { last_error: null };
  if (cycleDone || !state.cycle_started_at) patch.cycle_started_at = new Date(now).toISOString();

  const block = (status: number, where: string) => {
    patch.blocked_until = new Date(Date.now() + BLOCK_MINUTES * 60_000).toISOString();
    patch.last_error = `HTTP ${status} from Steam (${where})`;
  };

  let pages = 0;
  let blocked = false;
  try {
    // Exchange rate implied by Steam's own prices (BRL / USD of a liquid item), once a day.
    if (!state.fx_usd_brl || now - at(state.fx_updated_at) > 24 * 3600_000) {
      const [brl, usd] = [await fetch(OVERVIEW + "7", { headers: HEADERS }), await fetch(OVERVIEW + "1", { headers: HEADERS })];
      if (brl.status === 429 || usd.status === 429) {
        block(429, "priceoverview");
        blocked = true;
      } else if (brl.ok && usd.ok) {
        const b = await brl.json(), u = await usd.json();
        const bc = moneyToCents(b?.median_price ?? b?.lowest_price), uc = moneyToCents(u?.median_price ?? u?.lowest_price);
        if (bc && uc) {
          patch.fx_usd_brl = bc / uc;
          patch.fx_updated_at = new Date().toISOString();
        }
      }
      await sleep(REQUEST_INTERVAL_MS);
    }

    while (!blocked && Date.now() - now < SLICE_BUDGET_MS && (total === 0 || start < total)) {
      const res = await fetch(`${SEARCH}&start=${start}`, { headers: HEADERS });
      if (res.status === 429 || res.status === 403) {
        block(res.status, "search");
        blocked = true;
        break;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} from Steam (search)`);
      const page = await res.json();
      if (!page?.success) throw new Error("Steam search answered without success=true");
      const rows = (page.results ?? [])
        .filter((r: any) => r.sell_price > 0)
        .map((r: any) => ({
          market_hash_name: r.hash_name, price_cents: r.sell_price, currency: currencyOf(r.sell_price_text),
          listings: r.sell_listings ?? null, updated_at: new Date().toISOString(),
        }));
      if (rows.length) {
        const { error: upsertError } = await db.from("prices").upsert(rows);
        if (upsertError) throw new Error(upsertError.message);
      }
      total = page.total_count;
      start += 10;
      pages++;
      if ((page.results ?? []).length === 0) start = total;
      await sleep(REQUEST_INTERVAL_MS);
    }
  } catch (e) {
    patch.last_error = String(e instanceof Error ? e.message : e);
  }

  patch.next_start = start;
  patch.total = total;
  if (total > 0 && start >= total) {
    patch.cycle_completed_at = new Date().toISOString();
    patch.next_start = 0;
  }
  await db.from("crawl_state").update(patch).eq("id", 1);
  return json({ pages, next_start: patch.next_start, total, blocked, error: patch.last_error });
});
