import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { track } from "./analytics";
import {
  VIEW_LABEL, availableViews, defaultView, fetchListingView, formatFloat, inspectSequence, turn, viewUrl,
  type ListingView, type ViewKey,
} from "./inspect";

export interface InspectItem {
  slotId: string;
  slotLabel: string;
  name: string;
  marketHashName: string;
  imageUrl: string | null;
}

type Load = { status: "loading" } | { status: "ready"; data: ListingView } | { status: "error"; code: string };

const STEP_MS = 1100;
const DRAG_STEP_PX = 70;
const ERROR_TEXT: Record<string, string> = {
  steam_rate_limited: "A Steam pediu uma pausa. Tente de novo em alguns instantes.",
  unknown_item: "Este item ainda não está no cache de preços.",
};

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Inspect panel under the kit: Valve's own renders of a real market listing of each item (in hand,
 * 3/4, left, right), weapon switching with number keys, drag or arrows to turn the item, an inspect
 * sequence (F), and the official "Inspect in Game" link that opens the item in CS2.
 */
export function Inspector({ items }: { items: InspectItem[] }) {
  const [activeSlot, setActiveSlot] = useState(items[0]?.slotId ?? "");
  const [loads, setLoads] = useState<Record<string, Load>>({});
  const [view, setView] = useState<ViewKey | null>(null);
  const [drawKey, setDrawKey] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; id: number } | null>(null);

  const item = items.find((i) => i.slotId === activeSlot) ?? items[0];
  const load: Load | undefined = item ? loads[item.marketHashName] : undefined;
  const data = load?.status === "ready" ? load.data : null;
  const available = data ? availableViews(data) : [];
  const current: ViewKey | null = data && view && available.includes(view) ? view : data ? defaultView(data) : null;

  // Fetch only once the panel is on screen, so building kits never hits Steam by itself.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver !== "function") { setVisible(true); return; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !item || loads[item.marketHashName]) return;
    const name = item.marketHashName;
    setLoads((l) => ({ ...l, [name]: { status: "loading" } }));
    fetchListingView(name)
      .then((d) => setLoads((l) => ({ ...l, [name]: { status: "ready", data: d } })))
      .catch((e: unknown) => setLoads((l) => ({ ...l, [name]: { status: "error", code: e instanceof Error ? e.message : "error" } })));
  }, [visible, item?.marketHashName, loads]);

  // The inspect sequence steps through the views, then stops.
  useEffect(() => {
    if (!playing || !data) return;
    const seq = inspectSequence(available);
    if (seq.length < 2) { setPlaying(false); return; }
    let i = 0;
    setView(seq[0]);
    const timer = setInterval(() => {
      i += 1;
      if (i >= seq.length) { clearInterval(timer); setPlaying(false); return; }
      setView(seq[i]);
    }, reducedMotion() ? STEP_MS * 1.5 : STEP_MS);
    return () => clearInterval(timer);
  }, [playing, data]);

  if (!item) return null;

  function select(slotId: string) {
    if (slotId === item!.slotId) return;
    setPlaying(false);
    setView(null);
    setActiveSlot(slotId);
    setDrawKey((k) => k + 1);
    track("inspect_switch", { slot: slotId });
  }

  function choose(v: ViewKey) {
    setPlaying(false);
    setView(v);
  }

  function rotate(dir: -1 | 1) {
    if (!current) return;
    setPlaying(false);
    setView(turn(current, dir, available));
  }

  function inspect() {
    if (!data) return;
    track("inspect_play", { slot: item!.slotId });
    setPlaying(true);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= items.length) { e.preventDefault(); select(items[n - 1].slotId); return; }
    if (e.key === "f" || e.key === "F") { e.preventDefault(); inspect(); return; }
    if (e.target === stageRef.current && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      rotate(e.key === "ArrowLeft" ? -1 : 1);
    }
  }

  function setTilt(px: number) {
    stageRef.current?.style.setProperty("--tilt", `${Math.max(-1, Math.min(1, px / DRAG_STEP_PX)) * 14}deg`);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!data || e.button !== 0) return;
    drag.current = { x: e.clientX, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.classList.add("dragging");
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) >= DRAG_STEP_PX) {
      rotate(dx < 0 ? 1 : -1);
      d.x = e.clientX;
      setTilt(0);
    } else {
      setTilt(dx);
    }
  }

  function endDrag(e: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    e.currentTarget.classList.remove("dragging");
    setTilt(0);
  }

  const hint = `Teclas: 1 a ${items.length} trocam de item, F inspeciona, setas giram. Também dá para arrastar a imagem.`;

  return (
    <section className="inspector" aria-labelledby="inspector-title" ref={sectionRef} onKeyDown={onKeyDown}>
      <div className="inspector-head">
        <h2 id="inspector-title">Inspeção</h2>
        <div className="inspector-switch" role="group" aria-label="Item inspecionado">
          {items.map((it, i) => (
            <button key={it.slotId} type="button" aria-pressed={it.slotId === item.slotId} onClick={() => select(it.slotId)}
              aria-label={`Inspecionar ${it.slotLabel}`} aria-keyshortcuts={String(i + 1)}>
              <kbd aria-hidden="true">{i + 1}</kbd>{it.slotLabel}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={stageRef}
        className={`stage${playing ? " inspecting" : ""}${data ? " ready" : ""}`}
        tabIndex={0}
        role="group"
        aria-roledescription="visualizador"
        aria-label={`${item.name}${current ? `, vista ${VIEW_LABEL[current]}` : ""}. Arraste ou use as setas para girar.`}
        aria-describedby="inspector-hint"
        aria-busy={load?.status === "loading" || !load}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {(!load || load.status === "loading") && <div className="stage-skeleton" />}
        {load?.status === "error" && (
          <div className="stage-fallback">
            {item.imageUrl && <img src={item.imageUrl} alt={item.name} width={256} height={192} draggable={false} />}
          </div>
        )}
        {data && data.views.length === 0 && (
          <div className="stage-fallback">
            {item.imageUrl && <img src={item.imageUrl} alt={item.name} width={256} height={192} draggable={false} />}
          </div>
        )}
        {data && data.views.length > 0 && (
          <div key={`${item.marketHashName}-${drawKey}`} className={`stage-views${current === "hand" ? " draw" : ""}`}>
            {available.map((k) => (
              <img
                key={k}
                src={viewUrl(data, k)!}
                alt={k === current ? `${item.name}, vista ${VIEW_LABEL[k]}` : ""}
                aria-hidden={k === current ? undefined : true}
                className={k === current ? "on" : undefined}
                width={1920}
                height={1080}
                decoding="async"
                draggable={false}
              />
            ))}
          </div>
        )}
        {current && <span className="stage-tag" aria-hidden="true">{VIEW_LABEL[current]}</span>}
      </div>

      <div className="inspector-bar">
        <div className="segmented-options views" role="radiogroup" aria-label="Vista">
          {(["hand", "angle", "left", "right"] as ViewKey[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={current === k} disabled={!available.includes(k)} onClick={() => choose(k)}>
              {VIEW_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="inspector-actions">
          <button type="button" onClick={inspect} disabled={!data || available.length < 2} aria-keyshortcuts="F">
            <kbd aria-hidden="true">F</kbd>Inspecionar
          </button>
          {data?.link ? (
            <a className="button-link primary" href={data.link} onClick={() => track("inspect_in_game", { slot: item.slotId })}>
              Inspecionar no jogo
            </a>
          ) : (
            <span className="button-link primary disabled" aria-disabled="true">Inspecionar no jogo</span>
          )}
        </div>
      </div>

      <div className="inspector-info">
        <strong>{item.name}</strong>
        {data && (data.float !== null || data.pattern !== null) && (
          <span className="inspector-stats">
            {data.float !== null && <>Float <b>{formatFloat(data.float)}</b></>}
            {data.pattern !== null && <> · Padrão <b>{data.pattern}</b></>}
          </span>
        )}
        {load?.status === "error" && (
          <p className="inspector-error" role="status">
            {ERROR_TEXT[load.code] ?? "Não deu para buscar as imagens da Steam agora."}{" "}
            <button type="button" className="link-button" onClick={() => setLoads((l) => { const n = { ...l }; delete n[item.marketHashName]; return n; })}>
              Tentar de novo
            </button>
          </p>
        )}
        <p className="hint">
          Imagens oficiais da Steam do anúncio mais barato deste item agora; float e padrão são desse exemplar.
          "Inspecionar no jogo" abre o CS2 pela Steam (precisa estar instalado).
        </p>
        <p className="hint" id="inspector-hint">
          <span className="hint-keys">{hint}</span>
          <span className="hint-touch">Arraste a imagem para girar o item.</span>
        </p>
      </div>
    </section>
  );
}
