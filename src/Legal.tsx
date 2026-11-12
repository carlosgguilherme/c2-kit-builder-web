import { analyticsEnabled } from "./analytics";
import { REPO_URL as REPO } from "./site";

const UPDATED = "12 de novembro de 2026";

/** Terms of Use and Privacy Policy (pt-BR). Keep them in sync with what the site actually does. */
export function LegalPage({ page }: { page: "termos" | "privacidade" }) {
  return (
    <main className="legal-main">
      <article className="legal">
        <a className="back" href="/">Voltar para o montador</a>
        {page === "termos" ? <Terms /> : <Privacy />}
        <p className="legal-date">Última atualização: {UPDATED}.</p>
      </article>
    </main>
  );
}

export function NotFound() {
  return (
    <main className="legal-main">
      <article className="legal not-found">
        <p className="nf-code" aria-hidden="true">404</p>
        <h1>Página não encontrada</h1>
        <p>O endereço que você abriu não existe ou mudou de lugar.</p>
        <a className="back" href="/">Montar um kit</a>
      </article>
    </main>
  );
}

function Terms() {
  return (
    <>
      <h1>Termos de Uso</h1>
      <h3>O que é este site</h3>
      <p>
        O CS2 Kit Builder é uma ferramenta gratuita e sem fins comerciais que sugere combinações de skins de Counter-Strike 2
        a partir de um orçamento e de uma cor. Ele não vende, não compra e não intermedeia itens. Para comprar, você é levado ao
        Mercado da Comunidade Steam, sob os termos da Steam.
      </p>
      <h3>Preços</h3>
      <p>
        Os preços são estimativas copiadas periodicamente do Mercado da Comunidade Steam, convertidos para reais pela cotação
        implícita nos próprios preços da Steam. Eles podem estar desatualizados ou diferentes no momento da compra. Confira
        sempre o preço na Steam antes de comprar. Nenhuma sugestão do site é recomendação de investimento.
      </p>
      <h3>Sem vínculo com a Valve</h3>
      <p>
        Este é um projeto independente. Não é afiliado, patrocinado nem endossado pela Valve Corporation. Counter-Strike,
        Counter-Strike 2, Steam, os logotipos e as imagens dos itens são marcas e/ou propriedade da Valve Corporation.
      </p>
      <h3>Uso permitido</h3>
      <p>
        Você pode usar o site livremente para fins pessoais. Não use o site para sobrecarregar os serviços dele ou da Steam,
        por exemplo com acessos automatizados em massa.
      </p>
      <h3>Garantia</h3>
      <p>
        O site é oferecido como está, sem garantia de disponibilidade, precisão ou adequação a um propósito específico. As
        decisões de compra e venda são de responsabilidade de quem as toma.
      </p>
      <h3>Código e dados de terceiros</h3>
      <p>
        O código-fonte é aberto sob a licença PolyForm Noncommercial 1.0.0, que proíbe uso comercial. O catálogo de itens vem
        do projeto ByMykel/CSGO-API, sob licença MIT.
      </p>
      <h3>Mudanças e contato</h3>
      <p>
        Estes termos podem mudar; a data acima indica a versão em vigor. Dúvidas e problemas podem ser enviados pelas{" "}
        <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">issues do repositório</a>.
      </p>
    </>
  );
}

function Privacy() {
  return (
    <>
      <h1>Política de Privacidade</h1>
      <h3>O que o site guarda sobre você</h3>
      <p>
        Não há cadastro, login, formulário nem anúncios. As opções que você escolhe (cor, orçamento, itens) ficam apenas na página
        aberta e somem ao fechá-la.
        {analyticsEnabled()
          ? " A única informação guardada no seu navegador é a sua escolha sobre os cookies de estatística (aceitar ou recusar)."
          : " O site não usa cookies nem ferramentas de estatística."}
      </p>
      {analyticsEnabled() && (
        <>
          <h3>Estatísticas de uso (Google Analytics)</h3>
          <p>
            Se você aceitar no aviso de cookies, o site ativa o Google Analytics 4 para contar visitas e entender quais opções do
            montador são usadas: faixa de orçamento, quantidade de itens, se uma cor foi escolhida, quais itens foram trocados e
            cliques em "Ver no Mercado". Nenhum dado que identifique você é enviado pelo site; o endereço IP é tratado pelo Google
            conforme a política dele, com sinais de anúncios desativados. Se você recusar, o Google Analytics não é carregado.
            Você pode mudar a escolha a qualquer momento em "Preferências de cookies", no rodapé. A base legal é o seu
            consentimento (LGPD, art. 7º, I).
          </p>
        </>
      )}
      <h3>Serviços que recebem seu acesso</h3>
      <p>Ao abrir o site, o seu navegador se conecta diretamente a estes serviços, que recebem dados técnicos normais de qualquer acesso à internet, como endereço IP e tipo de navegador:</p>
      <ul>
        <li><strong>Vercel</strong>, que hospeda as páginas do site.</li>
        <li><strong>Supabase</strong>, que guarda a tabela de preços consultada pela página.</li>
        <li><strong>Steam (Valve)</strong>, de onde são carregadas as imagens das skins e para onde levam os links "Ver no Mercado".</li>
        {analyticsEnabled() && <li><strong>Google</strong>, somente se você aceitar as estatísticas de uso.</li>}
      </ul>
      <p>
        Esses serviços podem manter registros técnicos de acesso conforme as próprias políticas de privacidade. O site não envia
        a eles nenhum dado pessoal seu além do que o próprio acesso já envolve.
      </p>
      <h3>Seus direitos</h3>
      <p>
        O site não armazena dados pessoais, então não há dados seus para consultar, corrigir ou apagar aqui. Para dados mantidos
        pelos serviços acima, consulte as políticas de cada um.
      </p>
      <h3>Contato</h3>
      <p>
        Dúvidas sobre esta política podem ser enviadas pelas{" "}
        <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">issues do repositório</a>.
      </p>
    </>
  );
}
