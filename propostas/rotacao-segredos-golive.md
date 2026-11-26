# Go-live — troca para produção e rotação de segredos (preço R$ 45/mês)

*Dev de Segurança, 26/11/2026. Nada aqui foi executado. Regra de ouro: **nenhum token, chave ou segredo é colado no chat**. O Gabriel cola só dentro do painel do Supabase/Mercado Pago; o resto roda por SQL que gera o segredo no próprio banco.*

## Inventário dos segredos (o que existe e onde mora)

| Segredo | Onde mora | Quem usa | Troca |
|---|---|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | Supabase → Edge Functions → Secrets | sync, claim, cancel, webhook, create-plan | Gabriel, no painel |
| `MERCADOPAGO_WEBHOOK_SECRET` | Edge Secrets | só `mercadopago-webhook` (caminho bônus) | Gabriel (gera no MP, cola no Supabase) |
| `mc_sync_secret` | Vault do Postgres | cron `mc-mp-sync` (lê do Vault na hora) e `mc_sync_secret_ok` (sync, create-plan) | SQL, gerado no banco (ninguém vê o valor) |
| `SUPABASE_SERVICE_ROLE_KEY` | injetada pelo Supabase nas Edge Functions | funções | não troca agora; **nunca** vai à Vercel |
| Chave anon + URL | `.env.local` e Vercel (`NEXT_PUBLIC_*`) | site | pública por desenho; não rotaciona |
| Client Secret / Public Key do MP | painel do MP | **ninguém usa** | nada a fazer; se um dia for colado em algum lugar, renovar |

Verificado hoje: nenhuma credencial no código atual nem no histórico do Git (só o texto-modelo `APP_USR-...` do `.env.example`); `.env.local` e `supabase/.env.secrets` estão no `.gitignore`.

## Ordem exata

**Pré-requisito A — decidir o domínio ANTES de criar o plano real.** `create-plan` grava `back_url` fixo em `https://muitasconversas.vercel.app/assinar/concluir` dentro do plano do Mercado Pago. Se depois o site mudar para domínio próprio (necessário para o SMTP/Resend), o plano antigo continua mandando o cliente para o endereço velho e será preciso criar outro plano e migrar quem já assinou. Se o domínio ainda não existe, lançar com o endereço da Vercel e aceitar recriar o plano depois (poucos assinantes no início), ou ajustar a `back_url` da função antes de rodar.

**Pré-requisito B — sync saudável.** Fazer o deploy da nova `mercadopago-sync` (retry em 429) e conferir `mp_sync_log` com falhas < 1% nas últimas execuções.

1. **Gabriel (painel do MP):** em Suas integrações → Credenciais de **produção**, copiar o Access Token de produção. Se esse token já foi colado em algum chat, e-mail ou arquivo, clicar em renovar e copiar o novo.
2. **Gabriel (painel do Supabase):** Edge Functions → Secrets → editar `MERCADOPAGO_ACCESS_TOKEN`, colar sem aspas e sem "Bearer", salvar. Dizer só "salvei".
3. **Coordenador (SQL, leitura):** disparar o sync uma vez e conferir em `mp_sync_log.detail` que `mp_user` **não** é o usuário de teste (id 3873514631) e que `ok = true`. Se vier `invalid_access_token`, o token está errado ou é de outra aplicação.
4. **Cancelar a assinatura real de R$ 1** (`64c56c157682477cb0b49092980d38bf`), com o token de produção já salvo e **antes** de mudar `mp_plan_id`: botão "Cancelar" em `/conta` na conta de admin (ou painel do MP). Conferir `cancel_requested_at` e o status `cancelled` no MP.
5. **Coordenador:** `mercadopago-create-plan` com `{"amount":45,"allow_production":true}` (versão do repo, que grava também `plan_price_cents`). Conferir `mp_checkout_url()` e `signup_config()`.
6. **Gabriel (painel do MP):** abrir o plano e conferir valor R$ 45,00, cobrança mensal, só cartão.
7. **Primeiro pagamento real** (cartão do Gabriel, e-mail do MP = e-mail do login do site). Conferir `mp_payments.amount = 45`, assinatura `active`, `current_period_end`.
8. **Limpeza imediata (mesmo dia):** apagar `mercadopago-create-plan` e `test-login`; limpar cliente/pagamento de teste (`gabrielgarciaroman+teste@gmail.com`, pagamento `190057198175` de R$ 1).
9. **Rotação (só depois do passo 7 aprovado):**
   - `mc_sync_secret`, por SQL, sem ver o valor:
     `select vault.update_secret(id, encode(extensions.gen_random_bytes(32), 'hex')) from vault.secrets where name = 'mc_sync_secret';`
     O cron e `mc_sync_secret_ok` leem do Vault a cada chamada, então não há mais nada para atualizar. Conferir na execução seguinte do sync (≤ 10 min) que `ok = true`. Efeito de segurança: qualquer cópia antiga do segredo, inclusive a que chamou `create-plan`, deixa de valer.
   - `MERCADOPAGO_WEBHOOK_SECRET`: se o webhook estiver configurado no painel do MP, gerar nova assinatura secreta lá e colar no Supabase. Se não estiver em uso (assinaturas não passam pelo painel "Suas integrações"), apagar o segredo antigo do Supabase e anotar que o webhook fica desligado.
   - `MERCADOPAGO_ACCESS_TOKEN`: renovar a credencial de produção no painel do MP e colar a nova no Supabase **em seguida** (entre uma e outra o sync falha por alguns minutos; fazer fora do horário de pico). Isso invalida qualquer token que tenha passado por chat. Conferir o sync depois.
10. **Confirmação final (SQL/MCP):** `list_edge_functions` deve listar só `mercadopago-sync`, `-claim`, `-cancel`, `-webhook`; `test_login_enabled` não existe em `pg_proc`; não há `test_login_until` em `settings`; `get_advisors` sem `anon_security_definer_function_executable` para `test_login_enabled`.

## Como "apagar" as funções

O MCP não tem apagar função. Opções, em ordem de preferência:
1. Painel do Supabase → Edge Functions → função → Delete (Gabriel, 1 minuto).
2. Se não der na hora: redeploy da função com `verify_jwt=true` e corpo `Deno.serve(() => new Response("gone", { status: 410 }))`, que deixa de usar `service_role` e fica inacessível sem JWT.
Depois, remover as pastas `supabase/functions/test-login` e `supabase/functions/mercadopago-create-plan` do repositório, para que um deploy futuro por CLI não as recrie.

## O que NÃO fazer
- Não rotacionar o Access Token antes do primeiro pagamento real aprovado (passo 7): se algo falhar, a causa fica ambígua.
- Não colocar `SUPABASE_SERVICE_ROLE_KEY` na Vercel nem em `NEXT_PUBLIC_*`.
- Não reutilizar o token de teste em produção, nem o de produção em teste.
