# Relatório de QA — site publicado (22/11/2026, noite)

Escopo: leitura de https://muitasconversas.vercel.app como Gabriel (assinante ativo + staff). Nada foi clicado que gere cobrança, cancelamento, e-mail ou reserva. Páginas lidas como texto/árvore de acessibilidade; layout móvel medido com um quadro de 390 px (o resize da janela não alterou o viewport real).

**Não coberto:** telas de visitante deslogado (só li o código: /entrar, /assinar), envio real de link por e-mail, pagamento, cancelamento e reserva (ações reais); livro "indisponível/na fila" (os 60 livros estão disponíveis, `?disp=fila` devolve vazio); aparência visual (sem screenshots).

## Crítico
Nenhum encontrado. Nada impede cadastro, pagamento ou acesso do assinante.

## Importante
1. **`/catalogo?p=99` (página além da última) derruba a página** — "This page couldn't load. A server error occurred" (ERROR 1535375532). Causa: `searchCatalog` em `lib/catalog/query.ts` chama `.range(from, ...)` com offset maior que o total e não trata o erro. O botão "Próxima →" nunca leva a isso, mas link antigo/digitado quebra. *Correção:* limitar `page` a `ceil(total/PAGE_SIZE)` (ou, se o range falhar, refazer na última página) e nunca lançar erro para parâmetro de URL.
2. **Não existe `app/error.tsx` (nem `global-error.tsx`)** — qualquer falha de servidor mostra a tela crua do Next, em inglês, sem menu. *Correção:* `app/error.tsx` em português com "Tentar de novo" e links para Catálogo/Minha conta.
3. **Etapas do cadastro inconsistentes.** `/assinar` diz "Passo 1 de 2" (e-mail) e "Passo 2 de 2" (dados), mas depois ainda há o pagamento (`/assinar/concluir`); `/regras` descreve 4 etapas. *Correção:* "Passo 1 de 3 / 2 de 3 / 3 de 3 — pagamento" e título claro em `/assinar/concluir`.
4. **Regra de cancelamento da assinatura não está em lugar nenhum** (Regras, FAQ da home, resumo de `/assinar`). Pior: o texto "Pedidos e cancelamentos fecham na sexta-feira, às 08h" (home, regras, resumo) fala de visitas, mas agora existe o botão "Cancelar assinatura" e a frase confunde. *Correção:* trocar por "cancelamento de visitas" e acrescentar uma regra/FAQ: "Cancele quando quiser em Minha conta; a cobrança para e o acesso vai até o fim do período pago." (**decisão do dono:** reembolso proporcional? hoje não há.)
5. **Títulos de aba errados.**
   - Marca duplicada: `Minha conta — Muitas Conversas | Muitas Conversas` (também /agendar, /assinar, /assinar/concluir, /entrar, /painel*). O `layout.tsx` já aplica o template `%s | Muitas Conversas`.
   - Todas as páginas de livro têm título "Livro" (`app/catalogo/[id]/page.tsx`: `metadata = { title: "Livro" }`). *Correção:* tirar o sufixo dos `metadata.title` e usar `generateMetadata` com o título do livro.
6. **Estado vazio do catálogo pouco útil.** Com filtro sem resultado aparecem duas frases ("Nenhum livro encontrado." e "Nenhum livro com esses filtros. Tente outro filtro ou veja todos.") e nenhum botão "Limpar filtros". "Com fila de espera" vazio usa o mesmo texto genérico. *Correção:* uma mensagem só, com botão "Limpar filtros", e texto próprio para fila vazia ("Nenhum livro com fila agora; todos estão disponíveis").

## Menor
7. **Capa-substituta duplica o texto** para leitores de tela: título e autor aparecem duas vezes em 5 livros da listagem (A garota no gelo, A Grande Ilusão, Bem-vindos à livraria Hyunam-dong, Gelo negro, Harry Potter…) e no detalhe de "A garota no gelo". *Correção:* `aria-hidden="true"` no placeholder.
8. **WhatsApp sem formatação** em "Seus dados": `12992175687`. Mostrar `(12) 99217-5687`.
9. **Encontros inconsistentes.** A home lista "Roda de conversa…" e "Troca de livros e café" como reais ("data a confirmar"), enquanto `/encontros` diz "Exemplo ilustrativo: os encontros abaixo ainda não são reais". `/encontros` ainda cita "Pix na confirmação" como pagamento do ingresso, enquanto o resto do site diz só cartão. *Correção:* marcar "Exemplo" na home (ou ocultar até haver encontro real) e alinhar o texto de pagamento.
10. **Cabeçalho mostra "Assinar" para quem já assina** (leva a /conta). Trocar por "Minha conta" apenas, ou ocultar quando logado.
11. **Alvos de toque pequenos no celular (<32 px de altura):** links do rodapé ("Regras e mapa do site", "Catálogo"), "Ver todos os livros", lista "Ir para:" em /regras, links de WhatsApp no painel. *Correção:* `min-height: 44px` / padding.
12. **Sinopse cortada no meio da frase** com "…" e sem "ver mais" (ex.: "…Atraída…"). Cortar em fim de frase ou oferecer expandir.
13. **`/agendar` sem pendências:** mostra o título "O que será feito" e "Reserve um livro no catálogo" sem link. Adicionar botão para o catálogo e ocultar o título vazio.
14. **Horários em formatos diferentes:** "09h às 14h"/"08h" (site) vs "9h às 14h"/"8h" (painel/sábados). Padronizar.
15. **Painel/assinaturas no celular:** a tabela tem 925 px; fica contida (a página não ganha rolagem), mas confirmar que o contêiner rola na horizontal e que a primeira coluna fica legível. Considerar cartões empilhados em telas estreitas.
16. **Lembrete de lançamento:** preço de teste R$ 1 aparece de forma consistente (home, FAQ, regras, resumo, detalhe do livro, conta) por `lib/plan.ts`; lembrar de voltar a R$ 30 e trocar `mp_plan_id`/`plan_price_cents` no lançamento.

## O que está bom
- Sem rolagem horizontal em nenhuma página pública no quadro de 390 px.
- `lang="pt-BR"`, um `h1` por página, todos os campos com rótulo, todas as imagens com `alt`, links com nome.
- Carregamento rápido: TTFB ~20 ms, DOM pronto em 620–720 ms; /conta ~1,1 s.
- Filtros do catálogo corretos (Fantasia + Novo → só "Wicked"); busca por "orwell" certa; parâmetros inválidos (`p=-3`, gênero inexistente, `q=%`) tratados sem erro.
- Redirecionamentos seguros: `/entrar?next=//evil.com` e `?next=https://evil.com/x` ignorados (vão para /conta); `preapproval_id` malformado ignorado.
- 404 amigável dentro do layout (livro inexistente, UUID inválido, rota inexistente).
- /assinar e /assinar/concluir redirecionam corretamente quem já é assinante ativo; painel e subpáginas (assinaturas, reservas, atrasos, sábados) carregam com estados vazios claros e navegação consistente.
- Preço, frete, prazo de 28 dias e regras de atraso coerentes entre home, FAQ, regras e detalhe do livro.
