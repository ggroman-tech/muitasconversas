# Contrato entre frentes — Muitas Conversas

Stack: Next.js (App Router, TypeScript) + Supabase (Postgres/Auth). Deploy no Vercel. Pagamento: Pagar.me Pix.

## Regras para todo desenvolvedor
1. Trabalhe SOMENTE nos diretórios da sua frente (abaixo). Não edite `supabase/migrations/0001_schema_v1.sql`; se precisar mudar o schema, crie uma migração nova com o prefixo da sua frente (ex.: `0020_B_catalog_views.sql`) e descreva a mudança no seu relatório final.
2. Dinheiro em centavos; datas `timestamptz`; sábado de troca é `date` (America/Sao_Paulo).
3. Mudanças de estado críticas (reservar, agendar, entregar, devolver) só por função SQL transacional (RPC). O front nunca escreve direto nessas tabelas.
4. Regras de negócio pendentes vêm de `settings`, nunca fixas no código.
5. Libib é só fonte do catálogo: nunca escrever de volta, nunca apagar exemplar (`withdrawn`).
6. Textos para o usuário em português do Brasil. Sem CPF/nascimento.
7. Não invente decisões pendentes (multa, renovação, bairros, turmas). Deixe em `settings` e registre no relatório.
8. Entregue com testes ou um script de verificação executável e diga o que rodou e o resultado.

## Frentes e diretórios
- A) Auth, cadastro, conta: `app/(auth)`, `app/conta`, `app/assinar`, `lib/auth`, migrações `002x_A_*`
- B) Catálogo e importação Libib: `app/catalogo`, `scripts/import-libib`, `lib/catalog`, migrações `003x_B_*`
- C) RPCs de reserva/empréstimo/visita + RLS: `supabase/migrations/004x_C_*`, `supabase/tests`
- D) Webhook Pagar.me + lembretes: `supabase/functions/pagarme-webhook`, `supabase/migrations/005x_D_*` (inclui view `reminders_due`)

Documentos de origem estão no Project "Espaço Cultural": `site-assinante-escopo.md` e `site-assinante-banco-de-dados.md`.

## Regra extra
Não edite package.json nem lockfile; dependências compartilhadas já instaladas (@supabase/supabase-js, @supabase/ssr, vitest, tsx). Se precisar de outra, peça no relatório. Não faça git commit; o gestor commita.

## Rodada 3 — frentes
- A) Agendamento do assinante: `app/agendar`, `lib/schedule`, link em /conta e no aviso de atraso. Usa `delivery_days`/`delivery_windows` e a RPC `schedule_visit` (sábado único 09–14h, fecha 08h do sábado, sem limite de vagas por enquanto).
- E) Painel interno: `app/painel`, `lib/painel`. Só staff (`staff_members`: admin/ops/driver). Rota de sábado (`saturday_route`), confirmar entrega (`confirm_delivery`), registrar devolução (`register_return`), marcar falha (`mark_visit_failed`), cancelar visita (`cancel_visit`), atrasos (`overdue_loans`) e gerar sábados (`generate_delivery_days`). Migrações novas `006x_E_*` se precisar.
