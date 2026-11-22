# Integração Pagar.me (frente D)

Plano: R$ 30/mês (`settings.plan_price_cents` = 3000), pagamento por Pix. Esta frente só **recebe** webhooks; não chama a API do Pagar.me.

## Configuração
| Onde | Variável | Observação |
|---|---|---|
| Edge Function | `PAGARME_WEBHOOK_SECRET` | segredo usado para o HMAC do corpo |
| Edge Function | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | injetadas pelo Supabase |

1. Aplicar as migrações `0050_D_pagarme.sql` (função `apply_pagarme_event`) e `0051_D_reminders.sql` (view `reminders_due`).
2. Publicar: `supabase functions deploy pagarme-webhook --no-verify-jwt` (o Pagar.me não envia JWT; a autenticação é o HMAC).
3. `supabase secrets set PAGARME_WEBHOOK_SECRET=...`
4. No painel do Pagar.me, cadastrar o endpoint `https://<projeto>.functions.supabase.co/pagarme-webhook` para `charge.paid`, `charge.payment_failed`, `subscription.canceled`.

## Validação e comportamento
- Header `X-Hub-Signature: sha1=<hex>`; HMAC-SHA1 do corpo **bruto** com o segredo; comparação em tempo constante (`hmac.ts`). O módulo também aceita `sha256=`. Assinatura inválida: 401. JSON inválido: 400. Erro ao processar: 500 (o Pagar.me reenvia). Evento desconhecido/ignorado: 200.
- Idempotência por `payments.pagarme_transaction_id` (unique); cancelamento só age se ainda não cancelada; e-mail de falha por `email_log.dedupe_key` (unique).

## Eventos tratados (`apply_pagarme_event(jsonb)`)
| Evento | Efeito |
|---|---|
| `charge.paid` | `payments` -> `paid` + `paid_at` (cria se não existir); `subscriptions` -> `active`; `current_period_end` = base + 1 mês, onde base = `current_period_end` se futuro, senão hoje (America/Sao_Paulo); preenche `started_at` se vazio. Reentrega do mesmo charge: `duplicate`, nada muda. Assinatura `canceled` não é reativada. |
| `charge.payment_failed` | `payments` -> `failed`; assinatura `active/pending` -> `past_due`; insere `email_log` (`kind='payment_failed'`, `dedupe_key='payment_failed:<charge_id>'`). Ignorado se o charge já está `paid`. |
| `subscription.canceled` | `subscriptions` -> `canceled`, `canceled_at = now()`. |

Mapeamento **assumido** do payload v5 (conferir com um evento real do sandbox): `data.id` do charge (`ch_...`) = `pagarme_transaction_id`; assinatura localizada por `data.subscription.id` ou `data.invoice.subscription_id` (em `subscription.canceled`, `data.id`), com fallback por `data.customer.id` = `customers.pagarme_customer_id`; valor em `data.amount`; data de pagamento em `data.last_transaction.paid_at`.

## Pré-requisito da frente A (criação no Pagar.me, apenas interface)
Os ids devem ser gravados antes do primeiro webhook: `customers.pagarme_customer_id` (id do customer) e `subscriptions.pagarme_subscription_id` (id da subscription). Interface esperada:
- `createCustomer({ name, email }) -> { id }` (sem CPF/nascimento, conforme contrato; ver dúvida abaixo).
- `createSubscription({ customerId, planPriceCents: 3000, interval: 'month', paymentMethod: 'pix' }) -> { id, status }`.
Não implementado aqui.

## Lembretes (`reminders_due`)
Empréstimos `active` com `due_date - hoje` em `settings.reminder_days_before` (padrão 7,3,1), "hoje" em America/Sao_Paulo, sem `email_log` de mesmo `dedupe_key` (`reminder_d<N>:loan_<id>`). Exclui clientes anonimizados. Quem envia deve inserir o `email_log` com `kind` e `dedupe_key` da view.

## Dúvidas em aberto (sem resposta definida)
1. **Pix Automático vs. QR manual:** não está decidido se a cobrança mensal será por Pix Automático (débito recorrente autorizado) ou por QR Code gerado todo mês e pago manualmente. Isso muda o fluxo (quem gera a cobrança, prazo de vencimento, o que significa "falha") e quais eventos/campos chegam. Confirmar suporte e eventos no Pagar.me.
2. **Nota fiscal:** não definido se/como será emitida (quem emite, gatilho, dados exigidos do cliente). O Pagar.me pode exigir documento do cliente para cobrança, o que conflita com "sem CPF" do contrato: verificar.
3. Algoritmo e formato exatos do `X-Hub-Signature` e o formato real do payload devem ser confirmados no sandbox.
4. Política de carência para `past_due` (quando bloquear reservas) e de reenvio do aviso de falha: não definidas; nada fixado no código.
