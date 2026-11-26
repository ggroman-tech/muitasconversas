-- Correções da revisão final (analistas financeiro e segurança). Já aplicada no banco.
-- 1) permissões: ninguém logado/anônimo escreve nas views do painel nem nas tabelas mp_*
revoke insert, update, delete on public.painel_mp_unlinked, public.painel_subscriptions from authenticated, anon;
revoke insert, update, delete on public.mp_payments, public.mp_preapprovals from authenticated, anon;

do $m$
declare d text; n text;
begin
  -- 2) mp_reconcile: reassinatura (cliente com só assinatura cancelada ganha uma pendente) + alerta de pagamento após cancelamento
  d := pg_get_functiondef('public.mp_reconcile(text)'::regprocedure);
  n := replace(d, 'v_today date :=', 'v_cust uuid; v_today date :=');
  n := replace(n, $o$    if v_sub.id is not null then
      update subscriptions set mp_preapproval_id = p_pre where id = v_sub.id;$o$,
$o$    if v_sub.id is null and v_pre.payer_email is not null then
      -- cliente que cancelou e assinou de novo: abre uma assinatura pendente para receber o vínculo
      select c.id into v_cust from customers c where c.email = lower(btrim(v_pre.payer_email))::citext;
      if v_cust is not null and not exists (select 1 from subscriptions where customer_id = v_cust and status <> 'canceled') then
        insert into subscriptions(customer_id, status) values (v_cust, 'pending') returning * into v_sub;
      end if;
    end if;
    if v_sub.id is not null then
      update subscriptions set mp_preapproval_id = p_pre where id = v_sub.id;$o$);
  n := replace(n, $o$      if v_sub.status <> 'canceled' then
        v_base :=$o$,
$o$      if v_sub.cancel_requested_at is not null or v_sub.status = 'canceled' then
        insert into email_log(customer_id, kind, dedupe_key, subject)
        values (v_sub.customer_id, 'payment_after_cancel', 'pac:' || v_pay.id, 'Pagamento aprovado após cancelamento (conferir/estornar)')
        on conflict (dedupe_key) do nothing;
      end if;
      if v_sub.status <> 'canceled' then
        v_base :=$o$);
  if n = d or position('v_cust uuid' in n) = 0 or position('payment_after_cancel' in n) = 0 then raise exception 'patch mp_reconcile nao aplicado'; end if;
  execute n;

  -- 3) claim_mp_preapproval: exige e-mail do pagador = e-mail do login; reabre assinatura se só houver cancelada
  d := pg_get_functiondef('public.claim_mp_preapproval(text)'::regprocedure);
  n := replace(d, 'v_plan text;', 'v_plan text; v_email text;');
  n := replace(n, $o$  if not found then return jsonb_build_object('result','no_subscription'); end if;$o$,
$o$  if not found then
    if not exists (select 1 from customers where id = v_uid) then return jsonb_build_object('result','no_subscription'); end if;
    insert into subscriptions(customer_id, status) values (v_uid, 'pending') returning * into v_sub;
  end if;$o$);
  n := replace(n, $o$  select s.value #>> '{}' into v_plan$o$,
$o$  select lower(c.email::text) into v_email from customers c where c.id = v_uid;
  if v_pre.payer_email is null then return jsonb_build_object('result','waiting_confirmation'); end if;
  if lower(v_pre.payer_email) is distinct from v_email then return jsonb_build_object('result','email_mismatch'); end if;
  select s.value #>> '{}' into v_plan$o$);
  if n = d or position('email_mismatch' in n) = 0 or position('insert into subscriptions' in n) = 0 then raise exception 'patch claim nao aplicado'; end if;
  execute n;

  -- 4) quem pediu cancelamento não reserva nem recebe oferta da fila
  d := pg_get_functiondef('public.reserve_book(uuid)'::regprocedure);
  n := replace(d, $o$status = 'active' and (current_period_end is null$o$, $o$status = 'active' and cancel_requested_at is null and (current_period_end is null$o$);
  if n = d then raise exception 'patch reserve_book nao aplicado'; end if;
  execute n;

  d := pg_get_functiondef('public.mc_promote_queue(uuid)'::regprocedure);
  n := replace(d, $o$s.status = 'active')$o$, $o$s.status = 'active' and s.cancel_requested_at is null and (s.current_period_end is null or s.current_period_end >= (now() at time zone 'America/Sao_Paulo')::date))$o$);
  if n = d then raise exception 'patch mc_promote_queue nao aplicado'; end if;
  execute n;
end $m$;

-- 5) reassinar depois de cancelar
create or replace function public.resubscribe() returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not exists (select 1 from customers where id = v_uid) then return jsonb_build_object('result','no_customer'); end if;
  if exists (select 1 from subscriptions where customer_id = v_uid and status <> 'canceled') then return jsonb_build_object('result','already_open'); end if;
  insert into subscriptions(customer_id, status) values (v_uid, 'pending');
  return jsonb_build_object('result','ok');
end $f$;
revoke all on function public.resubscribe() from public, anon;
grant execute on function public.resubscribe() to authenticated;

-- 6) ao fim do período de quem cancelou: encerra a assinatura e libera reservas/cópias
create or replace function public.mc_expire_subscriptions() returns integer language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare n1 int; n2 int; v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_custs uuid[]; v_copies uuid[]; v_books uuid[]; v_b uuid;
begin
  with u as (
    update subscriptions set status = 'canceled', canceled_at = now()
     where status = 'active' and cancel_requested_at is not null and current_period_end < v_today
    returning customer_id)
  select coalesce(array_agg(customer_id), '{}') into v_custs from u;
  n1 := coalesce(array_length(v_custs, 1), 0);
  if n1 > 0 then
    with c as (
      update reservations set status = 'canceled', closed_at = now()
       where customer_id = any(v_custs) and status in ('queued','offered')
      returning book_id, offered_copy_id)
    select coalesce(array_agg(offered_copy_id) filter (where offered_copy_id is not null), '{}'),
           coalesce(array_agg(distinct book_id), '{}')
      into v_copies, v_books from c;
    update copies set status = 'available' where id = any(v_copies) and status = 'held';
    foreach v_b in array v_books loop perform mc_promote_queue(v_b); end loop;
  end if;
  update subscriptions set status = 'past_due'
   where status = 'active' and cancel_requested_at is null and current_period_end < v_today;
  get diagnostics n2 = row_count;
  return n1 + n2;
end $f$;

-- ATENÇÃO: os filtros "cancel_requested_at is null" de reserve_book e mc_promote_queue (item 4 acima) foram REVERTIDOS pela 0088: quem pediu cancelamento usa tudo até o fim do período pago.
