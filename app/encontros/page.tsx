import s from "./encontros.module.css";

export const metadata = { title: "Encontros" };

// TODO: ainda não há leitura pública da tabela `events`. Quando houver, substituir
// EXEMPLOS por uma consulta aos encontros publicados (título, data, horário, local,
// vagas, preço) e remover o aviso e os selos de "Exemplo".
const EXEMPLOS = [
  { id: "a", titulo: "Roda de conversa: livro do mês", desc: "Leitura comentada e conversa aberta, com café." },
  { id: "b", titulo: "Troca de livros e café", desc: "Traga um livro seu e leve outro." },
  { id: "c", titulo: "Clube de leitura: tema do mês", desc: "Encontro mensal com tema e leitura combinados antes." },
];

export default function EncontrosPage() {
  return (
    <main className={`container ${s.page}`}>
      <div className={s.head}>
        <h1 className="page-title">Encontros</h1>
        <p className={s.lead}>
          Rodas de conversa e trocas presenciais para quem quiser conhecer outros leitores. Neste primeiro momento,
          só assinantes participam. Cada encontro é cobrado à parte, fora da assinatura.
        </p>
      </div>

      <div className={s.notice} role="note">
        Exemplo ilustrativo: os encontros abaixo ainda não são reais. Datas, horários, locais, vagas e valores serão divulgados aos assinantes.
      </div>

      <ul className={s.list}>
        {EXEMPLOS.map((e) => (
          <li key={e.id} className={`card ${s.event}`}>
            <div className={s.main}>
              <div className={s.date} aria-hidden="true"><span>SÁB</span><span>--</span></div>
              <div className={s.body}>
                <span className={`badge badge-warn ${s.example}`}>Exemplo</span>
                <h2 className={s.evTitle}>{e.titulo}</h2>
                <span className={s.meta}>Horário e local a definir · vagas a definir</span>
                <span className={s.desc}>{e.desc}</span>
              </div>
            </div>
            <div className={s.side}>
              <span className={s.price}>Valor a definir</span>
              <button type="button" className="btn2" disabled>Quero participar</button>
            </div>
          </li>
        ))}
      </ul>

      <p className={s.note}>
        A forma de pagamento do ingresso (Pix na confirmação ou combinado pelo WhatsApp) ainda será definida.
      </p>
    </main>
  );
}
