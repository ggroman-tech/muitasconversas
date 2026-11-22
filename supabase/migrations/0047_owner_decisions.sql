-- Decisões do dono (21/11/2026):
-- * Sem multa por atraso (apenas o bloqueio de novas reservas/entregas).
-- * Sem renovação automática.
-- * Sábado único: todos os assinantes usam o mesmo sábado de troca (sem turmas por semana).
--   A capacidade continua por bairro/janela em delivery_windows.capacity.
-- * Pagar.me: a cobrança segue como stub (lib/auth/billing.ts) até decisão do dono.
insert into settings(key, value) values
  ('late_fee_cents',   '0'),
  ('renewal_allowed',  'false'),
  ('auto_renewal',     'false'),
  ('saturday_mode',    '"single"')
on conflict (key) do update set value = excluded.value, updated_at = now();
