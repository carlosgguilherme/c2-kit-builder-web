# Supabase (price cache)

Project `cs2-kit-builder` (region sa-east-1). Applied migrations, in order:

1. `create_price_cache`: tables `prices` and `crawl_state` (RLS: public read, service-role write) and
   the `prices_snapshot()` RPC that returns the whole cache in one request.
2. `enable_cron_and_net`: `pg_cron` and `pg_net`.
3. `schedule_price_crawl`: calls the `crawl-prices` Edge Function once a minute.
4. `move_pg_net_to_extensions_schema`: security advisor fix (`pg_net` out of `public`).

First full cycle (2026-11-12, from Supabase sa-east-1): 15,770 prices in ~2 h 25 min, 125 calls,
0 errors, no Steam rate limit. Security advisor: no findings.

`functions/crawl-prices` crawls the Steam Market search in slices (10 pages per call, 3.5 s apart),
pauses 15 minutes on HTTP 429/403 and starts a new cycle when the cache is older than 6 hours.
A full cycle is ~1,580 pages (~2 h 40 min). Nothing here needs a secret: the cron job uses the
project's publishable key and the function uses the service role provided by the platform.
