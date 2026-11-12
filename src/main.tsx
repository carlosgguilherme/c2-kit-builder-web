import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initAnalytics } from "./analytics";
import "./styles.css";

// Old links used hash routes (#termos, #privacidade): send them to the real pages.
const legacy: Record<string, string> = { "#termos": "/termos", "#privacidade": "/privacidade" };
if (legacy[window.location.hash]) {
  window.location.replace(legacy[window.location.hash]);
} else {
  initAnalytics();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
