import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { PAGES, SITE_NAME } from "./seo.config.mjs";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Injects title, description, canonical, Open Graph, Twitter, icons and optional verification per page. */
function seoHead(env: Record<string, string>): Plugin {
  const site = (env.VITE_SITE_URL || "https://cs2-kit-builder.vercel.app").replace(/\/$/, "");
  return {
    name: "seo-head",
    transformIndexHtml(html, ctx) {
      const file = ctx.filename.split(/[\\/]/).pop() as keyof typeof PAGES;
      const page = PAGES[file];
      if (!page) return html;
      const url = page.path ? site + (page.path === "/" ? "/" : page.path) : null;
      const tags = [
        `<title>${escape(page.title)}</title>`,
        `<meta name="description" content="${escape(page.description)}" />`,
        page.noindex ? `<meta name="robots" content="noindex, follow" />` : `<meta name="robots" content="index, follow, max-image-preview:large" />`,
        url ? `<link rel="canonical" href="${url}" />` : "",
        `<meta property="og:type" content="website" />`,
        `<meta property="og:site_name" content="${SITE_NAME}" />`,
        `<meta property="og:locale" content="pt_BR" />`,
        `<meta property="og:title" content="${escape(page.title)}" />`,
        `<meta property="og:description" content="${escape(page.description)}" />`,
        url ? `<meta property="og:url" content="${url}" />` : "",
        `<meta property="og:image" content="${site}/og-image.png" />`,
        `<meta property="og:image:width" content="1200" />`,
        `<meta property="og:image:height" content="630" />`,
        `<meta property="og:image:alt" content="CS2 Kit Builder: um kit de skins montado pelo orçamento e pela cor" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${escape(page.title)}" />`,
        `<meta name="twitter:description" content="${escape(page.description)}" />`,
        `<meta name="twitter:image" content="${site}/og-image.png" />`,
        `<link rel="icon" href="/favicon.svg" type="image/svg+xml" />`,
        `<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />`,
        `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`,
        `<meta name="theme-color" content="#121212" />`,
        env.VITE_GSC_VERIFICATION ? `<meta name="google-site-verification" content="${escape(env.VITE_GSC_VERIFICATION)}" />` : "",
      ].filter(Boolean);
      return html.replace("<!--seo-head-->", tags.join("\n    ")).replaceAll("__SITE_URL__", site);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    plugins: [react(), seoHead(env)],
    build: {
      rollupOptions: {
        input: Object.fromEntries(Object.keys(PAGES).map((f) => [f.replace(".html", ""), resolve(__dirname, f)])),
      },
    },
    test: { include: ["src/**/*.test.ts"] },
  };
});
