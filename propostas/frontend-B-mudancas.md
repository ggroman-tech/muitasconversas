# Frontend B — mudanças (local, nada commitado/publicado)

Verificação: `tsc --noEmit` OK; eslint OK nas pastas alteradas. **Não rodei `next build` nem vitest** (node_modules é do Windows). Rode `npm run build` e `npm test` antes de publicar.

## Catálogo
- `lib/catalog/query.ts`: página fora do intervalo (`?p=99`) não dá mais erro — ajusta para a última página. Novo `facetCounts()` (contagem por gênero/estado).
- `lib/catalog/cover.tsx`: capa de reserva (livros sem capa) com `aria-hidden`, título/autor limitados em linhas, `shortTitle`, prop `decorative` (alt vazio quando o título já está ao lado), width/height.
- `lib/catalog/book-state.ts` (+test), `lib/catalog/text.ts` (+test): estado da ação do livro, sinopse cortada no fim de frase, WhatsApp formatado.
- `app/catalogo/page.tsx` + `catalogo.module.css`: contagens nos filtros, "Limpar busca e filtros", estado vazio único e específico (inclui "Com fila de espera"), aria-live, títulos longos truncados em 2 linhas, alvos 44px.
- `app/catalogo/[id]/page.tsx`, `reserve-button.tsx`: painéis por estado (sem acesso, atraso, emprestado, oferta, fila, reservar), botão "Enviando…", sinopse com "Ler a sinopse completa".
- `app/catalogo/error.tsx`, `[id]/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx`: telas de erro em português.

## Home / Regras / Encontros
- `app/page.tsx`: FAQ de cancelamento (cobrança para na hora, acesso até o fim do período pago, sem reembolso do período), "Como pago?"; eventos marcados "Em breve · data a confirmar · exemplo".
- `app/regras/page.tsx`: "cancelamento de visitas" separado de "Cancelamento da assinatura". **Política de reembolso: a definir pelo Gabriel** (comentário no código).
- `app/encontros/page.tsx`: removido Pix.
- CSS (`home.module.css`, `regras.module.css`): links com 44px de altura.

## Agendar / Painel
- `app/agendar/*`: título sem marca duplicada; erros preservam os campos digitados; sem assinatura → botão "Ver minha assinatura"; sem pendências → botão "Ver o catálogo".
- `app/painel/layout.tsx`: título "Painel". `sabados/page.tsx`: horas "09h/08h". `assinaturas/page.tsx` e `atrasos/page.tsx`: WhatsApp formatado, link 44px; tabela de assinaturas com rolagem horizontal própria (focável).

## Global
- `app/layout.tsx` + `globals.css`: link "Pular para o conteúdo" (alvo `#conteudo`; só existe em catálogo/encontros — falta em /conta e /assinar, fora do meu escopo).
- `components/site-header.tsx`: assinante ativo não vê "Assinar"; pendente vê "Concluir assinatura". Depende da view `my_account`. Rodapé com links 44px.

## Não feito
- Título da aba com nome do livro (`generateMetadata`): exige ler cookies sob `cacheComponents` e não consegui validar sem build. Segue "Livro".
- Tags internas (atenção/detalhes) no painel: dependeria de consulta a `book_internal`; ficou de fora para não mexer em dados sem poder testar.

## O que testar
1. `/catalogo?p=99`, busca sem resultado, filtro "Com fila de espera", "Limpar filtros".
2. Livro sem capa (7 casos) e título longo, no celular 390px.
3. Página de livro: deslogado, assinante, com oferta/fila, emprestado, atrasado.
4. Home/Regras: textos de cancelamento coerentes com o comportamento real.
5. Header: logado ativo (sem "Assinar"), pendente, visitante.
6. `/agendar` com erro de validação (campos mantidos) e sem pendências.
7. Painel > Assinaturas no celular (rolagem lateral) e Atrasos (WhatsApp).
8. Tab com Tab/teclado: "Pular para o conteúdo".
