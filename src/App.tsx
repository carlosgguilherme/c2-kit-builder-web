import { useEffect, useMemo, useRef, useState } from "react";
import { budgetRange, track } from "./analytics";
import { buildCandidates, fetchCatalog, fetchPrices, marketUrl, type KitData } from "./data";
import { buildKit, rebalance, replacePick } from "./engine/engine";
import { fromHex } from "./engine/oklab";
import type { AlternativeOption, Candidate, KitProposal, KitRequest, KitResult } from "./engine/types";
import { DEFAULT_CHOICES, buildNovelKit, buildSlots, cleanBudgetInput, parseBudget, type M4Choice, type PistolChoice, type SlotChoices } from "./kitOptions";
import { Footer, Header, Page } from "./Layout";
import { delta, money, problemText, slotLabel } from "./texts";

const PRESETS: [string, string][] = [
  ["Vermelho", "#d32f2f"], ["Azul", "#1e88e5"], ["Azul gelo", "#8fd3f4"], ["Verde", "#2e9e4f"], ["Roxo", "#8e44ad"],
  ["Rosa", "#e91e8c"], ["Laranja", "#ef6c00"], ["Dourado", "#c9a227"], ["Preto", "#1c1c1c"], ["Branco", "#f2f2f2"],
];
const M4_OPTIONS: [M4Choice, string][] = [["any", "Qualquer"], ["m4a4", "M4A4"], ["m4a1s", "M4A1-S"], ["both", "As duas"]];
const PISTOL_OPTIONS: [PistolChoice, string][] = [["any", "Qualquer"], ["usp", "USP-S"], ["glock", "Glock-18"], ["both", "As duas"]];

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: KitData };

export function App() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [useColor, setUseColor] = useState(true);
  const [color, setColor] = useState("#d32f2f");
  const [colorTolerance, setColorTolerance] = useState(0.5);
  const [budgetText, setBudgetText] = useState("200");
  const [margin, setMargin] = useState(10);
  const [choices, setChoices] = useState<SlotChoices>(DEFAULT_CHOICES);
  const [statTrak, setStatTrak] = useState(false);
  const [souvenir, setSouvenir] = useState(false);
  const [request, setRequest] = useState<KitRequest | null>(null);
  const [result, setResult] = useState<KitResult | null>(null);
  const [kit, setKit] = useState<KitProposal | null>(null);
  const [seed, setSeed] = useState(0);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const shownRef = useRef<Set<string>>(new Set());
  const resultRef = useRef<HTMLElement>(null);

  const budget = parseBudget(budgetText);
  const slots = useMemo(() => buildSlots(choices), [choices]);

  useEffect(() => {
    Promise.all([fetchCatalog(), fetchPrices()])
      .then(([catalog, prices]) => setLoad({ status: "ready", data: buildCandidates(catalog, prices) }))
      .catch((e: unknown) => setLoad({ status: "error", message: e instanceof Error ? e.message : String(e) }));
  }, []);

  const data = load.status === "ready" ? load.data : null;

  function makeRequest(nextSeed: number): KitRequest | null {
    if (budget === null) return null;
    return {
      targetColor: useColor ? fromHex(color) : null,
      colorTolerance,
      budgetCents: Math.round(budget * 100),
      budgetTolerance: margin / 100,
      slots: slots.map((slot) => ({ slot, priority: 1 })),
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
    return r;
  }

  function generate(nextSeed: number, trigger: "auto" | "button" | "another") {
    if (!data) return;
    const req = makeRequest(nextSeed);
    if (!req) return;
    let r: KitResult;
    if (trigger === "another") {
      const current = new Set((kit?.picks ?? []).map((p) => p.candidate.skinId));
      r = buildNovelKit(req, data.candidates, shownRef.current, current);
      run(req, nextSeed, () => r);
    } else {
      shownRef.current = new Set();
      r = run(req, nextSeed, () => buildKit(req, data.candidates));
    }
    r.best?.picks.forEach((p) => shownRef.current.add(p.candidate.skinId));
    r.alternativeKits.forEach((k) => k.picks.forEach((p) => shownRef.current.add(p.candidate.skinId)));
    if (trigger !== "auto") {
      track(trigger === "another" ? "generate_another" : "generate_kit", {
        budget_range: budgetRange(budget ?? 0), items: slots.length, has_color: useColor, feasible: r.feasible,
      });
    }
  }

  function applySuggestedKit(index: number) {
    if (!result) return;
    const chosen = result.alternativeKits[index];
    track("use_suggested_kit", { position: index + 1 });
    setKit(chosen);
    setOpen(null);
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // The kit follows the options: rebuild shortly after any change (and right after loading).
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => generate(0, "auto"), 250);
    return () => clearTimeout(t);
  }, [data, useColor, color, colorTolerance, budget, margin, slots, statTrak, souvenir]);

  function swap(slotId: string, candidate: Candidate, andRebalance: boolean) {
    if (!data || !request || !kit) return;
    track("swap_item", { slot: slotId, rebalance: andRebalance });
    if (andRebalance) {
      const req: KitRequest = { ...request, slots: request.slots.map((s) => (s.slot.id === slotId ? { ...s, lockedItemId: candidate.itemId } : s)) };
      run(req, seed, () => rebalance(request, data.candidates, slotId, candidate.itemId));
    } else {
      setKit(replacePick(request, kit, slotId, candidate));
      setOpen(null);
    }
  }

  const set = <K extends keyof SlotChoices>(key: K, value: SlotChoices[K]) => setChoices((c) => ({ ...c, [key]: value }));

  const state = useMemo(() => {
    if (!kit || !result) return null;
    const edge = (result.bandMaxCents - kit.budgetCents) * 0.8;
    const out = kit.totalCents < result.bandMinCents || kit.totalCents > result.bandMaxCents;
    const near = !out && (kit.totalCents > kit.budgetCents + edge || kit.totalCents < result.bandMinCents + (kit.budgetCents - result.bandMinCents) * 0.2);
    return out ? { cls: "out", text: "Fora da margem" } : near ? { cls: "near", text: "No limite da margem" } : { cls: "ok", text: "Dentro do orçamento" };
  }, [kit, result]);

  return (
    <Page>
      <Header />

      <main className="builder">
        <section className="panel controls" aria-label="Opções do kit">
          <div className="control">
            <label htmlFor="budget" className="control-label">Orçamento</label>
            <div className={`money-input${budget === null ? " invalid" : ""}`}>
              <span aria-hidden="true">R$</span>
              <input id="budget" type="text" inputMode="decimal" autoComplete="off" enterKeyHint="done" value={budgetText}
                aria-describedby="budget-hint" aria-invalid={budget === null}
                onChange={(e) => setBudgetText(cleanBudgetInput(e.target.value))} />
            </div>
            <p id="budget-hint" className="hint">{budget === null ? "Digite um valor, por exemplo 250 ou 1.500,00." : `Margem de ±${margin}%: de ${money(Math.round(budget * 100 * (1 - Math.max(margin, 5) / 100)))} a ${money(Math.floor(budget * 100 * (1 + margin / 100)))}.`}</p>
          </div>

          <div className="control">
            <div className="control-row">
              <span className="control-label">Cor</span>
              <button type="button" className="chip small" aria-pressed={!useColor} onClick={() => setUseColor(!useColor)}>Sem preferência</button>
            </div>
            <div className={`colors${useColor ? "" : " off"}`}>
              {PRESETS.map(([name, hex]) => (
                <button key={hex} type="button" title={name} aria-label={name} aria-pressed={useColor && color === hex}
                  className="swatch" style={{ background: hex }} onClick={() => { setUseColor(true); setColor(hex); }} />
              ))}
              <label className="swatch custom" title="Outra cor">
                <span className="sr-only">Outra cor</span>
                <input type="color" value={color} onChange={(e) => { setUseColor(true); setColor(e.target.value); }} />
              </label>
            </div>
          </div>

          <div className="control">
            <span className="control-label" id="items-label">Itens do kit</span>
            <div className="chips" role="group" aria-labelledby="items-label">
              <Toggle label="Faca" on={choices.knife} onChange={(v) => set("knife", v)} />
              <Toggle label="Luvas" on={choices.gloves} onChange={(v) => set("gloves", v)} />
              <Toggle label="AK-47" on={choices.ak47} onChange={(v) => set("ak47", v)} />
              <Toggle label="M4" on={choices.m4 !== "off"} onChange={(v) => set("m4", v ? "any" : "off")} />
              <Toggle label="AWP" on={choices.awp} onChange={(v) => set("awp", v)} />
              <Toggle label="Desert Eagle" on={choices.deagle} onChange={(v) => set("deagle", v)} />
              <Toggle label="Pistola" on={choices.pistol !== "off"} onChange={(v) => set("pistol", v ? "any" : "off")} />
            </div>
            {choices.m4 !== "off" && <Segmented label="Qual M4" options={M4_OPTIONS} value={choices.m4} onChange={(v) => set("m4", v)} />}
            {choices.pistol !== "off" && <Segmented label="Qual pistola" options={PISTOL_OPTIONS} value={choices.pistol} onChange={(v) => set("pistol", v)} />}
          </div>

          <details className="more">
            <summary>Mais opções</summary>
            <label className="field">
              <span>Tolerância de cor <em>{colorTolerance <= 0.25 ? "estrita" : colorTolerance >= 0.75 ? "livre" : "média"}</em></span>
              <input type="range" min={0} max={1} step={0.05} value={colorTolerance} onChange={(e) => setColorTolerance(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Margem do orçamento <em>±{margin}%</em></span>
              <input type="range" min={0} max={30} step={1} value={margin} onChange={(e) => setMargin(Number(e.target.value))} />
            </label>
            <label className="row"><input type="checkbox" checked={statTrak} onChange={(e) => setStatTrak(e.target.checked)} /><span>Aceitar StatTrak™</span></label>
            <label className="row"><input type="checkbox" checked={souvenir} onChange={(e) => setSouvenir(e.target.checked)} /><span>Aceitar Souvenir</span></label>
          </details>

          <div className="actions">
            <button type="button" className="primary" disabled={!data || budget === null}
              onClick={() => { generate(0, "button"); resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
              Montar kit
            </button>
            <button type="button" disabled={!data || !kit || budget === null} onClick={() => generate(seed + 1, "another")}>Outra combinação</button>
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
              </>
            )}
          </p>
        </section>

        <section className="result" aria-label="Kit montado" ref={resultRef}>
          {load.status === "loading" && <Skeleton />}
          {load.status === "error" && <p className="problem" role="alert">Não foi possível carregar os dados agora. Tente recarregar a página.</p>}
          {result?.problem && <p className="problem" role="alert">{problemText(result.problem)}</p>}
          {kit && state && (
            <>
              <div className={`total ${state.cls}`} id="total">
                <span className="total-label">TOTAL DO KIT</span>
                <strong>{money(kit.totalCents)}</strong>
                <span>{delta(kit.totalCents - kit.budgetCents)} em relação ao orçamento · <span className="total-state">{state.text}</span></span>
                <span className="muted">Harmonia de cor {Math.round(kit.colorHarmony * 100)}%{elapsed !== null && ` · montado em ${elapsed} ms`}</span>
              </div>
              <div className="cards">
                {kit.picks.map((pick) => {
                  const info = data!.info.get(pick.candidate.itemId);
                  const alts = alternativesFor(result!, kit, pick.slotId);
                  const isOpen = open === pick.slotId;
                  return (
                    <article key={pick.slotId} className="card" style={{ ["--rarity" as string]: info?.rarityColor ?? "#b0c3d9" }}>
                      <span className="slot">{slotLabel(pick.slotId)}</span>
                      <div className="card-img">
                        {info?.imageUrl && (
                          <img src={info.imageUrl} alt={pick.candidate.name} width={256} height={192} loading="lazy" decoding="async"
                            onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                        )}
                      </div>
                      <div className="card-body">
                        <h2>{pick.candidate.name}</h2>
                        <span className="rarity">{info?.rarityName}</span>
                        <strong className="price">{money(pick.effectivePriceCents)}</strong>
                      </div>
                      <div className="card-actions">
                        <button type="button" aria-expanded={isOpen} aria-controls={`alts-${pick.slotId}`} disabled={alts.length === 0}
                          onClick={() => { if (!isOpen) track("open_alternatives", { slot: pick.slotId }); setOpen(isOpen ? null : pick.slotId); }}>
                          {alts.length === 0 ? "Sem alternativas" : `Alternativas (${alts.length})`}
                        </button>
                        {info && (
                          <a href={marketUrl(info.marketHashName)} target="_blank" rel="noreferrer"
                            onClick={() => track("view_market", { slot: pick.slotId })}>Ver no Mercado</a>
                        )}
                      </div>
                      {isOpen && (
                        <ul className="alts" id={`alts-${pick.slotId}`}>
                          {alts.map((a) => (
                            <li key={a.candidate.itemId}>
                              <div className="alt-info">
                                <span>{a.candidate.name}</span>
                                <span className="alt-price">{money(a.effectivePriceCents)} <b className={a.deltaCents < 0 ? "down" : "up"}>{delta(a.deltaCents)}</b></span>
                              </div>
                              <div className="alt-actions">
                                <button type="button" onClick={() => swap(pick.slotId, a.candidate, false)}>Trocar</button>
                                <button type="button" onClick={() => swap(pick.slotId, a.candidate, true)}>Trocar e rebalancear</button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  );
                })}
              </div>
              {result && result.alternativeKits.length > 0 && (
                <section className="suggestions" aria-label="Outras sugestões">
                  <h2 className="suggestions-title">Outras sugestões</h2>
                  <ol>
                    {[...(result.best ? [result.best] : []), ...result.alternativeKits]
                      .map((k, i) => ({ k, i: i - 1 }))
                      .filter(({ k }) => k !== kit)
                      .map(({ k, i }) => (
                        <li key={k.picks.map((p) => p.candidate.itemId).join("|")}>
                          <div className="sugg-thumbs" aria-hidden="true">
                            {k.picks.map((p) => {
                              const im = data!.info.get(p.candidate.itemId)?.imageUrl;
                              return im ? <img key={p.slotId} src={im} alt="" width={64} height={48} loading="lazy" decoding="async" /> : null;
                            })}
                          </div>
                          <div className="sugg-text">
                            <strong>{money(k.totalCents)}</strong>
                            <span>{k.picks.map((p) => p.candidate.name.replace(/ \([^)]*\)$/, "")).join(" · ")}</span>
                          </div>
                          <button type="button" onClick={() => (i < 0 ? (setKit(result.best), setOpen(null)) : applySuggestedKit(i))}>Usar este kit</button>
                        </li>
                      ))}
                  </ol>
                </section>
              )}
            </>
          )}
        </section>
      </main>

      {kit && (
        <div className="mobile-bar" aria-hidden="true">
          <a href="#total" className="mobile-total" tabIndex={-1}>{money(kit.totalCents)}</a>
          <button type="button" tabIndex={-1} disabled={!data || budget === null} onClick={() => generate(seed + 1, "another")}>Outra combinação</button>
        </div>
      )}

      <Footer />
    </Page>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" className="chip" aria-pressed={on} onClick={() => onChange(!on)}>{label}</button>;
}

function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string; options: [T, string][]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      <span className="segmented-label">{label}</span>
      <div className="segmented-options">
        {options.map(([v, text]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{text}</button>
        ))}
      </div>
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
            <div className="sk-price" />
          </div>
        ))}
      </div>
    </div>
  );
}
