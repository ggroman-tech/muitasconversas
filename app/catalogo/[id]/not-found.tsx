import Link from "next/link";

export default function LivroNaoEncontrado() {
  return (
    <main id="conteudo" className="container">
      <h1 className="page-title">Livro não encontrado</h1>
      <p className="muted" style={{ margin: "12px 0 20px" }}>
        Esse endereço não corresponde a nenhum livro do catálogo. Ele pode ter saído do acervo.
      </p>
      <Link className="btn" href="/catalogo">Ver o catálogo</Link>
    </main>
  );
}
