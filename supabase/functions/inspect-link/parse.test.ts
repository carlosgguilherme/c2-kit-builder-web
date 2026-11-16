import { describe, expect, it } from "vitest";
import { parseListingPage } from "./parse";

const TEMPLATE = "steam://run/730//+csgo_econ_action_preview%20%propid:6%";
const EA = "https://shared.akamai.steamstatic.com/market_listings/ea/730";

function listing(id: string, opts: { views?: number; cert?: string; float?: number; pattern?: string } = {}) {
  const props: Record<string, unknown>[] = [];
  if (opts.pattern !== undefined) props.push({ propertyid: 1, int_value: opts.pattern });
  if (opts.float !== undefined) props.push({ propertyid: 2, float_value: opts.float });
  if (opts.cert !== undefined) props.push({ propertyid: 6, string_value: opts.cert });
  return {
    listingid: id,
    unPrice: 2274,
    enhanced_appearances: Array.from({ length: opts.views ?? 0 }, (_, i) => ({ mime_type: "image/avif", url: `${EA}/${id}/${i}_1.avif` })),
    description: { market_actions: [{ link: TEMPLATE, name: "Inspect in Game..." }] },
    asset: { id: "1", appid: 730, contextid: "2", asset_properties: props },
  };
}

/** Same nesting as the real page: renderContext.queryData is a JSON string holding react-query state. */
function page(listings: unknown[], extra: Record<string, unknown> = {}) {
  const queryData = JSON.stringify({ queries: [{ state: { data: { property_schemas: [] } } }, { state: { data: { pages: [{ start: 0, listings }] } } }] });
  const ssr = { route: "/market/listings/:appid/:name/:bucket?", loaderData: ["{\"steamid\":\"0\"}"], renderContext: { queryData }, ...extra };
  return `<html><body><script id="valve-ssr-data" type="application/json">${JSON.stringify(ssr)}</script></body></html>`;
}

describe("parseListingPage", () => {
  it("builds the inspect link and reads renders, float and pattern of the cheapest listing", () => {
    const r = parseListingPage(page([listing("10", { views: 4, cert: "A3B35A62", float: 0.48, pattern: "594" }), listing("11", { views: 4, cert: "FFFF" })]));
    expect(r.link).toBe("steam://run/730//+csgo_econ_action_preview%20A3B35A62");
    expect(r.views).toEqual([0, 1, 2, 3].map((i) => `${EA}/10/${i}_1.avif`));
    expect(r.float).toBe(0.48);
    expect(r.pattern).toBe(594);
    expect(r.listings).toBe(2);
  });

  it("prefers the cheapest listing that has renders", () => {
    const r = parseListingPage(page([listing("10", { cert: "AA" }), listing("11", { views: 3, cert: "BB" })]));
    expect(r.link).toMatch(/%20BB$/);
    expect(r.views).toHaveLength(3);
  });

  it("ignores render URLs outside Steam's listing CDN", () => {
    const l = listing("10", { views: 1, cert: "AA" });
    l.enhanced_appearances.push({ mime_type: "image/avif", url: "https://evil.example/x.avif" });
    expect(parseListingPage(page([l])).views).toEqual([`${EA}/10/0_1.avif`]);
  });

  it("gives no link for a certificate that is not hex or when the template is missing", () => {
    expect(parseListingPage(page([listing("10", { views: 1, cert: "%20bad" })])).link).toBeNull();
    const noTemplate = listing("10", { views: 1, cert: "AA" }) as Record<string, unknown>;
    delete noTemplate.description;
    expect(parseListingPage(page([noTemplate])).link).toBeNull();
  });

  it("returns an empty view when there are no listings", () => {
    expect(parseListingPage(page([]))).toEqual({ link: null, views: [], float: null, pattern: null, listings: 0 });
  });

  it("throws when the page has no embedded data (format changed)", () => {
    expect(() => parseListingPage("<html><body>maintenance</body></html>")).toThrow();
  });
});
