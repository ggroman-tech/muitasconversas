# Checklist de lançamento (R$ 1 de teste → R$ 30 real)

Marque na ordem. Nada aqui foi executado pela revisão noturna.

## 1. Preço e plano
- [ ] Criar no Mercado Pago o plano de **R$ 30,00 / mês** (assinatura recorrente, cartão). Confirmar que **Pix não é oferecido** em plano recorrente.
- [ ] Anotar o novo `mp_plan_id` e atualizar `settings.mp_plan_id`.
- [ ] `settings.plan_price_cents` = `3000` (o alerta de valor da 0089 compara com isso).
- [ ] `lib/plan.ts`: voltar de R$ 1 para R$ 30 (texto da página /assinar e /conta).
- [ ] No plano do MP, `back_url` = `https://muitasconversas.vercel.app/assinar/concluir` (hoje volta para outro lugar).
- [ ] Teste real com **uma segunda conta pagante** (a assinatura do Gabriel fica ativa): pagar, aparecer como ativo, pedir cancelamento, conferir que o MP cancelou (`PUT /preapproval` ainda não foi confirmado em plano hospedado) e que o acesso vai até o fim do período.

## 2. Mercado Pago / segredos
- [ ] Credenciais de **produção** (não de teste) nos secrets das edge functions; as antigas, coladas no chat, já foram renovadas — não reutilizar.
- [ ] Webhook cadastrado no painel MP apontando para a função `mercadopago-webhook`, com o segredo de assinatura nos secrets.
- [ ] Secret `mc_sync_secret` no vault e o cron `mc-mp-sync` (5 min) ativo.
- [ ] Remover o plano de R$ 1 (ou desativá-lo) para ninguém assinar por ele.

## 3. Banco (aplicar nesta ordem, uma por vez, conferindo o painel)
- [ ] 0088 → 0089 → 0090 → 0091 → 0092 → 0094; 0095/0093 só com autorização (ver INDEX-backend.md).

## 4. E-mail
- [ ] SMTP próprio no Supabase Auth (Resend/outro) com domínio verificado (SPF/DKIM) — o SMTP padrão tem limite baixo e cai em spam; magic link depende disso.
- [ ] Se for usar os e-mails transacionais: secrets `RESEND_API_KEY`/`RESEND_FROM` e deploy de `send-emails`.

## 5. Jurídico e comunicação
- [ ] Termos de uso, política de privacidade (LGPD) e política de cancelamento/reembolso publicados e linkados no cadastro e no rodapé.
- [ ] Texto claro de cobrança recorrente e de "acesso até o fim do período" na tela de assinatura.
- [ ] Canal de suporte (e-mail/WhatsApp) visível.

## 6. Operação
- [ ] Alguém olha `staff_alerts` (0089) diariamente — falta tela no painel.
- [ ] Rodar `get_advisors` de novo após aplicar as migrations.
- [ ] Ativar proteção contra senhas vazadas no Auth (só vale se algum dia usar senha).
