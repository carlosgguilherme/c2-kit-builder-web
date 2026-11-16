// Returns, for one CS2 item, the cheapest Steam Market listing's official renders (3/4, left, right,
// in hand), its float and pattern, and its "Inspect in Game" link. Results are cached for 12 hours
// in public.inspect_links, so Steam sees at most one request per item every 12 hours.
// Only items present in the price cache are accepted, so the function cannot be used to crawl
// arbitrary market pages.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { parseListingPage } from "./parse.ts";

const ALLOWED_ORIGINS = new Set(["https://cs2-kit-builder.vercel.app", "http://localhost:4180", "http://localhost:5173"]);
const TTL_MS = 12 * 60 * 60_000;
const NAME_MAX = 200;

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://cs2-kit-builder.vercel.app",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    Vary: "Origin",
  };
}

Deno.serve(async (req) => {
  const base = { ...cors(req), "Content-Type": "application/json" };
  const reply = (body: unknown, status = 200, maxAge = 0) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...base, "Cache-Control": maxAge > 0 ? `public, max-age=${maxAge}` : "no-store" },
    });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: base });

  const name = new URL(req.url).searchParams.get("name")?.trim() ?? "";
  if (!name || name.length > NAME_MAX) return reply({ error: "name_required" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cached } = await db
    .from("inspect_links")
    .select("payload, fetched_at")
    .eq("market_hash_name", name)
    .maybeSingle();
  if (cached && Date.now() - Date.parse(cached.fetched_at) < TTL_MS) return reply(cached.payload, 200, 3600);

  const { data: known } = await db.from("prices").select("market_hash_name").eq("market_hash_name", name).maybeSingle();
  if (!known) return reply({ error: "unknown_item" }, 404);

  const res = await fetch(`https://steamcommunity.com/market/listings/730/${encodeURIComponent(name)}`, {
    headers: { "User-Agent": "Mozilla/5.0 cs2-kit-builder-web (noncommercial)", "Accept-Language": "en" },
  });
  if (res.status === 429) return reply({ error: "steam_rate_limited" }, 503);
  if (!res.ok) return reply({ error: `steam_http_${res.status}` }, 502);

  let payload;
  try {
    payload = parseListingPage(await res.text());
  } catch {
    return reply({ error: "steam_format_changed" }, 502);
  }
  await db
    .from("inspect_links")
    .upsert({ market_hash_name: name, payload, fetched_at: new Date().toISOString() });
  return reply(payload, 200, 3600);
});
