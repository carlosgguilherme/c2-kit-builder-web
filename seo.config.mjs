// Per-page SEO metadata, used by the Vite plugin (HTML heads) and scripts/build-seo.mjs (sitemap).
export const SITE_NAME = "CS2 Kit Builder";

export const PAGES = {
  "index.html": {
    path: "/",
    title: "CS2 Kit Builder: monte kits de skins de CS2 pelo orçamento e pela cor",
    description:
      "Diga quanto quer gastar e a cor que quer: o CS2 Kit Builder monta um kit de skins de Counter-Strike 2 com preços do Mercado da Steam e alternativas mais baratas e mais caras para cada peça.",
    sitemap: { changefreq: "daily", priority: "1.0" },
  },
  "termos.html": {
    path: "/termos",
    title: "Termos de Uso | CS2 Kit Builder",
    description: "Termos de uso do CS2 Kit Builder, ferramenta gratuita e sem fins comerciais para montar kits de skins de CS2.",
    sitemap: { changefreq: "yearly", priority: "0.3" },
  },
  "privacidade.html": {
    path: "/privacidade",
    title: "Política de Privacidade | CS2 Kit Builder",
    description: "Como o CS2 Kit Builder trata dados: sem cadastro, sem login e com estatísticas de uso apenas com o seu consentimento.",
    sitemap: { changefreq: "yearly", priority: "0.3" },
  },
  "404.html": {
    path: null,
    title: "Página não encontrada | CS2 Kit Builder",
    description: "Esta página não existe. Volte para o montador de kits de skins de CS2.",
    noindex: true,
  },
};
