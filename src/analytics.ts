// Google Analytics 4, loaded only after the visitor accepts (LGPD). No personal data is sent:
// events carry only kit options (budget range, number of items, color on/off) and slot names.
import { GA_ID } from "./site";

export type Consent = "granted" | "denied" | null;
const KEY = "cs2kb-analytics-consent";
type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window { dataLayer?: unknown[]; gtag?: Gtag }
}

let loaded = false;
const listeners = new Set<(c: Consent) => void>();

export const analyticsEnabled = () => GA_ID !== "";

export function getConsent(): Consent {
  if (!analyticsEnabled()) return "denied";
  try {
    const v = localStorage.getItem(KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(c: Exclude<Consent, null>) {
  try {
    localStorage.setItem(KEY, c);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  if (c === "granted") load();
  else if (loaded) window.gtag?.("consent", "update", { analytics_storage: "denied" });
  listeners.forEach((l) => l(c));
}

export function onConsentChange(l: (c: Consent) => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Starts analytics if the visitor already accepted on a previous visit. */
export function initAnalytics() {
  if (getConsent() === "granted") load();
}

function load() {
  if (loaded || !analyticsEnabled()) return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer!.push(arguments);
  };
  window.gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(s);
}

/** Sends a GA4 event when analytics is loaded; otherwise does nothing. */
export function track(name: string, params: Record<string, string | number | boolean> = {}) {
  if (loaded && window.gtag) window.gtag("event", name, params);
}

/** Budget bucket instead of the exact value. */
export function budgetRange(brl: number): string {
  if (brl < 100) return "0-99";
  if (brl < 500) return "100-499";
  if (brl < 2000) return "500-1999";
  if (brl < 10000) return "2000-9999";
  return "10000+";
}
