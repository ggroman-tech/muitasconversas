-- 0097 — go-live: remove o login de teste sem e-mail (achado A14 / gate G12 da Segurança).
-- Seguro de aplicar a qualquer momento depois que o botão/rota de teste saírem do site (senão /entrar chama uma RPC que não existe;
-- o código do site trata a falha como "modo desligado", mas é melhor remover o código primeiro).
--
-- O QUE É AJUSTADO NO GO-LIVE (fora desta migração, nesta ordem — ver propostas/golive-coordenacao.md):
--   1) Gabriel salva o Access Token de PRODUÇÃO em Supabase > Edge Functions > Secrets (MERCADOPAGO_ACCESS_TOKEN).
--   2) create-plan com { amount: 45, allow_production: true } cria o plano real e grava settings.mp_plan_id.
--   3) propostas/golive-passo-preco.sql (guardado) ajusta settings.plan_price_cents = 4500 SÓ depois do passo 2.
--      O preço é lido por: public.signup_config() e a view public.my_account (campo plan_price_cents) -> telas /assinar, /assinar/concluir e /conta.
--      public.apply_pagarme_event também cita o setting (legado Pagar.me, sem uso). Nenhum outro setting depende do preço.
--      O texto fixo do site vem de lib/plan.ts (dono: Frontend).
--   4) Apagar a Edge Function test-login (o MCP não tem "delete function": apague no painel ou substitua por um stub 410) e a função mercadopago-create-plan (A8).

drop function if exists public.test_login_enabled();
delete from public.settings where key = 'test_login_until';
