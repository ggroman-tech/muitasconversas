
## Frontend

**Feito (local, sem push):**
- Modo teste removido do código: botão em `app/(auth)/entrar/page.tsx` e imports. Os arquivos `lib/auth/test-login.ts`, `lib/auth/test-login-core.ts` e `app/(auth)/entrar/teste/route.ts` foram movidos para `_to_delete/test-login/` (a pasta está no `.gitignore`, `tsconfig` e `eslint`); o shell não pode apagar. Sobra uma pasta vazia `app/(auth)/entrar/teste/`, que o Git ignora. O Gabriel pode apagar `_to_delete/` e essa pasta.
- Preço de produção: `lib/plan.ts` → `PLAN_PRICE = "R$ 45"` e `PLAN_PRICE_FULL = "R$ 45,00"` (decisão do Gabriel: R$ 45/mês). Não há valor fixo em outros arquivos; `/assinar/concluir`, `signup-form` e `conta-view` leem `settings.plan_price_cents` do banco.
- Cabeçalhos de segurança em `next.config.ts` (G6): HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`; CSP em **Report-Only** (Next injeta scripts inline; sem nonce por enquanto). `connect-src` só `self` + Supabase `fzkdhtutpgydywpzapyc`; `img-src` aceita `https:` por causa das capas do Libib; fontes do Google liberadas. Mantive o `distDir` do painel local.
- `npx tsc --noEmit` e `npx eslint .` sem erros. `vitest` não roda neste ambiente (rollup nativo ausente): o Gabriel precisa rodar `npm test` / `npm run build` no Windows.

**Depende de ação no banco/Backend (nesta ordem, só depois do plano real existir):**
1. `settings.plan_price_cents` = **4500**.
2. `settings.mp_plan_id` = id do plano real de R$ 45 (criado com token de produção).
3. Remover Edge Function `test-login`, RPC `test_login_enabled` e a linha `test_login_until` de `settings`. O site já não chama nada disso.
4. O texto do site só mostra R$ 45 de forma coerente quando 1 e 2 estiverem feitos.

**Textos que precisam de decisão (Financeiro/Gabriel):**
- Reembolso: hoje o site diz "o período já pago não é reembolsado" (`app/page.tsx` FAQ, `app/regras/page.tsx`, `app/conta/cancel-subscription-form.tsx`, `app/conta/conta-view.tsx`). Não vou alterar esse texto sem decisão. Existe proposta 0091 (reembolso e estorno) no repo.
- Carência de pagamento (proposta 0090): se aprovada, a regra precisa de texto em `/regras` e em `/conta`.
- Direito de arrependimento (CDC art. 49, 7 dias para compra online): ponto para o Financeiro/jurídico confirmar antes de manter "sem reembolso".

## Financeiro
*Analista financeiro, 25/11/2026 (revisado para R$ 45). Só leitura no banco; nada foi alterado. Números de taxa vêm de páginas públicas do Mercado Pago e precisam ser conferidos na conta do Gabriel (taxa é por conta).*

### 1. Economia do plano de R$ 45/mês (cartão, frequência 1 mês) — preço atualizado pelo Gabriel (antes R$ 30)
| Item | Receba na hora (4,49%) | Receba em 30 dias (3,99%) |
|---|---|---|
| Bruto | R$ 45,00 | R$ 45,00 |
| Taxa MP | R$ 2,02 | R$ 1,80 |
| Líquido | R$ 42,98 | R$ 43,20 |
- Fonte: página "Assinaturas" do Mercado Pago (mercadopago.com.br/ferramentas-para-vender/assinaturas): crédito 4,49% na hora e 3,99% em 30 dias. A página **não informa taxa fixa por transação nem diz se vale para recorrência**; conferir em "Custos" no painel do MP e nos termos de assinaturas.
- Imposto: o modelo do projeto prevê mensalidade no Anexo III do Simples (1ª faixa ~6%; confirmar com o contador) → R$ 2,70. Líquido após MP (na hora) e imposto: **~R$ 40,28** (R$ 40,50 se receber em 30 dias). Sobre R$ 30 seria ~R$ 26,85: o aumento de R$ 15 no preço traz ~R$ 13,43 a mais por assinante/mês.
- **Comparação com o modelo do projeto:** `modelo-economico-gavea.md` trata da livraria física com clube de membros de **R$ 59** (10% de desconto em livros). A assinatura de **R$ 45 com entrega em casa** é outro produto e **não tem modelo de custo no projeto** (frete de ida e volta, desgaste/reposição dos livros, equipe). R$ 45 fica 24% abaixo dos R$ 59 do clube. Isso não prova nada, porque o clube não inclui entrega, mas indica que o preço está dentro da faixa que o próprio modelo já usa para esse tipo de mensalidade.
- Sensibilidade (premissa minha, não dado): margem de contribuição por assinante/mês = R$ 40,28 − custo de entrega+coleta por troca × trocas/mês − reposição de livros. Com 1 troca/mês: entrega a R$ 8 → R$ 32,28; R$ 12 → R$ 28,28; R$ 16 → R$ 24,28; R$ 20 → R$ 20,28 (antes de reposição e pessoal). Com R$ 30 os mesmos custos davam R$ 18,85 / 14,85 / 10,85 / 6,85.
- **O preço faz sentido?** Do lado do custo, sim: R$ 45 deixa folga para absorver entrega cara (até ~R$ 20 por troca ainda sobra ~R$ 20) e cobre taxa e imposto com ~89% de aproveitamento. R$ 30 era frágil (margem de R$ 7 se a entrega custar R$ 20). Do lado da demanda, **o projeto não tem nenhum dado**: nem pesquisa de preço, nem concorrência, nem disposição a pagar. R$ 45 por mês para um livro por vez, com um livro cada 28 dias, equivale a ~R$ 1,60/dia de acesso; o cliente compara com comprar usado ou com o clube. Recomendo manter R$ 45, **acompanhar conversão do cadastro para pagamento e cancelamento do 1º mês** nas primeiras semanas e, se a conversão for fraca, usar um plano promocional de entrada (novo plano no MP) em vez de reduzir o preço base.
- **Decidir o preço final ANTES de criar o plano de produção:** o plano do MP guarda o valor; mudar depois exige criar outro plano e migrar quem já assinou. R$ 45 é o valor a criar (`amount: 45`).

### 2. Ciclo financeiro (leitura das funções e do banco)
Cobertura confirmada em `mp_reconcile` / `apply_mp_authorized_payment` / `mc_expire_subscriptions`:
| Evento | Tratamento | OK? |
|---|---|---|
| Ativação (1º pagamento aprovado) | `payments` paid, sub active, `current_period_end` = hoje + 30 | ✅ |
| Renovação | soma 30 dias sobre o fim do período vigente (ou hoje, se vencido) | ✅ (ver L2) |
| Pagamento recusado | `payments` failed, sub → past_due, e-mail_log `payment_failed` | ✅ (ver L7) |
| Aprovação posterior a uma recusa | volta para active | ✅ |
| Atraso por falta de cobrança | cron diário marca past_due quando `period_end < hoje` | ⚠️ L2 |
| Cancelamento | MP `cancelled`: mantém active com `cancel_requested_at` até o fim do período, depois `canceled`; libera reservas/cópias | ✅ |
| Reativação | `resubscribe()` + pendente novo; vincula no pagamento | ✅ |
| Pagamento após cancelamento | registra e dispara alerta `payment_after_cancel` em `email_log` | ✅ (só registro, ver L7) |
| Pagamento sem cliente | `painel_mp_unlinked` + vínculo manual | ✅ |
| Reembolso / chargeback | **não tratado**: status `refunded`/`charged_back` é ignorado e o acesso continua | ❌ L3 |

Settings hoje: `plan_price_cents=100`, `mp_plan_id=a8e6917d…` (plano **de teste**), `overdue_block_enabled=true`, `overdue_block_grace_days=0` (esta é carência de **atraso de livro**, não de pagamento). As views `painel_*` não têm preço fixo; mostram `last_amount_cents` do pagamento. O preço aparece no site por duas fontes: `settings.plan_price_cents` (conta, cadastro, concluir) e a constante `PLAN_PRICE`/`PLAN_PRICE_FULL` em `lib/plan.ts` (home, `/assinar`, catálogo); o Frontend já a mudou para R$ 45 (local, sem push), mas `plan_price_cents` no banco ainda é 100.

**Lacunas concretas**
- **L1 Valor do pagamento não é validado.** `mp_reconcile` credita 30 dias para qualquer pagamento aprovado, de qualquer valor, e o plano real é só `mp_plan_id`. A assinatura de produção de R$ 1 (preapproval `64c56c157682477cb0b49092980d38bf`) continua cobrando e, se o sync a ler, concede 30 dias por R$ 1. Ação: cancelar essa assinatura antes do lançamento e fazer o sync/`mp_reconcile` alertar quando `transaction_amount` ≠ `plan_price_cents` ou o plano ≠ `mp_plan_id`.
- **L2 Período de 30 dias fixos x cobrança mensal.** O plano usa frequência de 1 mês; o banco soma 30 dias. Em meses de 31 dias o fim do período antecede a próxima cobrança em 1 dia, e o cron das 03h BRT já marca `past_due`. Sem a carência (0090, não aplicada) o cliente pagante cai em atraso por um dia a cada poucos meses. Ação: aplicar a 0090 (carência de 3 dias) e/ou trocar `+30` por `+ interval '1 month'`; textos do site dizem "a cada 30 dias" enquanto o MP cobra "a cada mês": alinhar o texto ("todo mês") ou o plano (frequência 30 dias).
- **L3 Estorno sem efeito no acesso** (0091 pronta, não aplicada, depende da 0089).
- **L4 `plan_price_cents` e `mp_plan_id` são independentes.** `mercadopago-create-plan` grava só `mp_plan_id`. Se um dos dois ficar velho, o site mostra um preço e o MP cobra outro. Ação: a função deve gravar os dois juntos (ou o go-live deve atualizar os dois no mesmo comando).
- **L5 Registros de teste no financeiro.** Existe pagamento aprovado de R$ 1 (`190057198175`) e o cliente de teste com assinatura pendente. Para o painel e qualquer relatório de receita não misturar teste com produção, marcar/limpar antes do lançamento.
- **L6 Sem visão de receita para o dono.** Não há view de MRR, churn, inadimplência e receita líquida; só a lista de assinaturas. Sugestão: view `painel_financeiro` (assinantes ativos x valor, cancelamentos no mês, past_due, pagamentos do mês).
- **L7 Ninguém é avisado.** `payment_failed` e `payment_after_cancel` só entram em `email_log`; sem a 0089 (alertas internos) e sem SMTP, a equipe só descobre abrindo o painel. Um pagamento aprovado após cancelamento (cliente cobrado sem direito) precisa de resposta em horas.
- **L8 Sync instável:** ~19% de falhas por 429 do MP (relatório de segurança A7). Um pagamento pode demorar a ser reconhecido; a janela é grande o bastante para cliente pagar e ver "aguardando".
- **L9 Código legado `apply_pagarme_event`/`pagarme-webhook`**: sem uso; remover para reduzir superfície.

### 3. Decisões pendentes — recomendação
**(a) Reembolso no cancelamento.** Fatos (fontes secundárias, não é parecer jurídico): o art. 49 do CDC dá 7 dias de arrependimento em contratação **fora do estabelecimento, inclusive internet**, com devolução integral do valor, sem multa, pelo meio de pagamento original (Serasa: serasa.com.br/blog/direito-de-arrependimento-prestacao-de-servicos). O InfoMoney informa que o Procon-SP associa os 7 dias ao prazo de arrependimento e que o cancelamento deve estar disponível pelo mesmo canal da contratação (infomoney.com.br/?p=3109974). **Nenhuma das duas fontes diz se cada renovação mensal abre novo prazo de 7 dias.**
→ **Recomendo:** reembolso integral se o cancelamento ocorrer em até **7 dias corridos da primeira cobrança** (acesso termina na hora do reembolso; fazer o estorno no painel do MP e depender da 0091 para retirar o acesso); **sem reembolso de ciclos já usufruídos** depois disso, com acesso até o fim do período (como está). Trocar o texto atual "O período já pago não é reembolsado" por: "Cancelando em até 7 dias da primeira cobrança, devolvemos o valor. Depois, o acesso segue até o fim do período pago, sem reembolso." Validar com advogado ou Procon antes de abrir.
**(b) Carência de pagamento:** aplicar **3 dias** (0090). Cartão recusado costuma ser reprocessado pelo MP e a carência elimina o falso atraso da L2. Custo: até 3 dias de acesso sem cobrança por inadimplente, ≈ R$ 4,50 por caso (R$ 45 ÷ 30 × 3). Corrigir o front (`lib/assinatura/state.ts`) para tratar período vencido dentro da carência como ativo.
**(c) Resend/SMTP:** **obrigatório antes do lançamento.** O 429 `over_email_send_rate_limit` que bloqueou o login hoje é o limite do e-mail embutido do Supabase. Resend exige **domínio próprio** (SPF/DKIM); o site está em `muitasconversas.vercel.app`, onde não dá para verificar DKIM. Registrar o domínio (confirmar preço no Registro.br), criar remetente `@dominio` e configurar o SMTP no Supabase Auth. Confirmar os limites do plano gratuito do Resend no site deles (não verifiquei).

### 4. Checklist financeiro de go-live (ordem)
1. **Decidir o preço final e os textos** (R$ 45; "todo mês" vs "30 dias"; política de reembolso). Pré-requisito do passo 6.
2. Backend aplica 0089 → 0090 → 0091 (branch/rollback primeiro) e o alerta de valor/plano (L1). Front ajusta o estado da carência.
3. **Gabriel salva o Access Token de PRODUÇÃO** em Supabase → Edge Functions → Secrets (`MERCADOPAGO_ACCESS_TOKEN`). Hoje está o de teste.
4. **Cancelar a assinatura real de R$ 1** (`64c56c157682477cb0b49092980d38bf`) pelo botão do site na conta de admin (já com o token de produção). Isso também valida o cancelamento real, ainda não testado. Conferir: status `cancelled` no MP, `cancel_requested_at` preenchido, acesso até 22/12. Se o botão falhar, cancelar no painel do MP.
5. Apagar a linha `test_login_until` e a função `test-login`; limpar o cliente de teste e o pagamento de R$ 1 (L5).
6. **Criar o plano de produção:** `mercadopago-create-plan` com `{"amount":45,"allow_production":true}`; confirmar no painel do MP (valor R$ 45, mensal, só cartão) e gravar `plan_price_cents=4500` junto com `mp_plan_id` (L4). O Frontend já alterou `lib/plan.ts` para R$ 45: publicar depois que `plan_price_cents` e `mp_plan_id` estiverem no banco. Depois apagar a função `mercadopago-create-plan` e rotacionar token/segredos (segurança A8).
7. **Primeiro pagamento real de verificação** com cartão do próprio Gabriel numa conta cujo e-mail do MP seja igual ao do login do site (senão cai em "Pagamentos sem cliente"). Conferir: `mp_preapprovals`, `payments` com `amount_cents=4500`, sub `active`, `current_period_end` = hoje+30, `painel_subscriptions`, ausência de pendências em `painel_mp_unlinked`.
8. **Testar o reembolso de 7 dias** com esse mesmo pagamento (estorno no painel do MP): o acesso deve cair via 0091 e o alerta `payment_reversed` aparecer.
9. **Conciliação diária na 1ª semana e semanal depois:** soma de `payments` paid x extrato "Atividades" do MP (bruto, taxa, líquido); `mp_sync_log` sem falhas seguidas; nenhum `payment_after_cancel` sem resposta; cliente `past_due` x recusas no MP.
10. Só então abrir cadastro ao público (junto com os gates de segurança G1–G12 do relatório).

## Backend

**Preço (decisão do Gabriel, repassada pelo coordenador): R$ 45,00/mês → `plan_price_cents = 4500`; `create-plan` roda com `amount: 45`.**

**Arquivos preparados (nada aplicado em produção, nada deployado):**
- `supabase/migrations/0097_golive.sql` — remove a RPC `test_login_enabled()` e a linha `settings.test_login_until`. Seguro de aplicar já (o site não chama mais nada disso, conforme a seção Frontend).
- `propostas/golive-passo-preco.sql` — `plan_price_cents = 4500`, **com guarda**: falha se `mp_plan_id` ainda for o plano de teste (`a8e6917d…`) ou o de R$ 1 (`138ede94…`). Rodar só depois do create-plan de produção.
- `propostas/golive-cron-sync-10min.sql` — `cron.alter_job(2, '*/10 * * * *')` (hoje `mc-mp-sync` é `*/5`). Aplicar depois do deploy da nova `mercadopago-sync`.
- `supabase/functions/mercadopago-sync/index.ts` (A7): retry com espera exponencial em 429 (respeita `Retry-After`, máx. 3 tentativas), timeout de 15 s por fetch, assinaturas pendentes/ativas/pausadas primeiro, canceladas só reaplicam o estado da busca (sem consultar cobranças), orçamento de 100 s por execução, `users/me` com 429/5xx registra `mp_unavailable` em vez de falhar. Logs: `detail.retries429`, `detail.ms`. Medição antes: 60 de 288 execuções falharam em 24 h, todas por 429.
- `mercadopago-claim` e `mercadopago-cancel` (A9): CORS restrito a `https://muitasconversas.vercel.app` (env opcional `SITE_ORIGIN`). As chamadas do site vêm de Server Actions (servidor a servidor), então nada muda para o usuário.
- Verificação: sintaxe TypeScript conferida com `node --experimental-strip-types --check`; **não rodei as funções** (sem deploy). O coordenador faz o deploy.

**Ordem de go-live (Backend):**
1. Frontend publicado sem o modo teste (`atualizar-github.bat`).
2. Deploy de `mercadopago-sync`, `-claim`, `-cancel` (versões novas). Aplicar `0097_golive.sql`.
3. Gabriel salva `MERCADOPAGO_ACCESS_TOKEN` de **produção** em Edge Secrets (o botão "Cancelar" só alcança a assinatura real de R$ 1 com esse token).
4. Gabriel cancela a assinatura real de R$ 1 (`64c56c15…`) pelo botão do site (conta admin) ou pelo painel do MP. **Antes** de `mp_plan_id` mudar (correção do Financeiro): depois da troca, sync/claim tratam a assinatura como `other_plan`.
5. `create-plan` (versão do repo, que agora grava também `plan_price_cents`) com `{ "amount": 45, "allow_production": true }` → grava `mp_plan_id` e `plan_price_cents = 4500`. Conferir `mp_checkout_url()` e `signup_config()`.
6. `propostas/golive-passo-preco.sql` só se o create-plan antigo (v3 deployado, que não grava o preço) for o que rodou; com a versão do repo ele é redundante, mas inofensivo (idempotente).
7. Cron para 10 min. Apagar `test-login` e `mercadopago-create-plan` (A8, G12). Rotacionar `MERCADOPAGO_ACCESS_TOKEN`, `WEBHOOK_SECRET` e `mc_sync_secret` (G8).
8. Teste real de ponta a ponta com 1 pagamento de R$ 45 (cartão do Gabriel) e conferir `my_payment_state` e `mp_payments.amount = 45`.

**Interfaces para os outros devs:**
- Preço lido de `settings.plan_price_cents` por `signup_config()` e pela view `my_account` (campo `plan_price_cents`). Nenhuma função valida o valor cobrado contra esse setting.
- `settings.mp_plan_id` é jsonb string; o sync, o webhook e o claim filtram assinaturas por esse plano.
- Não há mais RPC de teste. O Frontend não deve chamar `test_login_enabled`.

**Riscos concretos encontrados (só os reais):**
1. **Nenhuma validação do valor pago.** `apply_mp_authorized_payment` não compara o valor da cobrança com `plan_price_cents`: se `mp_plan_id` apontar para um plano de outro valor, o acesso é liberado mesmo assim. Mitigação no go-live: passo 8 (conferir o valor do primeiro pagamento) e a guarda do `golive-passo-preco.sql`. Proposta futura: alerta quando `amount <> plan_price_cents`.
2. **Assinatura do próprio Gabriel (plano antigo de R$ 1).** Depois da troca de plano, sync e webhook ignoram assinaturas de outro plano ("other_plan"). Se ela não for cancelada no Mercado Pago, continua cobrando R$ 1/mês sem que o site saiba. A conta dele no banco fica ativa até 22/12 e depois expira pelo `mc_expire_subscriptions`. Cancelar no passo 3.
3. **E-mail do pagador diferente do e-mail de login.** O `claim` só libera quando os e-mails são iguais; caso contrário devolve `email_mismatch` e o pagamento fica em "Pagamentos sem cliente" até a equipe vincular em `/painel/assinaturas`. Com clientes reais (conta do Mercado Pago com e-mail diferente do Gmail do site) isso vai acontecer. O painel agora roda só no computador do Gabriel (decisão da Segurança), então ele precisa olhar essa fila todo dia no lançamento, ou o Frontend deve instruir o cliente a pagar com o mesmo e-mail.
4. **`cancel` tem um caminho com resposta de erro mesmo cancelando no MP** (`not_applied`): o MP cancela, o banco ainda não refletiu. É seguro repetir (o segundo PUT falha, o GET confirma `cancelled` e segue) e o sync reconcilia em até 10 min. Sem correção necessária; o texto do site não deve prometer "imediato" nesse caso.
5. **Webhook de assinatura não vem pelo painel "Suas integrações"**; o sync é o caminho principal. Com 10 min de intervalo, o pior caso de atraso para liberar acesso é ~10 min sem o botão "Verificar pagamento". Mantenha o botão visível na tela de pendente.
6. **`test-login` e `create-plan` têm `verify_jwt=false` e usam `service_role`.** O MCP não apaga função: sobrescrever com um stub que devolve 410 ou apagar no painel do Supabase. Enquanto existirem, `test-login` só responde com `test_login_until` no futuro (a 0097 apaga a RPC; a função passa a falhar com 500), e `create-plan` exige `x-sync-secret`.
7. **`mercadopago-claim` ainda não tem timeout nem rate limit** (A6). Cada clique faz ~3 a 5 chamadas ao MP. Risco de 429 em picos; fora do escopo desta rodada.
8. **Carência de pagamento (0090) e reembolso (0091) não estão aplicados.** Hoje, falha de cobrança leva a `past_due` e o acesso segue as regras atuais (ver 0088). Decisão de produto do Gabriel pendente.

## Backend – conciliação

*Lidas as seções Financeiro e Frontend. A seção Segurança ainda não existia quando fechei: conferir quando entrar (principalmente remoção de `test-login`/`create-plan`, rotação de segredos e o que ela decidir sobre CSP).*
- **Ordem do token x cancelamento:** o Financeiro tem razão; corrigi a lista do Backend (token de produção → cancelar R$ 1 → create-plan).
- **L4 (preço e plano gravados juntos): acatado.** `mercadopago-create-plan` do repo agora grava `plan_price_cents = round(amount*100)` depois de `mp_plan_id`. **A versão deployada (v3) ainda não faz isso**: o coordenador precisa fazer o deploy do arquivo do repo antes de rodar o go-live. Com ela, `golive-passo-preco.sql` fica só como rede de segurança.
- **L1 (valor pago não validado): parcialmente acatado.** O sync agora registra `amount_mismatch` em `mp_sync_log.error` quando a cobrança difere de `plan_price_cents` (a assinatura continua sendo reconhecida; o alerta é para o Gabriel agir). Bloquear o acesso por valor errado exigiria mudar `mp_reconcile` (fora desta rodada).
- **Janela de inconsistência do Frontend:** concordo. Como `lib/plan.ts` (R$ 45) vai no mesmo push do site e `plan_price_cents` só muda no create-plan, **o passo 1 da minha ordem (publicar o Frontend) deve acontecer junto dos passos 3–5, no mesmo dia, ou o Gabriel aceita a janela sem divulgar o site**. Não é bloqueio técnico: nenhum cliente real consegue pagar o plano de teste.
- **"A cada 30 dias" x mês (L2):** posição do Backend: o banco soma 30 dias fixos; a carência de 3 dias (0090) elimina o falso atraso. Recomendo texto "todo mês" no site e aplicar a 0090. Não aplico nada de banco além da 0097.
- **0089 → 0090 → 0091:** concordo com a ordem e com aplicar antes de abrir ao público; exigem branch/teste e decisões do Gabriel (carência, reembolso), então não toquei nelas.
- **Intervalo de 10 min:** o Frontend já ajustou o texto para "até 10 minutos"; só depois que o cron mudar de fato (arquivo `golive-cron-sync-10min.sql`). Até lá o texto é conservador.
- **Risco 3 (e-mail do pagador):** coberto pelo aviso na tela do Frontend; a fila "Pagamentos sem cliente" continua dependendo do painel local do Gabriel.

## Financeiro – conciliação
*Lida a seção Backend e a seção Frontend (R$ 45). A seção Segurança ainda não existia quando fechei; conferir os pontos 6 e 7 abaixo quando ela entrar.*

1. **Preço: alinhado.** Financeiro, Backend (`amount: 45`, `plan_price_cents = 4500`) e Frontend (`lib/plan.ts` = R$ 45) coincidem. Cuidado com a janela de inconsistência: o Frontend em produção passa a mostrar R$ 45 em home, `/assinar` e catálogo, mas `/conta` e `/assinar/concluir` leem `plan_price_cents` (ainda 100) e o plano ativo é o de teste (R$ 1). Enquanto os passos 5 e 6 do Backend não ocorrerem, **não divulgar o site nem abrir cadastro**; nenhum cliente real consegue pagar (o plano é da conta vendedora de teste).
2. **Ordem do token x cancelamento: corrigir a lista do Backend.** No Backend o passo 3 (cancelar o R$ 1) vem antes do passo 4 (salvar o token de produção), mas o próprio texto diz que o cancelamento só alcança a assinatura depois do token de produção. Ordem correta, igual à do Financeiro: **token de produção → cancelar R$ 1 → create-plan → preço**. O cancelamento precisa acontecer **antes** de `mp_plan_id` mudar: depois da troca, sync/claim ignoram a assinatura como `other_plan` e o `mercadopago-cancel` pode devolver `not_applied`, deixando o banco sem `cancel_requested_at`.
3. **Risco 1 do Backend = L1 do Financeiro** (valor pago não validado). Concordo com a mitigação do go-live (guarda do `golive-passo-preco.sql` + conferir o primeiro pagamento). Falta, para depois: alerta quando `amount ≠ plan_price_cents`.
4. **Risco 3 do Backend (e-mail do pagador ≠ e-mail de login) é risco financeiro**, não só de operação: o cliente paga R$ 45 e fica sem acesso até alguém vincular. Recomendo (a) o Frontend avisar na tela de pagamento "use no Mercado Pago o mesmo e-mail do cadastro", (b) meta de vínculo em até 2 horas úteis no lançamento, (c) enquanto não houver SMTP/alerta (L7), o Gabriel olha "Pagamentos sem cliente" toda manhã e à noite.
5. **Carência (0090), reembolso (0091) e alertas (0089):** o Backend os marca como não aplicados e pendentes de decisão. Recomendação do Financeiro (seção 3): aplicar 0089 → 0090 (3 dias) → 0091 **antes de abrir ao público**; o reembolso de 7 dias pelo painel do MP só funciona de ponta a ponta com a 0091. O Frontend precisa então atualizar os 4 textos de reembolso e o estado da carência em `lib/assinatura/state.ts`.
6. **Intervalo do sync em 10 min:** aceitável financeiramente (liberação do acesso em até ~10 min; o botão "Verificar pagamento" cobre o resto). Manter o botão visível na tela de pendente, como o Backend sugere.
7. **A conferir com a Segurança:** (a) a conta de teste (`gabrielgarciaroman+teste@gmail.com`) e o pagamento de R$ 1 saírem do banco antes do lançamento (L5) e (b) o painel rodar só local: a fila de "Pagamentos sem cliente" e os alertas financeiros dependem de o Gabriel abrir o painel no computador; sem notificação (L7) um pagamento aprovado depois de cancelamento pode ficar horas sem resposta.
8. **Texto "a cada 30 dias" x cobrança mensal (L2):** o Frontend não mexeu. Decisão do Gabriel: trocar o texto para "todo mês" (recomendado, combina com o plano do MP) ou criar o plano com frequência de 30 dias.

## Frontend – conciliação

*(A seção `## Segurança` ainda não existia quando concilei; CSP/cabeçalhos ficam em Report-Only até ela se manifestar.)*
- **Preço:** a seção Financeiro foi escrita para R$ 30; vale a decisão do Gabriel de **R$ 45**, então as contas de margem dela precisam ser refeitas. `lib/plan.ts` já está em R$ 45; o banco ainda guarda R$ 1 (`plan_price_cents=100`) até o passo 6 do Backend. Até lá o site mostra R$ 45 em home, `/assinar` e catálogo, e R$ 1,00 em `/conta`, cadastro e concluir. Não publicar esta versão sem aplicar `golive-passo-preco.sql` logo em seguida.
- **"A cada 30 dias" × cobrança mensal (L2):** não mexi; depende de decidir entre "todo mês" e plano de 30 dias. Se ficar mensal, troco o texto em `app/page.tsx`, `app/regras/page.tsx`, `app/assinar/page.tsx`, `signup-form.tsx`, `conta-view.tsx`, `concluir/page.tsx` e `catalogo/[id]/page.tsx` em uma passada.
- **Reembolso:** o texto atual (sem reembolso do período já pago) fica até o Gabriel decidir. Se ele aprovar a recomendação do Financeiro (7 dias), troco em `app/page.tsx`, `app/regras/page.tsx`, `cancel-subscription-form.tsx` e `conta-view.tsx`.
- **Tempo de confirmação:** com o sync em 10 min (Backend), `/assinar/concluir` agora diz "até 10 minutos" (era 5). O botão "Já paguei, verificar agora" segue na tela de pendente e a tela pede "o mesmo e-mail desta conta" (risco 3 do Backend coberto).
- **Carência (0090):** se aplicada, `lib/assinatura/state.ts` precisa tratar período vencido dentro da carência como ativo; não mudei porque a 0090 não está aplicada.

## Segurança
*Dev de Segurança, 26/11/2026 (00:55 UTC). Verificação só de leitura: advisors, catálogo do Postgres, Edge Functions, cron, Vault (só nomes), código local e histórico do Git.*

### 1. Estado atual verificado
- **Advisors (segurança):** 11 ERROR `security_definer_view` (as views `painel_*`, `my_account`, `catalog_*`, `saturday_route`, `overdue_loans`; protegidas por `WHERE`/`mc_is_staff` internos, A5, sem mudança), WARN `citext` em `public`, **WARN `leaked password protection` desligada**, 13 INFO "RLS sem policy" (intencional: tabelas só acessadas por funções/`service_role`).
- **Funções SECURITY DEFINER executáveis por `anon`:** `check_service_area` e `signup_config` (públicas por desenho) e **`test_login_enabled` (a remover)**. As 27 executáveis por `authenticated` foram conferidas: todas têm guarda interna (`mc_require_customer`, `mc_require_ops_or_service`, `mc_is_staff`/`mc_staff_role` ou `auth.uid()`). Sem achado novo.
- **Edge Functions (6, todas `verify_jwt=false`):** `claim`/`cancel` validam o JWT com `getUser` dentro; `sync`/`create-plan` exigem `x-sync-secret` (Vault); `webhook` valida HMAC e **falha fechado** sem segredo; **`test-login` está ativa** e só responde enquanto `settings.test_login_until` (até 26/11 09:37 BRT) estiver no futuro; sem a RPC ela passa a devolver erro, ou seja, falha fechado.
- **Cron:** `mc-mp-sync` (`*/5`, jobid 2) e `mc-expire-subscriptions` (diário). O segredo do sync vem do Vault na hora; não há segredo em texto no cron.
- **Auth:** 3 usuários com senha, **0 fatores MFA**, 1 admin (`staff_members`).
- **Sync:** 60 de 288 execuções falharam em 24 h (≈ 21%), todas por 429. A correção está no código local, **não deployada**.
- **Segredos no repositório:** nenhum no código atual nem no histórico (só o texto-modelo `APP_USR-...`).

### 2. Parecer do pacote de go-live
| Item | Parecer | Correção exata |
|---|---|---|
| `0097_golive.sql` (remove RPC e a linha de `settings`) | **OK** | Aplicar só depois de o site sem o botão estar publicado (ordem do Backend está certa). |
| Remoção do modo teste no Frontend | **OK** | Conferir com `git grep -n "test-login\|test_login"`: só podem sobrar `0096`, `0097` e a função no Supabase. Apagar `_to_delete/` e a pasta vazia `app/(auth)/entrar/teste/` à mão. |
| Função `test-login` ainda no ar | **Corrigir (baixa)** | Hoje fecha sozinha às 09:37 BRT e depois da `0097` falha fechado. Mesmo assim, neutralizar ou apagar no go-live (`propostas/rotacao-segredos-golive.md`, passo 8). |
| `mercadopago-sync` (retry/orçamento) | **OK** | Sem segredo em log (só ids e tamanho do token). Observação: o `timeout_milliseconds := 55000` do cron é só a espera do `pg_net`; a função segue rodando até 100 s. Aceitável. |
| `golive-cron-sync-10min.sql` | **Corrigir** | `job_id := 2` é frágil. Trocar por: `select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'mc-mp-sync'), schedule := '*/10 * * * *');` |
| `claim` / `cancel` (CORS restrito) | **OK** | As chamadas são servidor a servidor; JWT validado com `getUser`. Rate limit continua pendente (A6/G7). |
| `create-plan` do repo (grava `plan_price_cents`) | **OK com ressalva** | Mantém a trava `TEST*`/`allow_production` e o `x-sync-secret`. **Ressalva:** `back_url` fixa no domínio da Vercel (ver "Domínio" abaixo). Apagar depois de usar. |
| `mercadopago-webhook` | **OK** | HMAC em tempo constante, janela de 1 h, releitura na API, log sem corpo. Sem segredo configurado devolve 500 (não aceita sem assinatura). |
| `golive-passo-preco.sql` | **OK** | Redundante com o `create-plan` do repo; a guarda só barra dois ids antigos, aceitável. |
| `next.config.ts` (cabeçalhos) | **OK com ressalvas** | (a) CSP em Report-Only **sem `report-uri`/`report-to` não coleta nada**: só aparece no console do navegador; conferir lá antes de impor. (b) Ao impor, incluir `form-action 'self' https://www.mercadopago.com.br` (senão o redirecionamento do formulário para o checkout é bloqueado). (c) Sem nonce, `'unsafe-inline'` em `script-src` protege pouco contra XSS; aceitável no lançamento, não é gate. (d) HSTS sem `preload`: correto. |
| Painel local/MFA (rodada da Segurança, ainda local e sem commit) | **Pendente de teste** | Depois do deploy, confirmar que `https://…/painel` e `/mfa` respondem 404 no site público (sem `PAINEL_LOCAL`). |
| Ordem do go-live (Backend + Financeiro) | **OK, com a ordem do Financeiro** | Token de produção → cancelar R$ 1 → create-plan → preço. |

### 3. Achados novos desta rodada
- **N1 (Média) Domínio × plano do MP:** a `back_url` fica gravada no plano. Decidir o domínio **antes** de criar o plano de R$ 45 (ou aceitar recriá-lo depois). O mesmo domínio entra em `NEXT_PUBLIC_SITE_URL`, `settings.site_url`, nas URLs de redirecionamento do Supabase Auth e no SMTP/Resend (SPF/DKIM).
- **N2 (Média) Valor pago não é validado** (Financeiro L1 = Backend risco 1): concordo com a mitigação do go-live (conferir o primeiro pagamento: `amount = 45`). Para depois: alerta quando `amount ≠ plan_price_cents`.
- **N3 (Média) Assinatura real de R$ 1 continua cobrando** e depois da troca de plano o site a ignora (`other_plan`). Cancelar antes de mudar `mp_plan_id`.
- **N4 (Baixa) Janela de inconsistência de preço:** com o front publicado antes do passo de preço, home/`/assinar` mostram R$ 45 e `/conta`/concluir mostram R$ 1,00. Não divulgar nem abrir cadastro nessa janela (Financeiro item 1).
- **N5 (Baixa) Senha ligada:** os 3 usuários têm senha e a proteção contra senha vazada está desligada. Não verifiquei se o Supabase oferece chave separada para desligar só a senha; sem ela, a proteção é MFA + AAL2 no admin e senha aleatória longa.

### 4. Gates para abrir ao público (status em 26/11)
| Gate | Status | O que falta |
|---|---|---|
| G1 MFA do admin + AAL2 | ⏳ 0 fatores; código local | Cadastrar TOTP, testar login, só então AAL2 no banco (etapa 2 do 0100) |
| G2 Política de Auth | ❌ senha vazada OFF; OTP/redirects não verificáveis daqui | Ver passo a passo abaixo |
| G3 `0100` aplicada | ⏳ SQL pronto | Branch → testes de regressão → produção via `apply_migration` |
| G4 Backup (Pro + PITR) | ❌ | Gabriel |
| G5 CI + branch protection + secret scanning | ⏳ | Gabriel copia o `ci.yml`; ligar proteção da `main` |
| G6 Cabeçalhos/CSP | ⏳ pronto no código, não publicado; CSP só Report-Only | Publicar; depois impor a CSP (com `form-action`) |
| G7 Rate limit + CAPTCHA | ❌ | Backend + Frontend |
| G8 Segredos rotacionados; `create-plan` removida | ❌ | `rotacao-segredos-golive.md` |
| G9 Sync < 1% de falha | ⚠️ 21% hoje | Deploy da nova `mercadopago-sync` + cron 10 min |
| G10 LGPD | ❌ adiado | Textos, DPO, eliminação, incidente |
| G11 SMTP próprio + SPF/DKIM/DMARC | ❌ | Domínio + Resend |
| G12 Login de teste removido | ⏳ código removido localmente, banco/função ainda não | `0097` + apagar `test-login` |

**Veredito:** **NÃO APROVADO para abrir ao público.** Aprovado para trocar para produção e testar **com o próprio Gabriel** (1 pagamento real). Bloqueiam a abertura: G1, G4, G11, G10, G8, G12 e G9.

### 5. Passo a passo manual do Gabriel (curto)
1. **2FA** em Gmail do admin, GitHub, Vercel, Supabase, Mercado Pago e no registrador do domínio. Guardar os códigos de recuperação fora do computador.
2. **Supabase → Authentication:** (a) Site URL e Redirect URLs só com o endereço do site e `/auth/callback` (remover `localhost` e curingas, se existirem); (b) validade do código/link do e-mail em 10 a 15 min; (c) ligar a proteção contra senha vazada (o aviso do advisor explica; costuma exigir plano Pro); (d) revisar os limites de envio. Os nomes dos menus mudam: se não achar, me diga o que aparece.
3. **Supabase Pro + PITR:** contratar, ligar o backup contínuo e fazer **um teste de restauração** antes de cobrar clientes.
4. **Vercel Pro** (o plano Hobby restringe uso comercial; confirmar nos termos) e **GitHub:** proteger a branch `main`, ligar secret scanning.
5. **MFA do admin:** quando o painel local estiver publicado na sua máquina, cadastrar o autenticador (QR Code) e me avisar para ativar o AAL2 no banco.
6. **Mercado Pago:** token de produção, cancelamento do R$ 1, plano de R$ 45 e rotação, na ordem de `propostas/rotacao-segredos-golive.md`.

## Segurança – conciliação
- **Financeiro:** a seção dele foi escrita para R$ 30; vale R$ 45 (já refeito na conciliação dele). Concordo com a correção de ordem (token → cancelar R$ 1 → create-plan → preço), com "não divulgar durante a janela de inconsistência" e com carência/reembolso/alertas (0089–0091) antes de abrir ao público. Acrescento só **N1 (domínio × `back_url`)**: decidir o domínio antes do plano real.
- **Backend:** de acordo com a ordem, com o risco 6 (`test-login`/`create-plan` com `service_role`) e com o pedido de stub 410 se não der para apagar. Pedido concreto: trocar `job_id := 2` por busca pelo nome do job.
- **Frontend:** de acordo em manter a CSP em Report-Only por ora. Pedido: ao impor, incluir `form-action` com `https://www.mercadopago.com.br`, e confirmar que `/painel` e `/mfa` dão 404 no site público depois do deploy.
- Nada do pacote bloqueia a **troca para produção para teste do próprio Gabriel**; os bloqueios são para abrir ao público.

## Frontend – decisões 22h11
Decisões do Gabriel aplicadas nos textos: **mensal** (sem "30 dias"), **reembolso integral só na 1ª assinatura, em até 7 dias da 1ª cobrança**, **carência de 3 dias**, **estorno/chargeback tiram o acesso**. Preço R$ 45 no código. `tsc --noEmit` e `eslint app lib components` passam; vitest não roda no ambiente.

Arquivos: `lib/plan.ts`, `lib/assinatura/state.ts`, `app/page.tsx`, `app/regras/page.tsx`, `app/assinar/{page,signup-form,concluir/page}.tsx`, `app/catalogo/[id]/page.tsx`, `app/conta/{conta-view,cancel-subscription-form,cancelar-assinatura-actions}.tsx|ts`.

**O que depende do Backend (contrato que o front assume):**
1. `my_payment_state()` deve devolver `refund_eligible` (boolean: 1ª assinatura do cliente E hoje <= data da 1ª cobrança + 7 dias) e `refund_until` (date yyyy-mm-dd, último dia do prazo). Sem esses campos o front trata como NÃO elegível (mostra "não reembolsado") e nunca promete reembolso.
2. `mercadopago-cancel` deve responder `result: "ok_refunded"` (cancelou + estornou) e `result: "refund_failed"` (cancelou no MP, estorno falhou: equipe resolve). O front já trata os dois, além de `ok` e `nothing_to_cancel`. Qualquer outro resultado cai em "não conseguimos cancelar".
3. Carência: o front diz que a assinatura só vira "em atraso" DEPOIS de 3 dias de carência (texto de `past_due` e FAQ). Se o banco marcar `past_due` antes, ajustar o texto de `state.ts`.
4. Estorno/chargeback: o front só informa em /regras que encerra o acesso; a regra é do banco.
5. No reembolso o acesso termina na hora (texto do form); o Backend precisa encerrar a assinatura (status canceled) e cancelar reservas/fila no mesmo ato.

## Backend – decisões 22h11

*Decisões do Gabriel (25/11, 22h11): carência de 3 dias; estorno e chargeback tiram o acesso; reembolso integral em até 7 dias da 1ª cobrança, só na 1ª assinatura; texto "mensal". Nada foi aplicado em produção nem deployado; tudo testado em rollback (RAISE EXCEPTION).*

**Arquivos novos/alterados (locais):**
- `supabase/migrations/0098_carencia_estorno.sql` — carência (`settings.payment_grace_days = 3`), `mc_period_ok`, `mc_release_access`, `mp_apply_reversals`, coluna `mp_payments.reversed_at`; patches idempotentes em `reserve_book`, `mc_promote_queue`, `mc_expire_subscriptions`, `my_payment_state`, `mp_reconcile`, `apply_mp_authorized_payment`.
- `supabase/migrations/0099_reembolso_primeira_assinatura.sql` — `mc_refund_eligibility(uuid)`, `mp_record_refund(...)` (ambas só `service_role`), colunas `mp_payments.refund_requested_at/refund_error`, `my_payment_state` com `grace_days`, `refund_eligible`, `refund_deadline`.
- `supabase/functions/mercadopago-cancel/index.ts` — reembolso via `POST /v1/payments/{id}/refunds` (sem body = total; header `X-Idempotency-Key` obrigatório, conforme a doc oficial do MP).
- `propostas/testes/0098_teste_rollback.sql` — roteiro do teste da 0098.

**Regras implementadas**
1. **Carência de 3 dias** (fuso America/Sao_Paulo): depois de `current_period_end` o cliente continua `active` e pode reservar/agendar por mais 3 dias. Cobrança recusada dentro da carência **não** muda o status (só registra `payment_failed`); passou a carência, o cron diário (`mc_expire_subscriptions`, 03h BRT) marca `past_due`. Pagamento aprovado dentro da carência soma 30 dias sobre o fim anterior (não sobre hoje). **Cancelamento pedido não tem carência.** Desligar: `update settings set value='0' where key='payment_grace_days'`.
2. **Estorno/chargeback** (`payment.status` = `refunded` ou `charged_back` num pagamento já aplicado): `payments.status='refunded'`; acesso revogado na hora (`past_due`, ou `canceled` se já havia cancelamento; `current_period_end` = ontem); reservas na fila/ofertadas canceladas e cópias seguradas liberadas; alerta `payment_reversed` em `email_log`. Se houver um pagamento aprovado mais novo e não estornado, retira só 30 dias daquele ciclo. Idempotente (`mp_payments.reversed_at`).
3. **Reembolso de 7 dias** — elegível só se: assinatura não cancelada e ligada ao MP; nenhuma outra assinatura do cliente teve pagamento; cliente nunca teve estorno; exatamente 1 pagamento aprovado e aplicado; hoje ≤ data da 1ª cobrança + 7 dias (data = `raw.date_created` da cobrança). Renovação ou reassinatura tira a elegibilidade.
4. **`mercadopago-cancel`**: elegibilidade é calculada **antes** de cancelar; cancela no MP (como hoje); se elegível, reembolsa o total, chama `mp_record_refund` (acesso termina na hora, reservas liberadas) e responde `ok_refunded`. **Se o reembolso falhar, o cancelamento vale**, o erro é gravado, abre-se o alerta `refund_failed` e a resposta é `refund_failed`.

**Contrato para o Frontend**
- `my_payment_state()` ganhou: `grace_days` (int), `refund_eligible` (bool), `refund_deadline` (data `YYYY-MM-DD` ou null). Use `refund_eligible` para mostrar no botão/tela de cancelar: "Cancelando até <deadline> devolvemos o valor".
- `lib/assinatura/state.ts`: `active` com `current_period_end` vencido há **≤ `grace_days`** continua ATIVO ("pagamento em atraso, regularize"); acima disso o banco já terá virado `past_due`.
- Resposta de `mercadopago-cancel` (campo `result`): `ok` (cancelou, acesso até o fim do período: `current_period_end`) · **`ok_refunded`** (cancelou, devolvemos o valor, acesso encerrado na hora; `status:"canceled"`, `refunded_amount_cents`) · **`refund_failed`** (cancelou, `canceled:true`, acesso até `current_period_end`, mas o reembolso não saiu: texto "Seu cancelamento foi feito; vamos devolver o valor manualmente em até X dias úteis") · demais como antes. `ok_refunded` e `refund_failed` são sucessos de cancelamento, não erros.
- Textos: reembolso (4 locais já listados pelo Frontend), "mensal" em vez de "a cada 30 dias", e a regra da carência em `/regras` e `/conta`. O Frontend NÃO deve prometer "imediato" no reembolso: o estorno aparece na fatura em dias (prazo do cartão).
- Estados novos vistos pelo site: depois de estorno/chargeback o cliente aparece `past_due` ou `canceled` (já tratados pelas telas atuais).

**Ordem para aplicar (depois do go-live básico: 0097, deploy sync/claim/cancel antigos já feitos)**
1. Aplicar `0098` (branch ou direto; já testada em rollback) → conferir `select value from settings where key='payment_grace_days'`.
2. Aplicar `0099`.
3. Deploy do novo `mercadopago-cancel` (só depois da 0099; antes dela o RPC não existe e a função apenas não reembolsa, sem quebrar).
4. Frontend publica textos + `state.ts` (pode ser antes ou depois; os campos novos de `my_payment_state` só aparecem após a 0099).
5. Teste real: ver o passo 4 do "Riscos" abaixo.

**Testes em rollback (todos OK)**
- 0098: `mc_period_ok` (dentro, fora, cancelado sem carência); cron mantém `active` dentro da carência e passa a `past_due` fora; recusa dentro da carência → continua `active`, fora → `past_due`; aprovado dentro da carência → fim = fim anterior + 30; aprovado fora → hoje + 30; estorno → `past_due`, fim ontem, `payments=refunded`, reservas abertas 0, 1 alerta (segunda chamada não duplica); chargeback com assinatura cancelada no MP → `canceled`; estorno de ciclo antigo com ciclo mais novo pago → só −30 dias.
- 0099: elegível (1ª cobrança há 2 dias) · não elegível por renovação · fora de 7 dias (9 dias) · reassinatura (já pagou antes) · sem pagamento; `my_payment_state` devolve `refund_eligible=true` e `refund_deadline`; falha de reembolso mantém o acesso e abre 1 alerta; sucesso → `canceled`, `payments`/`mp_payments`=`refunded`, reservas 0, 1 alerta (idempotente); pagamento de outro cliente → `not_found`; reassinar depois do reembolso → `not_first_subscription`.
- A função `mercadopago-cancel` passou só na checagem de sintaxe (`node --experimental-strip-types --check`); **não foi executada contra o Mercado Pago**.

**Riscos e pontos de atenção**
1. **Atenção para o próprio Gabriel:** a assinatura de produção de R$ 1 (`64c56c15…`, 1º pagamento `190057198175`, ~22–23/11) está dentro da janela de 7 dias até ~29–30/11 e é a 1ª assinatura dele. Com a nova função no ar, **cancelar pelo site vai reembolsar o R$ 1 e encerrar o acesso de assinante na hora** (o acesso de admin ao painel não depende disso). Se ele não quer isso, cancelar pelo painel do MP, ou cancelar antes do deploy do novo `cancel`. É também um bom teste real do reembolso (custo R$ 0 líquido).
2. **O MP pode não refletir `refunded`/`charged_back` em `/authorized_payments/search`.** Não consegui confirmar com a documentação se o `payment.status` aninhado muda depois de um estorno. Reembolso feito pela nossa função não depende disso (grava direto). Estorno feito no painel do MP ou chargeback só chegam ao banco se o sync/webhook trouxer o status; se não trouxer, o acesso não cai sozinho. Mitigação rápida: conferir o painel do MP semanalmente; melhoria futura: o sync consultar `GET /v1/payments/{id}` dos pagamentos aprovados dos últimos 30 dias.
3. **Reembolso parcial** no MP mantém `approved`: ignorado (a equipe decide).
4. **Teste real do reembolso:** com o plano de R$ 1 em produção, 1 pagamento real, depois cancelar pelo site dentro de 7 dias e conferir: `result=ok_refunded`, `mp_payments.status=refunded`, `payments.status=refunded`, assinatura `canceled`, 1 linha `refund_done` em `email_log`, e o estorno no extrato do MP.
5. A janela de 7 dias usa a data de criação da cobrança no MP (`raw.date_created`), ajustada ao fuso de São Paulo; no limite do 7º dia o cliente ainda tem direito (`hoje ≤ data + 7`).
6. **Empréstimos já entregues** (livro na casa do cliente) não são tocados no estorno nem no reembolso; só reservas na fila/ofertadas. Decisão de produto: o que fazer com o livro em posse de quem foi reembolsado.
7. **Alertas só em `email_log`** (kinds `payment_failed`, `payment_after_cancel`, `payment_reversed`, `refund_done`, `refund_failed`): a 0089 (alertas internos + e-mail) continua não aplicada, então o Gabriel precisa olhar essa fila ou o painel; `refund_failed` exige ação manual (estornar no painel do MP).
8. A 0098 muda o comportamento para clientes reais assim que aplicada (carência vale já). Hoje só há o Gabriel (ativo até 22/12) e o cliente de teste.

*Fontes do reembolso:* [Mercado Pago: criar reembolso](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api-payments/create-refund/post) — `POST /v1/payments/{id}/refunds`, `X-Idempotency-Key` obrigatório, sem `amount` = reembolso total.
