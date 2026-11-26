import type { Metadata } from "next";
import Link from "next/link";
import styles from "./regras.module.css";
import { PLAN_PRICE } from "@/lib/plan";

export const metadata: Metadata = { title: "Regras e mapa do site" };

const areas = [
  {
    title: "Público",
    who: "Qualquer visitante",
    items: [
      "Início: proposta, como funciona, preço, perguntas frequentes",
      "Catálogo: busca e status de cada livro",
      "Encontros: lista e valores",
      "Assinar: cadastro, CEP e aceite das regras",
      "Regras e mapa do site (esta página)",
    ],
  },
  {
    title: "Área do assinante",
    who: "Exige login",
    items: [
      "Minha conta: livro atual, prazo e plano",
      "Reservas e fila de espera",
      "Agendar troca ou devolução (sábado)",
      "Histórico de leituras",
      "Endereço de entrega",
      "Inscrição em encontros",
    ],
  },
];

const fluxos = [
  { name: "Assinar", path: "Início → Assinar → confirmar e-mail → dados e endereço → aceite das regras → pagamento por cartão de crédito → Minha conta" },
  { name: "Reservar", path: "Catálogo → Livro → Reservar (ou entrar na fila) → confirmação → entrega no sábado de troca" },
  { name: "Devolver ou trocar", path: "Minha conta → Agendar → confirmação por e-mail. Pedidos de visita e cancelamentos de visita fecham na sexta-feira, às 08h." },
  { name: "Cancelar a assinatura", path: "Minha conta → Plano → Cancelar assinatura → confirmar. A cobrança para na hora; o acesso vai até o fim do período pago (sem reembolso do período já pago)." },
  { name: "Lembrete", path: "7, 3 e 1 dia antes do prazo: aviso por e-mail com link direto para Agendar" },
];

const regras = [
  { q: "Preço e frete", a: PLAN_PRICE + " por assinatura de 30 dias, com frete incluso." },
  { q: "Livros por assinante", a: "Um livro por vez." },
  { q: "Prazo e renovação", a: "Um livro por vez, por até 28 dias corridos ou troca aos sábados. Não há renovação automática." },
  { q: "Dia e horário de troca", a: "Trocas aos sábados, das 09h às 14h. Pedidos de visita e cancelamentos de visita fecham na sexta-feira, às 08h." },
  { q: "Atraso", a: "Não há multa. Com um livro atrasado, você não reserva nem recebe outro até devolvê-lo." },
  { q: "Lembretes", a: "Enviamos lembretes de devolução por e-mail 7, 3 e 1 dia antes do prazo." },
  {
    q: "Área de entrega",
    a: "Zona Sul do Rio: Leme/Copacabana; Glória/Catete/Flamengo/Laranjeiras; Botafogo/Humaitá/Urca; Ipanema/Arpoador/Leblon; Lagoa/Jardim Botânico/Gávea; São Conrado.",
  },
  { q: "Pagamento", a: "No cartão de crédito, pelo Mercado Pago. A assinatura renova sozinha a cada 30 dias até ser cancelada." },
  // POLÍTICA DE REEMBOLSO: a definir pelo Gabriel. Hoje o texto abaixo diz que NÃO há reembolso do período já pago
  // (a cobrança para na hora e o acesso segue até o fim do período). Se mudar, ajustar aqui, no FAQ da home e no aviso de /conta.
  { q: "Cancelamento da assinatura", a: "Você cancela quando quiser em Minha conta. A cobrança para na hora e o acesso continua até o último dia do período já pago; não há reembolso do período já pago. Depois disso, as reservas na fila são desfeitas e, para voltar, é preciso assinar de novo." },
  { q: "Pagamento recusado", a: "Se a cobrança for recusada, a assinatura fica em atraso e não dá para reservar até regularizar o pagamento." },
  { q: "Encontros presenciais", a: "Só para assinantes e cobrados à parte." },
  { q: "Dados pessoais", a: "Nome, endereço e WhatsApp são usados só para prestar o serviço, com seu consentimento (LGPD)." },
];

export default function RegrasPage() {
  return (
    <main id="conteudo" className={styles.wrap}>
      <div className={styles.head}>
        <h1 className={styles.title}>Regras e mapa do site</h1>
        <p className={styles.lead}>
          O que existe no Muitas Conversas, quem vê cada coisa e as regras do serviço.
        </p>
      </div>

      <div className={styles.areas}>
        {areas.map((a) => (
          <section key={a.title} className={styles.panel} aria-labelledby={`area-${a.title}`}>
            <h2 id={`area-${a.title}`}>{a.title}</h2>
            <span className={styles.who}>{a.who}</span>
            <ul className={styles.items}>
              {a.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className={`${styles.panel} ${styles.panelBig}`} aria-labelledby="fluxos-titulo">
        <h2 id="fluxos-titulo">Fluxos principais</h2>
        <div className={styles.grid2}>
          {fluxos.map((f) => (
            <div key={f.name} className={styles.flow}>
              <strong>{f.name}</strong>
              <span>{f.path}</span>
            </div>
          ))}
        </div>
        <p className={styles.links}>
          Ir para: <Link href="/">Início</Link> · <Link href="/catalogo">Catálogo</Link> ·{" "}
          <Link href="/conta">Minha conta</Link> · <Link href="/agendar">Agendar</Link> ·{" "}
          <Link href="/encontros">Encontros</Link> · <Link href="/assinar">Assinar</Link>
        </p>
      </section>

      <section className={`${styles.panel} ${styles.panelBig}`} aria-labelledby="regras-titulo">
        <h2 id="regras-titulo">Regras do serviço</h2>
        <dl className={styles.rules}>
          {regras.map((r) => (
            <div key={r.q} className={styles.rule}>
              <dt>{r.q}</dt>
              <dd>{r.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
