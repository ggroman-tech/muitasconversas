# Frontend A — mudanças (fluxo assinatura / conta / login)

Tudo **só local**: nada commitado, nada publicado, nenhuma escrita em banco ou funções. Para publicar: `atualizar-github.bat`.
Verificação: `tsc --noEmit` e `eslint` sem erros/avisos; 30 testes unitários passam (rodados com um executor improvisado, porque o `vitest` não roda neste ambiente por falta do binário nativo do rollup — rode `npm test` no seu Windows para confirmar).

## Arquivos alterados

| Arquivo | O que mudou | Por quê |
|---|---|---|
| `app/assinar/verify-payment.tsx` | Região de status sempre presente (`aria-live`); mostra "Conferindo automaticamente (n de 6)"; não gasta tentativa com a aba em segundo plano; no fim das 6 tentativas explica que não precisa manter a página aberta (confirmação automática em até 5 min; se passar de 15 min, falar com a gente); ao ativar leva a `/conta?ativada=1` | Tela de "verificando" ficava sem feedback e sem expectativa honesta de tempo |
| `app/conta/page.tsx` | Aceita `?ativada=1`; **sempre** busca o estado do pagamento (antes passava `null` para assinatura ativa) | Bug: o aviso "Cancelamento solicitado" nunca aparecia para assinatura ativa |
| `app/conta/conta-view.tsx` | Faixa de sucesso "Pagamento confirmado!" + botão para o catálogo; aviso de cancelamento usa `st.cancelRequested`; WhatsApp formatado; comentário "política de reembolso a definir" | Página de sucesso ao ativar; QA itens 3/4/8 |
| `app/conta/cancel-subscription-form.tsx` | Confirmação em lista: cobrança para agora, acesso até a data, **período pago não é reembolsado** (a definir pelo Gabriel — comentário no código), fila cancelada na data, reassinar depois; `aria-busy` | Clareza antes de cancelar |
| `app/assinar/concluir/page.tsx` | Passos numerados do pagamento; "Passo 3 de 3"; mensagens para `email_mismatch` e `taken/other_linked`; redireciona a `/conta?ativada=1`; título sem marca duplicada | Retorno do MP sem tela morta; QA itens 1/2 |
| `app/assinar/page.tsx` | "Passo 1 de 3 / 2 de 3" (pagamento é o 3) ; título sem marca duplicada | QA itens 1/2 |
| `app/assinar/signup-form.tsx` | Máscaras de CEP e WhatsApp ao digitar; validação ao sair do campo (nome, WhatsApp, CEP, rua, número); foco no primeiro campo com erro após o envio; `aria-live` no status do CEP | Menos erro de digitação e retrabalho |
| `app/assinar/actions.ts` | Falha de rede/servidor no cadastro vira mensagem no formulário (antes, tela de erro do Next) | Visitante não vê tela crua |
| `lib/auth/login-form.tsx` | Tela "Link enviado" com instruções (mesmo navegador, spam, validade), **Reenviar link** com contagem de 45 s e **Usar outro e-mail**; campo de e-mail sem autocapitalização/corretor | Quem não recebe o e-mail não ficava sem saída |
| `app/(auth)/entrar/page.tsx` | Título sem marca duplicada | QA item 2 |
| `lib/assinatura/state.ts` | Novo campo `cancelRequested`; rótulo "Ativa até o fim do período"; textos de espera com tempo honesto (até 5 min) | Estado de cancelamento visível |
| `lib/auth/masks.ts` (novo) | `formatPhoneBr` (máscara) e `formatPhoneDisplay` (exibição, ex.: `(12) 99217-5687`; com 55: `+55 (12) …`) | WhatsApp legível |
| `lib/auth/signup-validation.ts` | `validateField` (valida um campo isolado) | Validação inline |
| Testes: `lib/assinatura/state.test.ts`, `lib/auth/masks.test.ts` (novo), `lib/auth/signup-validation.test.ts` | +5 casos de estado, máscaras, `validateField` | |

Não alterei `middleware.ts` (já preserva `?preapproval_id` e o `next` com `safeNext`). Segurança mantida: `safeNext`, claim exige e-mail igual, o id da assinatura nunca vem do navegador.

## O que o Gabriel deve testar (depois de publicar)
1. `/entrar` deslogado: pedir link, ver tela "Link enviado", esperar 45 s e **Reenviar**, e **Usar outro e-mail**.
2. `/assinar` com e-mail novo: digitar CEP e WhatsApp (máscara), sair do campo com valor inválido (erro na hora), enviar com erro e ver o foco no primeiro campo.
3. `/assinar/concluir` com assinatura pendente: ver os 3 passos e "Passo 3 de 3"; botão **Já paguei** e contagem "n de 6".
4. `/conta?ativada=1` (assinatura ativa): faixa verde "Pagamento confirmado!".
5. `/conta`: WhatsApp formatado; abrir **Cancelar assinatura** só para ler o texto (**não confirme**). Depois de um cancelamento real: aviso "Cancelamento solicitado… acesso até dd/mm".

## Riscos / decisões pendentes
- **Reembolso:** o texto diz que o período já pago **não** é reembolsado. É uma decisão do Gabriel (comentário `POLÍTICA DE REEMBOLSO` em `cancel-subscription-form.tsx` e `conta-view.tsx`); alinhar também `app/regras` (Frontend B).
- WhatsApp: exibo `(12) 99217-5687` (padrão brasileiro) em vez de `+55 12 …`; números guardados com 55 saem `+55 (12) …`.
- A máscara só formata com o cursor no fim do campo (edição no meio não é reformatada) — intencional.
- O arquivo `app/error.tsx` (QA item 2 do relatório) é do Frontend B/coordenador; tratei só o erro do cadastro.
