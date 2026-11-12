import { useEffect, useState, type ReactNode } from "react";
import { analyticsEnabled, getConsent, onConsentChange, setConsent, type Consent } from "./analytics";
import { REPO_URL } from "./site";

export function Header({ titleTag = "h1" }: { titleTag?: "h1" | "p" }) {
  const Title = titleTag;
  return (
    <header>
      <a href="/" className="home-link">
        <Title className="brand">
          <span className="h-line">CS2</span>
          <span className="h-line h-kit">KIT</span>
          <span className="h-line h-builder">BUILDER</span>
        </Title>
      </a>
      <p className="tagline">Diga quanto quer gastar e a cor que quer. <mark>O kit vem montado</mark>, com alternativas para cada peça.</p>
    </header>
  );
}

export function Footer() {
  return (
    <footer>
      <p>
        CS2 Kit Builder é um projeto independente e sem fins comerciais. Não é afiliado, patrocinado nem endossado pela Valve Corporation.
        Counter-Strike, Counter-Strike 2, Steam, os logotipos e as imagens dos itens são marcas e/ou propriedade da Valve Corporation.
        Todos os direitos sobre esses itens pertencem aos seus respectivos titulares. Preços são estimativas obtidas do Mercado da
        Comunidade Steam e podem estar desatualizados.
      </p>
      <p>Catálogo: ByMykel/CSGO-API (MIT). Sem login e sem anúncios.</p>
      <nav className="legal-links" aria-label="Documentos">
        <a href="/termos">Termos de Uso</a>
        <a href="/privacidade">Política de Privacidade</a>
        {analyticsEnabled() && (
          <button type="button" className="link-button" onClick={() => window.dispatchEvent(new Event("cs2kb-open-consent"))}>
            Preferências de cookies
          </button>
        )}
        <a href={REPO_URL} target="_blank" rel="noreferrer">Código-fonte</a>
      </nav>
    </footer>
  );
}

/** LGPD consent for analytics. Shown only when analytics is configured and no choice was made. */
export function ConsentBanner() {
  const [consent, setLocal] = useState<Consent>(() => getConsent());
  const [forced, setForced] = useState(false);
  useEffect(() => onConsentChange((c) => { setLocal(c); setForced(false); }), []);
  useEffect(() => {
    const open = () => setForced(true);
    window.addEventListener("cs2kb-open-consent", open);
    return () => window.removeEventListener("cs2kb-open-consent", open);
  }, []);
  if (!analyticsEnabled() || (consent !== null && !forced)) return null;
  return (
    <section className="consent" role="dialog" aria-label="Cookies de estatística" aria-live="polite">
      <p>
        Usamos o Google Analytics para contar visitas e saber quais opções do montador são usadas, sem dados que identifiquem você.
        Ele só é ativado se você aceitar. <a href="/privacidade">Saiba mais</a>.
      </p>
      <div className="consent-actions">
        <button type="button" className="primary" onClick={() => setConsent("granted")}>Aceitar</button>
        <button type="button" onClick={() => setConsent("denied")}>Recusar</button>
      </div>
    </section>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      {children}
      <ConsentBanner />
    </div>
  );
}
