export const SITE_URL = (import.meta.env?.VITE_SITE_URL || "https://cs2-kit-builder.vercel.app").replace(/\/$/, "");
/** Google Analytics 4 measurement ID; empty means analytics is off (no banner, nothing loaded). */
export const GA_ID: string = import.meta.env?.VITE_GA_ID || "";
export const REPO_URL = "https://github.com/carlosgguilherme/c2-kit-builder-web";
