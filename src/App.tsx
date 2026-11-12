import { useEffect, useMemo, useState } from "react";
import { buildCandidates, fetchCatalog, fetchPrices, marketUrl, type KitData } from "./data";
import { buildKit, rebalance, replacePick } from "./engine/engine";
import { fromHex } from "./engine/oklab";
import { MAIN_ITEMS, type AlternativeOption, type Candidate, type KitProposal, type KitRequest, type KitResult } from "./engine/types";
import { LegalPage } from "./Legal";
import { delta, money, problemText, slotLabel } from "./texts";

const PRESETS: [string, string][] = [
  ["Vermelho", "#d32f2f"], ["Azul", "#1e88e5"], ["Azul gelo", "#8fd3f4"], ["Verde", "#2e9e4f"], ["Roxo", "#8e44ad"],
  ["Rosa", "#e91e8c"], ["Laranja", "#ef6c00"], ["Dourado", "#c9a227"], ["Preto", "#1c1c1c"], ["Branco", "#f2f2f2"],
];
const DEFAULT_SLOTS = ["ak47", "m4", "awp", "deagle", "pistol"];

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: KitData };

export function App() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [useColor, setUseColor] = useState(true);
  const [color, setColor] = useState("#d32f2f");
  const [colorTolerance, setColorTolerance] = useState(0.5);
  const [budget, setBudget] = useState(200);
  const [margin, setMargin] = useState(10);
  const [slots, setSlots] = useState<string[]>(DEFAULT_SLOTS);
  const [statTrak, setStatTrak] = useState(false);
  const [souvenir, setSouvenir] = useState(false);
  const [request, setRequest] = useState<KitRequest | null>(null);
  const [result, setResult] = useState<KitResult | null>(null);
  const [kit, setKit] = useState<KitProposal | null>(null);
  const [seed, setSeed] = useState(0);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchCatalog(), fetchPrices()])
      .then(([catalog, prices]) => setLoad({ status: "ready", data: buildCandidates(catalog, prices) }))
      .catch((e: unknown) => setLoad({ status: "error", message: e instanceof Error ? e.message : String(e) }));
  }, []);

  const data = load.status === "ready" ? load.data : null;
  const [page, setPage] = useState(() => (typeof window !== "undefined" ? window.location.hash : ""));

  useEffect(() => {
    const onHash = () => {
      setPage(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Show a real kit right away (default options) instead of an empty screen.
  useEffect(() => {
    if (data && !result) generate(0);
  }, [data]);

  function makeRequest(nextSeed: number): KitRequest {
    return {
      targetColor: useColor ? fromHex(color) : null,
      colorTolerance,
      budgetCents: Math.round(budget * 100),
      budgetTolerance: margin / 100,
      slots: MAIN_ITEMS.filter((s) => slots.includes(s.id)).map((slot) => ({ slot, priority: 1 })),
      allowStatTrak: statTrak,
      allowSouvenir: souvenir,
      seed: nextSeed,
    };
  }

  function run(req: KitRequest, nextSeed: number, compute: () => KitResult) {
    const started = performance.now();
    const r = compute();
    setElapsed(Math.round(performance.now() - started));
    setSeed(nextSeed);
    setRequest(req);
    setResult(r);
    setKit(r.best);
    setOpen(null);
  }

  function generate(nextSeed: number) {
    if (!data) return;
    const req = makeRequest(nextSeed);
    run(req, nextSeed, () => buildKit(req, data.candidates));
  }

  function swap(slotId: string, candidate: Candidate, andRebalance: boolean) {
    if (!data || !request || !kit) return;
    if (andRebalance) {
      const req: KitRequest = { ...request, slots: request.slots.map((s) => (s.slot.id === slotId ? { ...s, lockedItemId: candidate.itemId } : s)) };
      run(req, seed, () => rebalance(request, data.candidates, slotId, candidate.itemId));
    } else {
      setKit(replacePick(request, kit, slotId, candidate));
      setOpen(null);
    }
  }

  const state = useMemo(() => {
    if (!kit || !result) return null;
    const edge = (result.bandMaxCents - kit.budgetCents) * 0.8;
    const out = kit.totalCents < result.bandMinCents || kit.totalCents > result.bandMaxCents;
    const near = !out && (kit.totalCents > kit.budgetCents + edge || kit.totalCents < result.bandMinCents + (kit.budgetCents - result.bandMinCents) * 0.2);
    return out ? { cls: "out", text: "Fora da margem" } : near ? { cls: "near", text: "No limite da margem" } : { cls: "ok", text: "Dentro do orçamento" };
  }, [kit, result]);

  return (
    <div className="app">
      <header>
        <h1>
          <span className="h-line">CS2</span>
          <span className="h-line h-kit">KIT</span>
          <span className="h-line h-builder">BUILDER</span>
        </h1>
        <p className="tagline">Diga quanto quer gastar e a cor que quer. <mark>O kit vem montado</mark>, com alternativas para cada peça.</p>
      </header>

      {(page === "#termos" || page === "#privacidade") && <LegalPage page={page} />}

      <main hidden={page === "#termos" || page === "#privacidade"}>
        <section className="panel inputs" aria-label="Opções do kit">
          <label className="row">
            <input type="checkbox" checked={useColor} onChange={(e) => setUseColor(e.target.checked)} />
            <span>Quero uma cor</span>
          </label>
          {useColor && (
            <>
              <div className="color-row">
                <input type="color" aria-label="Cor" value={color} onChange={(e) => setColor(e.target.value)} />
                <div className="presets">
                  {PRESETS.map(([name, hex]) => (
                    <button key={hex} type="button" title={name} aria-label={name} aria-pressed={color === hex}
                      className="swatch" style={{ background: hex }} onClick={() => setColor(hex)} />
                  ))}
                </div>
              </div>
              <label className="field">
                <span>Tolerância de cor <em>{colorTolerance <= 0.25 ? "estrita" : colorTolerance >= 0.75 ? "livre" : "média"}</em></span>
                <input type="range" min={0} max={1} step={0.05} value={colorTolerance} onChange={(e) => setColorTolerance(Number(e.target.value))} />
              </label>
            </>
          )}

          <label className="field">
            <span>Orçamento (R$)</span>
            <input type="number" min={0} step={10} value={budget} onChange={(e) => setBudget(Math.max(0, Number(e.target.value)))} />
          </label>
          <label className="field">
            <span>Margem do orçamento <em>±{margin}%</em></span>
            <input type="range" min={0} max={30} step={1} value={margin} onChange={(e) => setMargin(Number(e.target.value))} />
          </label>

          <fieldset>
            <legend>Itens do kit</legend>
            {MAIN_ITEMS.map((s) => (
              <label key={s.id} className="row">
                <input type="checkbox" checked={slots.includes(s.id)}
                  onChange={(e) => setSlots(e.target.checked ? [...slots, s.id] : slots.filter((x) => x !== s.id))} />
                <span>{slotLabel(s.id)}</span>
              </label>
            ))}
          </fieldset>
          <label className="row"><input type="checkbox" checked={statTrak} onChange={(e) => setStatTrak(e.target.checked)} /><span>Aceitar StatTrak™</span></label>
          <label className="row"><input type="checkbox" checked={souvenir} onChange={(e) => setSouvenir(e.target.checked)} /><span>Aceitar Souvenir</span></label>

          <div className="actions">
            <button type="button" className="primary" disabled={!data} onClick={() => generate(0)}>Montar kit</button>
            <button type="button" disabled={!data || !kit} onClick={() => generate(seed + 1)}>Gerar outra combinação</button>
          </div>
          <p className="status" role="status">
            {load.status === "loading" && "Carregando catálogo e preços…"}
            {load.status === "error" && `Não foi possível carregar os dados: ${load.message}`}
            {data && (
              <>
                {data.pricedItems.toLocaleString("pt-BR")} itens com preço.{" "}
                {data.pricesUpdatedAt
                  ? `Preço aproximado do Mercado da Steam, atualizado em ${new Date(data.pricesUpdatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.`
                  : "Ainda sem preços."}
                {!data.crawlComplete && " A primeira coleta de preços ainda está em andamento, então alguns itens podem faltar."}
              </>
            )}
          </p>
        </section>

        <section className="result" aria-label="Kit montado">
          {result?.problem && <p className="problem" role="alert">{problemText(result.problem)}</p>}
          {kit && state && (
            <>
              <div className={`total ${state.cls}`}>
                <span className="total-label">TOTAL DO KIT</span>
                <strong>{money(kit.totalCents)}</strong>
                <span>{delta(kit.totalCents - kit.budgetCents)} em relação ao orçamento · <span className="total-state">{state.text}</span></span>
                <span className="muted">Harmonia de cor {Math.round(kit.colorHarmony * 100)}%{elapsed !== null && ` · montado em ${elapsed} ms`}</span>
              </div>
              <div className="cards">
                {kit.picks.map((pick) => {
                  const info = data!.info.get(pick.candidate.itemId);
                  const alts = alternativesFor(result!, kit, pick.slotId);
                  return (
                    <article key={pick.slotId} className="card" style={{ ["--rarity" as string]: info?.rarityColor ?? "#b0c3d9" }}>
                      <span className="slot">{slotLabel(pick.slotId)}</span>
                      {info?.imageUrl
                        ? <img src={info.imageUrl} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                        : <div className="noimg" />}
                      <h2>{pick.candidate.name}</h2>
                      <span className="rarity">{info?.rarityName}</span>
                      <strong className="price">{money(pick.effectivePriceCents)}</strong>
                      <div className="card-actions">
                        <button type="button" aria-expanded={open === pick.slotId} disabled={alts.length === 0}
                          onClick={() => setOpen(open === pick.slotId ? null : pick.slotId)}>
                          Alternativas ({alts.length})
                        </button>
                        {info && <a href={marketUrl(info.marketHashName)} target="_blank" rel="noreferrer">Ver no Mercado</a>}
                      </div>
                      {open === pick.slotId && (
                        <ul className="alts">
                          {alts.map((a) => (
                            <li key={a.candidate.itemId}>
                              <div>
                                <span>{a.candidate.name}</span>
                                <span className="muted">{money(a.effectivePriceCents)} · <b className={a.deltaCents < 0 ? "down" : "up"}>{delta(a.deltaCents)}</b></span>
                              </div>
                              <div className="alt-actions">
                                <button type="button" onClick={() => swap(pick.slotId, a.candidate, false)}>Trocar</button>
                                <button type="button" onClick={() => swap(pick.slotId, a.candidate, true)} title="Troca e remonta o resto do kit">Trocar e rebalancear</button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
          {load.status === "loading" && <Skeleton />}
          {load.status === "error" && <p className="problem" role="alert">Não foi possível carregar os dados agora. Tente recarregar a página.</p>}
        </section>
      </main>

      <footer>
        <p>
          CS2 Kit Builder é um projeto independente e sem fins comerciais. Não é afiliado, patrocinado nem endossado pela Valve Corporation.
          Counter-Strike, Counter-Strike 2, Steam, os logotipos e as imagens dos itens são marcas e/ou propriedade da Valve Corporation.
          Todos os direitos sobre esses itens pertencem aos seus respectivos titulares. Preços são estimativas obtidas do Mercado da
          Comunidade Steam e podem estar desatualizados.
        </p>
        <p>Catálogo: ByMykel/CSGO-API (MIT). Sem login, sem anúncios, sem coleta de dados.</p>
        <nav className="legal-links" aria-label="Documentos">
          <a href="#termos">Termos de Uso</a>
          <a href="#privacidade">Política de Privacidade</a>
          <a href="https://github.com/carlosgguilherme/c2-kit-builder-web" target="_blank" rel="noreferrer">Código-fonte</a>
        </nav>
      </footer>
    </div>
  );
}

/** Alternatives relative to the piece currently shown; the engine's original pick is offered back after a swap. */
function alternativesFor(result: KitResult, kit: KitProposal, slotId: string): AlternativeOption[] {
  const current = kit.picks.find((p) => p.slotId === slotId)!;
  const base = result.alternativesBySlot[slotId];
  const options = base ? [...base.cheaper, ...base.pricier].map((a) => ({ candidate: a.candidate, price: a.effectivePriceCents })) : [];
  const original = result.best?.picks.find((p) => p.slotId === slotId);
  if (original) options.push({ candidate: original.candidate, price: original.effectivePriceCents });
  return options
    .filter((o) => o.candidate.itemId !== current.candidate.itemId)
    .sort((a, b) => a.price - b.price || (a.candidate.itemId < b.candidate.itemId ? -1 : 1))
    .map((o) => {
      const d = o.price - current.effectivePriceCents;
      const total = kit.totalCents + d;
      return { candidate: o.candidate, effectivePriceCents: o.price, deltaCents: d, colorScore: 0,
        keepsKitWithinBand: total >= result.bandMinCents && total <= result.bandMaxCents };
    });
}

/** Placeholder layout while the catalog and prices load. */
function Skeleton() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Carregando kit">
      <div className="sk-total" />
      <div className="cards">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="card sk-card">
            <div className="sk-line sk-short" />
            <div className="sk-img" />
            <div className="sk-line" />
            <div className="sk-line sk-short" />
            <div className="sk-price" />
          </div>
        ))}
      </div>
    </div>
  );
}
