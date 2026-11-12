// Writes public/sitemap.xml and public/robots.txt for the configured site URL.
import { writeFile, mkdir } from "node:fs/promises";
import { PAGES } from "../seo.config.mjs";

const site = (process.env.VITE_SITE_URL || "https://cs2-kit-builder.vercel.app").replace(/\/$/, "");
const today = new Date().toISOString().slice(0, 10);
const urls = Object.values(PAGES).filter((p) => p.path && !p.noindex);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((p) => `  <url>
    <loc>${site}${p.path === "/" ? "/" : p.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.sitemap.changefreq}</changefreq>
    <priority>${p.sitemap.priority}</priority>
  </url>`).join("\n")}
</urlset>
`;

const robots = `User-agent: *
Allow: /
Disallow: /data/

Sitemap: ${site}/sitemap.xml
`;

await mkdir("public", { recursive: true });
await writeFile("public/sitemap.xml", sitemap);
await writeFile("public/robots.txt", robots);
console.log(`seo: sitemap with ${urls.length} URLs for ${site}`);
