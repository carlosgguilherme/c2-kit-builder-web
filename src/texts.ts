import type { Infeasibility, Suggestion } from "./engine/types";

export const SLOT_LABEL: Record<string, string> = {
  knife: "Faca", gloves: "Luvas", ak47: "AK-47", m4: "M4A4 / M4A1-S", awp: "AWP", deagle: "Desert Eagle", pistol: "USP-S / Glock-18",
};

const SUGGESTION: Record<Suggestion, string> = {
  IncreaseBudget: "aumentar o orçamento", DecreaseBudget: "diminuir o orçamento", DisableSlot: "desligar esse item",
  RelaxColor: "afrouxar a cor", AllowStatTrakOrSouvenir: "aceitar StatTrak ou Souvenir",
  RelaxExteriorOrFloat: "afrouxar exterior ou float", AddSlots: "adicionar itens ao kit",
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "R$ 1.234,56" */
export const money = (cents: number) => brl.format(cents / 100).replace(/ /g, " ");

/** "+R$ 23,40" / "−R$ 5,00" */
export const delta = (cents: number) => (cents < 0 ? "−" : "+") + money(Math.abs(cents));

export const slotLabel = (id: string) => SLOT_LABEL[id] ?? id;

/** Human message for an engine problem (same wording as the Windows app). */
export function problemText(p: Infeasibility): string {
  const slot = p.slotId ? slotLabel(p.slotId) : "";
  let text: string;
  switch (p.reason) {
    case "NoSlots":
      text = "Escolha pelo menos um item para o kit.";
      break;
    case "LockedItemUnavailable":
      text = `A skin travada em ${slot} não está disponível.`;
      break;
    case "NoCandidatesForSlot":
      text = `Não encontrei nenhuma skin para ${slot} com esses filtros.`
        + (p.cheapestIgnoringColorCents != null ? ` Sem o filtro de cor, a mais barata custa ${money(p.cheapestIgnoringColorCents)}.` : "");
      break;
    case "BudgetTooLow":
      text = (p.slotId && p.cheapestCents != null
        ? `O orçamento não cobre ${slot}: a opção mais barata no tom escolhido custa ${money(p.cheapestCents)}.`
        : "O orçamento é baixo para este kit.")
        + (p.minimumTotalCents != null ? ` O kit mais barato possível custa ${money(p.minimumTotalCents)}.` : "");
      break;
    case "BudgetTooHigh":
      return `Não dá para gastar todo o orçamento: o kit mais caro possível custa ${money(p.boundCents ?? 0)}. Este é o melhor kit encontrado.`;
  }
  if (p.suggestions.length > 0) text += " Tente: " + p.suggestions.map((s) => SUGGESTION[s]).join(", ") + ".";
  return text;
}
