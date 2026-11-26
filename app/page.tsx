import { Suspense } from "react";
import Link from "next/link";
import styles from "./home.module.css";
import { BookCover } from "@/lib/catalog/cover";
import { featuredBooks } from "@/lib/catalog/query";
import { statusLabel } from "@/lib/catalog/types";
import { PLAN_PRICE } from "@/lib/plan";

const steps = [
  { title: "Assine", text: "Cadastre-se com seu endereço na Zona Sul e pague " + PLAN_PRICE + " a cada 30 dias, no cartão de crédito. O frete já está incluso." },
  { title: "Escolha e reserve", text: "Navegue pelo catálogo, veja o que está disponível e reserve. Se o livro estiver emprestado, entre na fila." },
  { title: "Receba em casa", text: "Entregamos o livro no seu endereço, no sábado de troca, entre 09h e 14h." },
  { title: "Troque aos sábados", text: "Fique com o livro por até 28 dias corridos ou troque aos sábados. Na troca, devolvemos o anterior e você recebe o próximo na mesma visita." },
];

const eventos = [
  { when: "Em breve · data a confirmar", title: "Roda de conversa: livro do mês", where: "Local a confirmar · só para assinantes" },
  { when: "Em breve · data a confirmar", title: "Troca de livros e café", where: "Local a confirmar · só para assinantes" },
];

const faq = [
  { q: "Por quanto tempo posso ficar com o livro?", a: "Um livro por vez, por até 28 dias corridos ou troca aos sábados. Não há renovação automática." },
  { q: "Onde vocês entregam?", a: "Na Zona Sul do Rio, de Leme a São Conrado. Você informa o CEP na assinatura." },
  { q: "Como sou lembrado de devolver?", a: "Por e-mail, 7, 3 e 1 dia antes do fim do prazo. Pedidos de visita e cancelamentos de visita fecham na sexta-feira, às 08h." },
  { q: "E se eu atrasar?", a: "Não há multa, mas enquanto o livro estiver atrasado você não reserva nem recebe outro até devolvê-lo." },
  { q: "Como pago?", a: "No cartão de crédito, pelo Mercado Pago. A assinatura é de 30 dias por " + PLAN_PRICE + ", com frete incluso, e renova sozinha todo mês até você cancelar." },
  { q: "Como cancelo?", a: "Em Minha conta, no botão “Cancelar assinatura”. A cobrança para na hora e você continua com acesso até o último dia do período já pago (não há reembolso do período já pago). Para voltar depois, é só assinar de novo." },
  { q: "Os encontros estão incluídos?", a: "Não. Os encontros presenciais são cobrados à parte e, por enquanto, só para assinantes." },
];

async function HeroCovers() {
  const books = await featuredBooks(0, 2);
  return (
    <>
      {books.map((b, i) => (
        <div key={b.id} style={{ marginTop: i === 1 ? 32 : 0 }}>
          <BookCover book={b} />
        </div>
      ))}
    </>
  );
}

async function Novidades() {
  const books = await featuredBooks(3, 7);
  return (
    <ul className={styles.books}>
      {books.map((b) => (
        <li key={b.id}>
          <Link href={`/catalogo/${b.id}`} className={styles.book} aria-label={`${b.title}, ${b.authors.join(", ")}: ${statusLabel(b)}`}>
            <BookCover book={b} lazy decorative />
            <span className={`badge ${b.copies_available > 0 ? "" : b.queue_size > 0 ? styles.sRes : styles.sOut}`}>{statusLabel(b)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <main id="conteudo">
      <section className={styles.hero} aria-labelledby="hero-titulo">
        <div className={styles.heroText}>
          <h1 id="hero-titulo" className={styles.heroTitle}>Um livro por vez, na sua porta.</h1>
          <p className={styles.heroLead}>
            Assine por {PLAN_PRICE} a cada 30 dias, escolha no catálogo e receba em casa na Zona Sul. Fique até 28 dias corridos com o livro
            ou troque aos sábados.
          </p>
          <div className="row">
            <Link className="btn" href="/assinar">Quero assinar</Link>
            <Link className="btn2" href="/catalogo">Ver o catálogo</Link>
          </div>
          <p className={styles.heroNote}>Frete incluso. Entregas por enquanto só na Zona Sul do Rio.</p>
        </div>
        <div className={styles.heroCovers} aria-hidden="true">
          <Suspense fallback={null}>
            <HeroCovers />
          </Suspense>
        </div>
      </section>

      <section className={styles.band} aria-labelledby="como-titulo">
        <div className={styles.inner}>
          <h2 id="como-titulo" className={styles.h2}>Como funciona</h2>
          <ol className={styles.steps}>
            {steps.map((s, i) => (
              <li key={s.title} className={styles.step}>
                <span className={styles.stepN} aria-hidden="true">{i + 1}</span>
                <h3 className={styles.stepTitle}>{s.title}</h3>
                <p className={styles.text}>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.sec} aria-labelledby="novidades-titulo">
        <div className={styles.headRow}>
          <h2 id="novidades-titulo" className={styles.h2}>Novidades no catálogo</h2>
          <Link href="/catalogo">Ver todos os livros</Link>
        </div>
        <Suspense fallback={null}>
          <Novidades />
        </Suspense>
      </section>

      <section className={styles.band} aria-labelledby="encontros-titulo">
        <div className={styles.innerRow}>
          <div className={styles.evText}>
            <h2 id="encontros-titulo" className={styles.h2}>Próximos encontros</h2>
            <p className={styles.text} style={{ fontSize: 16 }}>
              Estamos preparando os primeiros encontros presenciais. Os abaixo são exemplos do que vem por aí; datas e locais ainda serão confirmados. Serão só para assinantes e cobrados à parte.
            </p>
            <Link className="btn2" href="/encontros">Ver todos os encontros</Link>
          </div>
          <ul className={styles.evList}>
            {eventos.map((e) => (
              <li key={e.title} className={styles.ev}>
                <span className={styles.evWhen}>{e.when} · exemplo</span>
                <span className={`h ${styles.evTitle}`}>{e.title}</span>
                <span className={styles.evWhere}>{e.where}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.sec} aria-labelledby="faq-titulo">
        <h2 id="faq-titulo" className={styles.h2}>Perguntas frequentes</h2>
        <div className={styles.faq}>
          {faq.map((f) => (
            <div key={f.q} className={styles.faqItem}>
              <h3>{f.q}</h3>
              <p className={styles.text}>{f.a}</p>
            </div>
          ))}
        </div>
        <p className={styles.text}>
          Todas as regras em <Link href="/regras">Regras e mapa do site</Link>.
        </p>
      </section>
    </main>
  );
}
