# CS2 Kit Builder (web)

Web version of [cs2-kit-builder](https://github.com/carlosgguilherme/cs2-kit-builder): builds Counter-Strike 2
skin kits from a budget and a color, in the browser.

| Part | Where |
|---|---|
| Kit engine | `src/engine`: TypeScript port of the Windows reference; `fixtures/` holds the shared golden cases (same picks required). Web-only extension: an optional `appeal` (market desirability, `assignAppeal` in `src/data.ts`) weighs in the quality score; without it the formula is identical to the reference |
| Variety | `buildNovelKit` (`src/kitOptions.ts`): "Outra combinação" avoids every skin already shown with the same options, freeing only the slot that runs out |
| Catalog + colors | `scripts/build-data.mjs` builds `public/data/catalog.json` at deploy time from ByMykel/CSGO-API and the weekly color index release |
| Prices | Supabase table filled by the `crawl-prices` Edge Function (see `supabase/README.md`); the site reads one RPC, visitors never call Steam |
| UI | `src/App.tsx` (React, pt-BR) |

```bash
npm install
npm test          # engine golden cases + data tests
npm run build     # downloads catalog data, type-checks and builds
npm run dev
```

## Configuration (Vercel environment variables)

| Variable | Purpose |
|---|---|
| `VITE_SITE_URL` | Canonical origin used in canonical tags, Open Graph, JSON-LD and the sitemap (default `https://cs2-kit-builder.vercel.app`) |
| `VITE_GA_ID` | Google Analytics 4 measurement ID (`G-…`). Empty: no analytics and no cookie banner. When set, GA loads only after the visitor accepts |
| `VITE_GSC_VERIFICATION` | Google Search Console "HTML tag" verification code (only the `content` value) |

Changing a variable requires a new deployment.

## Aviso legal

CS2 Kit Builder é um projeto independente e sem fins comerciais. Não é afiliado, patrocinado nem endossado pela Valve Corporation. Counter-Strike, Counter-Strike 2, Steam, os logotipos e as imagens dos itens são marcas e/ou propriedade da Valve Corporation. Todos os direitos sobre esses itens pertencem aos seus respectivos titulares. Preços são estimativas obtidas do Mercado da Comunidade Steam e podem estar desatualizados.

## License

[PolyForm Noncommercial 1.0.0](LICENSE). Item catalog by [ByMykel/CSGO-API](https://github.com/ByMykel/CSGO-API) (MIT).
