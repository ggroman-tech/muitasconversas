# Propostas de backend/financeiro — NADA FOI APLICADO

Nenhuma migration aplicada, nenhuma função deployada, nenhum cron criado, nenhum dado apagado.
Todos os SQLs foram testados em **rollback** (transação desfeita) no projeto `fzkdhtutpgydywpzapyc`.

## ⚠ Achados que valem decisão hoje
1. **Falha ao vivo (0088):** a migration 0086 faz `reserve_book` e `mc_promote_queue` bloquearem quem pediu cancelamento. Isso contradiz o que foi dito ao Gabriel/cliente ("usa as funções até o fim do período pago"). Testado: quem cancelou não consegue reservar. **A 0088 corrige** (2 trocas de texto).
2. **Vazamento para o cliente (0089):** `payment_failed` e `payment_after_cancel` são gravados em `email_log`, e "Minha conta" mostra o assunto como "Últimos e-mails enviados" — texto interno ("conferir/estornar") apareceria ao cliente, e ninguém envia e-mail de fato. Hoje não há linhas assim; passa a haver na primeira falha de cobrança.

## Ordem de aplicação
| # | Arquivo | O que faz | Risco | Precisa autorização? |
|---|---|---|---|---|
| 1 | 0088_acesso_ate_fim_do_periodo | cancelamento pedido mantém reservas/fila até o fim do período | baixo | não (corrige bug) |
| 2 | 0089_alertas_internos_e_fila_de_emails | `staff_alerts`, `email_outbox`; alertas de valor ≠ plano, assinatura duplicada, pagamento pós-cancelamento; e-mail de falha vai à fila | baixo-médio | não |
| 3 | 0090_carencia_de_pagamento | 3 dias de carência antes de past_due (setting `payment_grace_days`; 0 desliga) | baixo | decisão de negócio: 3 dias ok? |
| 4 | 0091_reembolso_e_estorno | refunded/charged_back removem 30 dias e alertam; idempotente | baixo-médio | não |
| 5 | 0092_subscription_events_auditoria | trilha de mudanças da assinatura (trigger) | baixo | não |
| 6 | 0094_indices_chaves_estrangeiras | 15 índices de FK | baixo | não |
| 7 | 0095_lembretes_e_cancelamento_por_email | funções que enfileiram lembretes + trigger "cancelamento confirmado" | baixo | só o cron (comentado) |
| 8 | 0093_retencao_logs_mp | função de limpeza de 30 dias | baixo | **SIM** (cron apaga dados; o sistema bloqueou e não foi contornado) |
| — | send-emails/index.ts | enviador Resend da fila (não deployado) | médio | **SIM** (secrets + deploy + cron) |

Dependências: 0090 exige 0088; 0091 e 0095 exigem 0089. 0093 não tem teste de execução do DELETE (o cliente SQL barra `delete`); a lógica é trivial (2 deletes com data) — rodar `select mc_purge_mp_logs(30)` uma vez após aplicar e conferir o retorno.
Frontend: com 0090, `lib/assinatura/state.ts` deve tratar a carência (`grace_days` em `my_payment_state`) como acesso; senão a tela diz "vencida" enquanto o backend ainda deixa reservar. Painel: criar tela simples listando `staff_alerts` não resolvidos.

## Item 8 — matriz de estados (reserve_book / mc_promote_queue / agendamento)
| Estado | Reservar / entrar na fila | Receber oferta da fila | Agendar visita |
|---|---|---|---|
| active | sim | sim | sim |
| active + cancelamento pedido (hoje, 0086) | **não** | **não** | sim |
| active + cancelamento pedido (com 0088) | sim até o fim do período | sim | sim |
| active, período vencido ≤3 dias (com 0090) | sim | sim | sim |
| past_due / paused / canceled / pending | não | não | não |
- Ao fim do período com cancelamento, `mc_expire_subscriptions` cancela reservas na fila/ofertadas e devolve cópias seguradas (ok).
- past_due mantém reservas já ofertadas até o hold expirar (comportamento aceitável).
- `schedule_visit`/`schedule_options` só checam `status='active'`, sem data — ok porque o cron muda o status; com 0090 a carência vale também aqui.

## Itens 6 e 7
- Valor ≠ `plan_price_cents` → alerta `amount_mismatch` (0089). Importante: ao voltar para R$ 30, atualizar `plan_price_cents`, senão toda cobrança alerta.
- Assinatura duplicada no MP → resultado `duplicate` + alerta `duplicate_subscription` com a instrução: cancelar a duplicada em Assinaturas no painel do MP e estornar se cobrou.

## Item 9 — get_advisors
- Segurança: 11 views `security_definer_view` (ERROR) — por desenho (my_account, catalog_*, saturday_route, painel_*…); trocar para `security_invoker` quebraria anon/painel por causa do RLS das tabelas base → manter e documentar. 13 tabelas com RLS sem policy (INFO) — intencional (só serviço). `citext` em public — deixar. `check_service_area`/`signup_config` executáveis por anon — necessários ao cadastro. 26 funções definer executáveis por authenticated checam papel internamente; `mc_setting*`/`mc_is_staff` expostas, baixa sensibilidade (opcional: revogar das que o app não usa). Proteção de senha vazada desligada (painel Auth; o site usa magic link).
- Performance: 15 FKs sem índice (→ 0094); `books_search_idx` sem uso (deixar até ter volume); múltiplas policies SELECT permissivas em 11 tabelas (próprio + equipe) — baixa prioridade.

## E-mails transacionais — situação
`email_log` é só histórico; **não existe nenhum enviador** (`reminders_due` da 0051 não é consumida). Menor solução: fila (0089) + `send-emails` com Resend (arquivo acima) + SMTP/domínio verificado. Tipos cobertos: falha de pagamento, lembrete de renovação D-3/D-1, lembrete de devolução, cancelamento confirmado (0095); "pagamento após cancelamento" é alerta interno, não e-mail ao cliente.

Checklist de lançamento: `checklist-lancamento.md`.
