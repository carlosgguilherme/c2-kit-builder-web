# Supabase (price cache)

Project `cs2-kit-builder` (region sa-east-1). Applied migrations, in order:

1. `create_price_cache`: tables `prices` and `crawl_state` (RLS: public read, service-role write) and
   the `prices_snapshot()` RPC that returns the whole cache in one request.
2. `enable_cron_and_net`: `pg_cron` and `pg_net`.
3. `schedule_price_crawl`: calls the `crawl-prices` Edge Function once a minute.
4. `move_pg_net_to_extensions_schema`: security advisor fix (`pg_net` out of `public`).
5. `create_inspect_link_cache` and 6. `inspect_links_store_listing_view`: table `inspect_links`
   (`market_hash_name`, `payload` jsonb, `fetched_at`). RLS on with no policy on purpose: only the
   `inspect-link` function (service role) reads and writes it, so the advisor lists it as INFO.

First full cycle (2026-11-12, from Supabase sa-east-1): 15,770 prices in ~2 h 25 min, 125 calls,
0 errors, no Steam rate limit. Security advisor: no findings.

`functions/crawl-prices` crawls the Steam Market search in slices (10 pages per call, 3.5 s apart),
pauses 15 minutes on HTTP 429/403 and starts a new cycle when the cache is older than 6 hours.
A full cycle is ~1,580 pages (~2 h 40 min). Nothing here needs a secret: the cron job uses the
project's publishable key and the function uses the service role provided by the platform.

`functions/inspect-link?name=<market hash name>` feeds the site's inspect panel. It reads the Steam
Market listing page of the item (new UI: data embedded in `<script id="valve-ssr-data">`, listings
in `renderContext.queryData`) and returns, for the cheapest listing that has them, Valve's own
renders (`views`: 3/4, left, right and in hand; gloves have no in-hand render), `float`, `pattern`
and the "Inspect in Game" `link` (`steam://...csgo_econ_action_preview%20<item certificate>`).
Results are cached 12 hours; only names present in `prices` are accepted. Errors: 503
`steam_rate_limited`, 502 `steam_http_<status>` or `steam_format_changed`, 404 `unknown_item`.
The parser (`parse.ts`) is pure and covered by `parse.test.ts` (run with `npm test`).
Deploy both files together (`supabase functions deploy inspect-link`).
