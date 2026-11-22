import Link from "next/link";
import styles from "./home.module.css";

type Sample = { title: string; author: string; color: string; status: "Disponível" | "Emprestado" | "Reservado" };

const hero = [
  { title: "Torto Arado", author: "Itamar Vieira Junior", color: "#7A3B12", offset: 0 },
  { title: "Vidas Secas", author: "Graciliano Ramos", color: "#1E3A5F", offset: 32 },
  { title: "Quarto de Despejo", author: "Carolina Maria de Jesus", color: "#7A1F2B", offset: 0 },
];

const steps = [
  { title: "Assine", text: "Cadastre-se com seu endereço na Zona Sul e pague R$ 30 por mês. O frete já está incluso." },
  { title: "Escolha e reserve", text: "Navegue pelo catálogo, veja o que está disponível e reserve. Se o livro estiver emprestado, entre na fila." },
  { title: "Receba em casa", text: "Entregamos o livro no seu endereço, no sábado de troca, entre 09h e 14h." },
  { title: "Troque aos sábados", text: "Fique até 28 dias com o livro. Na troca, devolvemos o anterior e você recebe o próximo na mesma visita." },
];

const novos: Sample[] = [
  { title: "Torto Arado", author: "Itamar Vieira Junior", color: "#7A3B12", status: "Disponível" },
  { title: "Quarto de Despejo", author: "Carolina Maria de Jesus", color: "#7A1F2B", status: "Reservado" },
  { title: "Capitães da Areia", author: "Jorge Amado", color: "#1E3A5F", status: "Disponível" },
  { title: "Ensaio sobre a Cegueira", author: "José Saramago", color: "#2D2D2D", status: "Emprestado" },
  { title: "Cem Anos de Solidão", author: "Gabriel García Márquez", color: "#6B4E16", status: "Disponível" },
];

const eventos = [
  { when: "Sábado · data a confirmar", title: "Roda de conversa: livro do mês", where: "Local a confirmar · só para assinantes" },
  { when: "Sábado · data a confirmar", title: "Troca de livros e café", where: "Local a confirmar · só para assinantes" },
];

const faq = [
  { q: "Por quanto tempo posso ficar com o livro?", a: "Até 28 dias com o mesmo livro, um por vez. Não há renovação automática: a troca é feita no sábado de troca." },
  { q: "Onde vocês entregam?", a: "Em toda a Zona Sul do Rio, de Leme a São Conrado e Rocinha. Você informa o CEP na assinatura." },
  { q: "Como sou lembrado de devolver?", a: "Por e-mail, 7, 3 e 1 dia antes do fim do prazo. Pedidos e cancelamentos fecham às 08h do sábado." },
  { q: "E se eu atrasar?", a: "Não há multa, mas enquanto o livro estiver atrasado você não reserva nem recebe outro até devolvê-lo." },
  { q: "Como pago?", a: "Por Pix, em breve. Assinatura de R$ 30 por mês, com frete incluso." },
  { q: "Os encontros estão incluídos?", a: "Não. Os encontros presenciais são cobrados à parte e, por enquanto, só para assinantes." },
];

const chipClass = (s: Sample["status"]) =>
  s === "Emprestado" ? styles.sOut : s === "Reservado" ? styles.sRes : "";

export default function Home() {
  return (
    <main id="conteudo">
      <section className={styles.hero} aria-labelledby="hero-titulo">
        <div className={styles.heroText}>
          <h1 id="hero-titulo" className={styles.heroTitle}>Um livro por vez, na sua porta.</h1>
          <p className={styles.heroLead}>
            Assine por R$ 30 por mês, escolha no catálogo e receba em casa na Zona Sul. Fique até 28 dias com o livro
            e troque aos sábados.
          </p>
          <div className="row">
            <Link className="btn" href="/assinar">Quero assinar</Link>
            <Link className="btn2" href="/catalogo">Ver o catálogo</Link>
          </div>
          <p className={styles.heroNote}>Frete incluso. Entregas por enquanto só na Zona Sul do Rio.</p>
        </div>
        <div className={styles.heroCovers} aria-hidden="true">
          {hero.map((b) => (
            <div key={b.title} className="cover" style={{ background: b.color, marginTop: b.offset }}>
              <span className="t">{b.title}</span>
              <span className="a">{b.author}</span>
            </div>
          ))}
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
        <ul className={styles.books}>
          {novos.map((b) => (
            <li key={b.title}>
              <Link href="/catalogo" className={styles.book} aria-label={`${b.title}, ${b.author}: ${b.status}`}>
                <div className="cover" style={{ background: b.color }}>
                  <span className="t">{b.title}</span>
                  <span className="a">{b.author}</span>
                </div>
                <span className={`badge ${chipClass(b.status)}`}>{b.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.band} aria-labelledby="encontros-titulo">
        <div className={styles.innerRow}>
          <div className={styles.evText}>
            <h2 id="encontros-titulo" className={styles.h2}>Próximos encontros</h2>
            <p className={styles.text} style={{ fontSize: 16 }}>
              Por enquanto, os encontros presenciais são só para assinantes. Cada evento é cobrado à parte.
            </p>
            <Link className="btn2" href="/encontros">Ver todos os encontros</Link>
          </div>
          <ul className={styles.evList}>
            {eventos.map((e) => (
              <li key={e.title} className={styles.ev}>
                <span className={styles.evWhen}>{e.when}</span>
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
