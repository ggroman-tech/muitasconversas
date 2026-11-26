# O que mudou na noite de 22→23/11/2026 (para revisão)

## JÁ NO AR (banco/funções do Supabase, aplicado durante a noite)
- Migrations 0083–0088 aplicadas (arquivos em supabase/migrations): sync periódico com o Mercado Pago, cancelamento, reassinatura, revogação de permissões de escrita, alerta de pagamento após cancelamento, `mc_expire_subscriptions` que encerra assinaturas canceladas e libera reservas, **0088: quem pediu cancelamento usa tudo até o fim do período pago**.
- Edge Functions publicadas: `mercadopago-sync` (cron 5 min), `mercadopago-claim`, `mercadopago-cancel`, `mercadopago-webhook` (log, janela de 1 h, limite de tamanho).
- Assinatura do Gabriel: ATIVA até 22/12/2026 (pagamento de R$ 1 identificado pelo sync).

## SÓ NA SUA PASTA (precisa do atualizar-github.bat)
Frontend A (assinatura/conta/login): botão "Já paguei" com progresso, faixa "Pagamento confirmado", login com reenvio, máscaras CEP/WhatsApp, passos 1–3 de 3, aviso de pagamento com outro e-mail, textos de cancelamento, títulos de aba. Detalhes: propostas/frontend-A-mudancas.md.
Frontend B (catálogo/agendar/painel/home/regras): `?p=99` sem erro, filtros com contagem e "Limpar filtros", capas de reserva, painel de ações na página do livro, telas de erro em português, FAQ/regras com cancelamento, Pix removido de /encontros, link "Pular para o conteúdo". Detalhes: propostas/frontend-B-mudancas.md.
Config: tsconfig e eslint ignoram `propostas/` e `supabase/functions`.
Verificação: `tsc --noEmit` e `eslint .` sem erros. NÃO rodados (ambiente): `next build` e `vitest` — rode `npm test` e `npm run build` no Windows antes de publicar.

## PROPOSTAS NÃO APLICADAS (propostas/, ordem em INDEX-backend.md)
0089 alertas internos + fila de e-mails; 0090 carência de pagamento (decidir dias); 0091 reembolso/estorno; 0092 auditoria de assinatura; 0093 limpeza de logs (precisa da sua autorização); 0094 índices; 0095 lembretes; send-emails (Resend, não publicado). Checklist de lançamento: propostas/checklist-lancamento.md.

## DECISÕES QUE DEPENDEM DE VOCÊ
1. Reembolso do período já pago ao cancelar (hoje o texto diz que NÃO há).
2. Carência de pagamento: 3 dias?
3. Autorizar a limpeza automática de logs mp_* (30 dias).
4. Resend (conta, domínio, chave) para e-mails.
5. Antes do lançamento: preço R$ 1 → R$ 30 (lib/plan.ts, settings.plan_price_cents=3000, mp_plan_id real).

## RISCOS/CUIDADOS
- Cancelamento real no Mercado Pago ainda NÃO foi testado (a doc não confirma PUT status=cancelled para plano associado). Teste com a conta da Giovanna ou outra, não com a sua.
- Uma versão desta noite (0086) bloqueava reservas de quem pediu cancelamento; foi corrigida pela 0088 (já aplicada).
- O Mercado Pago deixa o e-mail do pagador vazio; o sync resolve pelo pagamento (GET /v1/payments/{id}).
