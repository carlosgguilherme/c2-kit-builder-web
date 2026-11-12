export declare const SITE_NAME: string;
export declare const PAGES: Record<"index.html" | "termos.html" | "privacidade.html" | "404.html", {
  path: string | null;
  title: string;
  description: string;
  noindex?: boolean;
  sitemap?: { changefreq: string; priority: string };
}>;
