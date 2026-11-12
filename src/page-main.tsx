// Entry for the static pages (/termos, /privacidade, 404).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initAnalytics } from "./analytics";
import { Footer, Header, Page } from "./Layout";
import { LegalPage, NotFound } from "./Legal";
import "./styles.css";

const root = document.getElementById("root")!;
const page = root.dataset.page;
initAnalytics();

createRoot(root).render(
  <StrictMode>
    <Page>
      <Header titleTag="p" />
      {page === "termos" || page === "privacidade" ? <LegalPage page={page} /> : <NotFound />}
      <Footer />
    </Page>
  </StrictMode>,
);
