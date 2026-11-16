import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

const prices = readFileSync(new URL("./fixtures/prices.json", import.meta.url));
const INK = "rgb(18, 18, 18)";

test.beforeEach(async ({ page }) => {
  await page.route("**/rest/v1/rpc/prices_snapshot", (r) => r.fulfill({ contentType: "application/json", body: prices }));
  await page.route("**/economy/image/**", (r) => r.fulfill({ contentType: "image/png", body: readFileSync("public/favicon-32.png") }));
  await page.route("**/market_listings/**", (r) => r.fulfill({ contentType: "image/png", body: readFileSync("public/og-image.png") }));
  await page.route("**/functions/v1/inspect-link?**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(listingView(r.request().url())) }));
});

/** Mock of the inspect-link function: 4 renders (3 for gloves) and a certificate per item. */
function listingView(url: string) {
  const name = new URL(url).searchParams.get("name") ?? "";
  const id = encodeURIComponent(name).replace(/%/g, "");
  const n = /Gloves|Wraps/.test(name) ? 3 : 4;
  return {
    link: `steam://run/730//+csgo_econ_action_preview%20${id.length.toString(16).toUpperCase()}ABCDEF`,
    views: Array.from({ length: n }, (_, i) => `https://shared.akamai.steamstatic.com/market_listings/ea/730/${id}/${i}_1.avif`),
    float: 0.123456789, pattern: 594, listings: 20,
  };
}

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1366) < 860;
const press = async (page: Page, el: Locator) => (isPhone(page) ? el.tap() : el.click());
const bg = (el: Locator) => el.evaluate((e) => getComputedStyle(e).backgroundColor);
const total = (page: Page) => page.locator("#total strong");
const cardNames = (page: Page) => page.locator(".card h2").allInnerTexts();
const slotLabels = (page: Page) => page.locator(".card .slot").allInnerTexts();

async function openBuilder(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("/");
  await expect(total(page)).toHaveText(/^R\$ /);
  return errors;
}

test("first view shows a real kit with images, alt text and no errors", async ({ page }) => {
  const errors = await openBuilder(page);
  await expect(page.locator(".card")).toHaveCount(5);
  for (const img of await page.locator(".card-img img").all()) expect((await img.getAttribute("alt"))!.length).toBeGreaterThan(5);
  await expect(page.locator(".status")).toContainText("itens com preço");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  expect(errors).toEqual([]);
});

test("item chips toggle on and off and do not look selected when off", async ({ page }) => {
  await openBuilder(page);
  await page.locator("#budget").fill("5000");
  await expect(total(page)).toHaveText(/R\$ [45]\.\d{3},\d{2}/);
  const knife = page.getByRole("button", { name: "Faca", exact: true });
  await press(page, knife);
  await expect(knife).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".card")).toHaveCount(6);
  await press(page, knife);
  await expect(knife).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".card")).toHaveCount(5);
  // The pointer is still over the chip (desktop hover / phone "sticky hover"): it must not turn black.
  await knife.hover();
  expect(await bg(knife)).not.toBe(INK);
  // Selected and not selected must look different even while hovered.
  const ak = page.getByRole("button", { name: "AK-47", exact: true });
  await ak.hover();
  expect(await bg(ak)).toBe(INK);
});

test("color swatches keep their color, select one at a time and 'Sem preferência' turns color off", async ({ page }) => {
  await openBuilder(page);
  const blue = page.getByRole("button", { name: "Azul", exact: true });
  await press(page, blue);
  await expect(blue).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Vermelho", exact: true })).toHaveAttribute("aria-pressed", "false");
  expect(await bg(blue)).toBe("rgb(30, 136, 229)");
  const none = page.getByRole("button", { name: "Sem preferência" });
  await press(page, none);
  await expect(none).toHaveAttribute("aria-pressed", "true");
  await expect(blue).toHaveAttribute("aria-pressed", "false");
  await press(page, page.getByRole("button", { name: "Verde", exact: true }));
  await expect(none).toHaveAttribute("aria-pressed", "false");
});

test("custom color input switches the kit to that color", async ({ page }) => {
  await openBuilder(page);
  await page.locator('.swatch.custom input[type="color"]').fill("#2e9e4f");
  await expect(page.getByRole("button", { name: "Verde", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("M4 and pistol choices: specific weapon, both or none", async ({ page }) => {
  await openBuilder(page);
  const m4 = page.getByRole("radiogroup", { name: "Qual M4" });
  await press(page, m4.getByRole("radio", { name: "As duas" }));
  await expect.poll(() => slotLabels(page)).toEqual(expect.arrayContaining(["M4A4", "M4A1-S"]));
  await press(page, m4.getByRole("radio", { name: "M4A1-S" }));
  await expect.poll(() => slotLabels(page)).not.toContain("M4A4");
  expect(await slotLabels(page)).toContain("M4A1-S");
  const radio = m4.getByRole("radio", { name: "M4A4" });
  expect(await bg(radio)).not.toBe(INK); // not checked, so not dark
  const pistol = page.getByRole("radiogroup", { name: "Qual pistola" });
  await press(page, pistol.getByRole("radio", { name: "Glock-18" }));
  await expect.poll(() => slotLabels(page)).toContain("GLOCK-18");
  await press(page, page.getByRole("button", { name: "M4", exact: true }));
  await expect(m4).toHaveCount(0);
  await expect.poll(async () => (await slotLabels(page)).some((s) => s.startsWith("M4"))).toBe(false);
});

test("budget field can be cleared, rejects junk and accepts 1.500,00", async ({ page }) => {
  await openBuilder(page);
  const budget = page.locator("#budget");
  await budget.fill("");
  await expect(page.locator("#budget-hint")).toContainText("Digite um valor");
  await expect(page.locator(".actions .primary")).toBeDisabled();
  await budget.pressSequentially("1.500,00");
  await expect(budget).toHaveValue("1.500,00");
  await expect(page.locator(".actions .primary")).toBeEnabled();
  await expect(total(page)).toHaveText(/R\$ 1\.\d{3},\d{2}/);
  await budget.fill("abc");
  await expect(budget).toHaveValue("");
});

test("more options open and their controls work", async ({ page }) => {
  await openBuilder(page);
  await press(page, page.locator(".more summary"));
  await expect(page.locator(".more")).toHaveAttribute("open", "");
  const margin = page.locator('.more input[type="range"]').nth(1);
  await margin.fill("20");
  await expect(page.locator("#budget-hint")).toContainText("±20%");
  const st = page.getByLabel("Aceitar StatTrak™");
  await st.check();
  await expect(st).toBeChecked();
});

test("'Montar kit' and 'Outra combinação' give a different kit each time", async ({ page }) => {
  await openBuilder(page);
  const first = await cardNames(page);
  await press(page, page.locator(".actions button", { hasText: "Outra combinação" }));
  await expect.poll(() => cardNames(page)).not.toEqual(first);
  const second = await cardNames(page);
  await press(page, page.locator(".actions button", { hasText: "Outra combinação" }));
  await expect.poll(() => cardNames(page)).not.toEqual(second);
  await press(page, page.locator(".actions .primary"));
  await expect.poll(() => cardNames(page)).toEqual(first);
});

test("alternatives open and close, swap one piece and swap with rebalance", async ({ page }) => {
  await openBuilder(page);
  const card = page.locator(".card").nth(2);
  const toggle = card.locator(".card-actions button");
  await press(page, toggle);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const option = card.locator(".alts li").first();
  const optionName = await option.locator(".alt-info span").first().innerText();
  const before = await total(page).innerText();
  await press(page, option.getByRole("button", { name: "Trocar", exact: true }));
  await expect(card.locator("h2")).toHaveText(optionName);
  await expect(total(page)).not.toHaveText(before);
  await press(page, toggle);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await press(page, toggle);
  await expect(card.locator(".alts")).toHaveCount(0);
  await press(page, toggle);
  const rebalanced = card.locator(".alts li").first();
  const rebalancedName = await rebalanced.locator(".alt-info span").first().innerText();
  await press(page, rebalanced.getByRole("button", { name: "Trocar e rebalancear" }));
  await expect(card.locator("h2")).toHaveText(rebalancedName);
  await expect(page.locator("#total .total-state")).toHaveText(/orçamento|margem/);
});

test("suggested kits can be applied", async ({ page }) => {
  await openBuilder(page);
  const items = page.locator(".suggestions li");
  await expect(items.first()).toBeVisible();
  const suggestedTotal = await items.first().locator(".sugg-text strong").innerText();
  await press(page, items.first().getByRole("button", { name: "Usar este kit" }));
  await expect(total(page)).toHaveText(suggestedTotal);
});

test("market links point to the Steam listing in a new tab", async ({ page }) => {
  await openBuilder(page);
  const link = page.locator(".card-actions a").first();
  await expect(link).toHaveAttribute("href", /^https:\/\/steamcommunity\.com\/market\/listings\/730\//);
  await expect(link).toHaveAttribute("target", "_blank");
});

test("phone bar shows the total and asks for another combination; hidden on desktop", async ({ page }) => {
  await openBuilder(page);
  const bar = page.locator(".mobile-bar");
  if (!isPhone(page)) {
    await expect(bar).toBeHidden();
    return;
  }
  await expect(bar).toBeVisible();
  await expect(bar.locator(".mobile-total")).toHaveText(await total(page).innerText());
  const first = await cardNames(page);
  await bar.getByRole("button", { name: "Outra combinação" }).tap();
  await expect.poll(() => cardNames(page)).not.toEqual(first);
  await expect(bar.locator(".mobile-total")).toHaveText(await total(page).innerText());
});

test("keyboard: chips, swatches and options work with Tab, Space and Enter", async ({ page }) => {
  test.skip(isPhone(page), "keyboard checked on desktop");
  await openBuilder(page);
  const gloves = page.getByRole("button", { name: "Luvas", exact: true });
  await gloves.focus();
  await page.keyboard.press("Space");
  await expect(gloves).toHaveAttribute("aria-pressed", "true");
  const pink = page.getByRole("button", { name: "Rosa", exact: true });
  await pink.focus();
  await page.keyboard.press("Enter");
  await expect(pink).toHaveAttribute("aria-pressed", "true");
  expect(await pink.evaluate((e) => getComputedStyle(e).outlineStyle)).not.toBe("none");
});

test("footer links, legal pages, back link and the 404 page", async ({ page }) => {
  await openBuilder(page);
  await press(page, page.getByRole("link", { name: "Termos de Uso" }));
  await expect(page).toHaveURL(/\/termos$/);
  await expect(page.locator("h1")).toHaveText("Termos de Uso");
  await press(page, page.getByRole("link", { name: "Política de Privacidade" }));
  await expect(page.locator("h1")).toHaveText("Política de Privacidade");
  await press(page, page.getByRole("link", { name: "Voltar para o montador" }));
  await expect(total(page)).toHaveText(/^R\$ /);
  const missing = await page.goto("/nao-existe");
  expect(missing?.status()).toBe(404);
  await expect(page.locator("h1")).toHaveText("Página não encontrada");
  await press(page, page.getByRole("link", { name: "Montar um kit" }));
  await expect(total(page)).toHaveText(/^R\$ /);
});

test("old hash links redirect to the real legal pages", async ({ page }) => {
  await page.goto("/#privacidade");
  await expect(page).toHaveURL(/\/privacidade$/);
});

test("no vibe-coded patterns: shadows, gradients, blur, rounded corners or pure white", async ({ page }) => {
  await openBuilder(page);
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      const tag = `${el.tagName.toLowerCase()}.${(el as HTMLElement).className}`;
      if (cs.boxShadow !== "none") out.push("shadow " + tag);
      if (cs.textShadow !== "none") out.push("text-shadow " + tag);
      if (/gradient/.test(cs.backgroundImage)) out.push("gradient " + tag);
      if (cs.backdropFilter && cs.backdropFilter !== "none") out.push("blur " + tag);
      if (el.tagName !== "INPUT" && parseFloat(cs.borderTopLeftRadius) > 0) out.push("rounded " + tag);
      if (cs.backgroundColor === "rgb(255, 255, 255)") out.push("white " + tag);
    }
    if (/—/.test(document.body.innerText)) out.push("em dash in text");
    return out;
  });
  expect(bad).toEqual([]);
});

test("inspect panel: switch items, views, turn, inspect and open in game", async ({ page }) => {
  const errors = await openBuilder(page);
  const panel = page.locator(".inspector");
  await panel.scrollIntoViewIfNeeded();
  const stage = panel.locator(".stage");
  const switches = panel.locator(".inspector-switch button");
  await expect(switches).toHaveCount(5);
  await expect(switches.first()).toHaveAttribute("aria-pressed", "true");
  const names = await cardNames(page);
  for (const [i, b] of (await switches.all()).entries()) expect(names[i].startsWith((await b.innerText()).replace(/^\d+\s*/, ""))).toBe(true);
  // Starts in hand, like the game, with the official link and the listing's float and pattern.
  await expect(panel.getByRole("radio", { name: "Na mão" })).toHaveAttribute("aria-checked", "true");
  await expect(stage.locator("img.on")).toHaveAttribute("src", /\/3_1\.avif$/);
  await expect(panel.getByRole("link", { name: "Inspecionar no jogo" })).toHaveAttribute("href", /^steam:\/\/run\/730\/\/\+csgo_econ_action_preview%20[0-9A-F]+$/);
  await expect(panel.locator(".inspector-stats")).toHaveText("Float 0,123457 · Padrão 594");
  const firstName = await panel.locator(".inspector-info strong").innerText();
  expect(await cardNames(page)).toContain(firstName);

  // Views.
  await press(page, panel.getByRole("radio", { name: "Esquerda" }));
  await expect(stage.locator("img.on")).toHaveAttribute("src", /\/1_1\.avif$/);
  await expect(stage.locator(".stage-tag")).toHaveText("Esquerda");

  // Switch to the second item: the panel follows it and the view goes back to the hand.
  await press(page, switches.nth(1));
  await expect(switches.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(panel.locator(".inspector-info strong")).toHaveText((await cardNames(page))[1]);
  await expect(stage.locator("img.on")).toHaveAttribute("src", /\/3_1\.avif$/);

  // Keyboard: arrows turn, F inspects, numbers switch.
  await stage.focus();
  await page.keyboard.press("ArrowRight");
  await expect(stage.locator(".stage-tag")).toHaveText("3/4");
  await page.keyboard.press("ArrowRight");
  await expect(stage.locator(".stage-tag")).toHaveText("Direita");
  await page.keyboard.press("f");
  await expect(stage).toHaveClass(/inspecting/);
  await expect(stage).not.toHaveClass(/inspecting/, { timeout: 10_000 });
  await expect(stage.locator(".stage-tag")).toHaveText("Na mão");
  await page.keyboard.press("3");
  await expect(switches.nth(2)).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  expect(errors).toEqual([]);
});

test("inspect panel: dragging turns the item", async ({ page }) => {
  await openBuilder(page);
  const stage = page.locator(".inspector .stage");
  await stage.scrollIntoViewIfNeeded();
  await expect(stage.locator(".stage-tag")).toHaveText("Na mão");
  const box = (await stage.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 90, y, { steps: 6 });
  await page.mouse.up();
  await expect(stage.locator(".stage-tag")).toHaveText("3/4");
});

test("inspect panel: gloves have no in-hand view and a failed lookup can be retried", async ({ page }) => {
  let fail = true;
  await page.route("**/functions/v1/inspect-link?**", (r) => {
    if (fail && /Desert/.test(r.request().url())) return r.fulfill({ status: 503, contentType: "application/json", body: '{"error":"steam_rate_limited"}' });
    return r.fulfill({ contentType: "application/json", body: JSON.stringify(listingView(r.request().url())) });
  });
  await openBuilder(page);
  await page.locator("#budget").fill("5000");
  await press(page, page.getByRole("button", { name: "Luvas", exact: true }));
  await expect(page.locator(".card")).toHaveCount(6);
  const panel = page.locator(".inspector");
  await panel.scrollIntoViewIfNeeded();
  const switchFor = async (slot: string) => panel.locator(".inspector-switch button").nth((await slotLabels(page)).indexOf(slot));
  await expect(panel.locator(".inspector-switch button")).toHaveCount(6);
  await press(page, await switchFor("LUVAS"));
  await expect(panel.getByRole("radio", { name: "Na mão" })).toBeDisabled();
  await expect(panel.getByRole("radio", { name: "3/4" })).toHaveAttribute("aria-checked", "true");

  await press(page, await switchFor("DESERT EAGLE"));
  await expect(panel.locator(".inspector-error")).toContainText("A Steam pediu uma pausa");
  await expect(panel.locator(".stage-fallback img")).toBeVisible();
  await expect(panel.locator(".button-link.disabled")).toHaveText("Inspecionar no jogo");
  fail = false;
  await press(page, panel.getByRole("button", { name: "Tentar de novo" }));
  await expect(panel.locator(".inspector-error")).toHaveCount(0);
  await expect(panel.getByRole("link", { name: "Inspecionar no jogo" })).toBeVisible();
});
