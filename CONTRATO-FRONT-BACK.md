# Contrato frontend ↔ backend (assinatura / Mercado Pago)

O frontend já chama tudo abaixo e tolera a ausência (mostra "ainda não conseguimos confirmar", sem quebrar).
Itens marcados **PENDENTE** precisam ser entregues pelo backend.

## 1. Edge Function `mercadopago-claim` — ENTREGUE (botão "Já paguei, verificar agora")
- Chamada: `supabase.functions.invoke("mercadopago-sync", { body: {} })` a partir de uma Server Action, com
  `Authorization: Bearer <JWT do usuário logado>`. `verify_jwt = true`.
- O JWT identifica o cliente (`auth.uid()` e e-mail). **Não depender de `preapproval_id`**: o Mercado Pago não
  devolve esse parâmetro na volta (o retorno chegou só em `/entrar?next=/conta`).
- Fluxo sugerido: buscar no MP as assinaturas do e-mail (`GET /preapproval/search?payer_email=<email>` e/ou
  `?preapproval_plan_id=<settings.mp_plan_id>`), aplicar `apply_mp_preapproval` e os pagamentos
  (`/authorized_payments/search`) com `apply_mp_authorized_payment`; só vincular ao usuário logado se o e-mail bater
  (ou se já estiver vinculado). Idempotente.
- Resposta (JSON, status 200): `{ "ok": true, "linked": boolean, "status": "pending|active|past_due|canceled|...", "message"?: string }`.
  O frontend ignora o corpo e relê `my_account`; erro HTTP é tratado como "indisponível".

## 2. RPC `my_payment_state()` — ENTREGUE (0084) (estado "Verificando pagamento" / "Pagamento não aprovado")
- Sem argumentos, `security definer`, executável por `authenticated`; usa `auth.uid()`.
- Retorna `jsonb`:
  `{ "mp_linked": boolean, "mp_status": text|null, "last_payment_status": text|null, "last_payment_at": timestamptz|null }`
  - `mp_linked`: existe `mp_preapprovals` vinculada a este cliente (mesmo que a assinatura ainda esteja `pending`).
  - `last_payment_status`: último `mp_payments.status` do cliente (`approved`, `rejected`, `cancelled`, `pending`…).
- Sem a RPC o frontend cai no estado "Aguardando pagamento".

## 3. RPCs já existentes usadas
`claim_mp_preapproval(p_id)` (retorna `{result}`: `linked|already_linked|waiting_confirmation|…`), `mp_checkout_url()`,
`my_account` (view), `reserve_book` (erro `no_active_subscription` → mensagem clara na UI).

## 4. Configuração no Mercado Pago (texto exato)
- **URL de retorno (back_url) do plano:** `https://muitasconversas.vercel.app/assinar/concluir`
  (o plano de assinatura precisa ser recriado/editado com essa back_url; hoje volta para `/conta`).
- **Webhook:** `https://fzkdhtutpgydywpzapyc.supabase.co/functions/v1/mercadopago-webhook`
  eventos: `subscription_preapproval`, `subscription_authorized_payment`, `subscription_preapproval_plan`, `payment`.

## 5. O que o frontend faz sozinho
- Qualquer rota recebendo `?preapproval_id=` é redirecionada (middleware) para `/assinar/concluir?preapproval_id=…`;
  sem login vai para `/entrar?next=/assinar/concluir?preapproval_id=…` e volta depois do link mágico.
- `/assinar/concluir` e `/conta` (pendente/atrasada/vencida) mostram "Já paguei, verificar agora" e conferem sozinhos
  (ao abrir e a cada 20 s, até 6 vezes).
- Reservar/agendar sem assinatura ativa: aviso na página do livro e mensagens de erro claras.
- Não existe tela de "cancelar reserva" no frontend hoje (só cancelar visita); se a RPC existir, avisar para criarmos.
