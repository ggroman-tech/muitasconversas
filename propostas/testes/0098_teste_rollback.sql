-- Teste em rollback da 0098 (rodar DEPOIS do conteúdo da 0098, na mesma requisição; termina em RAISE EXCEPTION para desfazer tudo).
do $t$
declare
  v_t date := (now() at time zone 'America/Sao_Paulo')::date;
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); u4 uuid := gen_random_uuid(); u5 uuid := gen_random_uuid();
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid; res jsonb := '{}'::jsonb; r record; v_book uuid; v_cnt int;
  procedure_ok boolean;
begin
  -- usuários/clientes/assinaturas de teste
  insert into auth.users(id, email, aud, role) select x, 'zz'||left(x::text,6)||'@t.test', 'authenticated', 'authenticated' from unnest(array[u1,u2,u3,u4,u5]) x;
  insert into customers(id, full_name, email) select x, 'Teste '||left(x::text,4), 'zz'||left(x::text,6)||'@t.test' from unnest(array[u1,u2,u3,u4,u5]) x;
  insert into subscriptions(customer_id, status, current_period_end, mp_preapproval_id, started_at) values (u1,'active', v_t-2, 'PRE1', now()) returning id into s1;
  insert into subscriptions(customer_id, status, current_period_end, mp_preapproval_id, started_at) values (u2,'active', v_t-4, 'PRE2', now()) returning id into s2;
  insert into subscriptions(customer_id, status, mp_preapproval_id) values (u3,'pending','PRE3') returning id into s3;
  insert into subscriptions(customer_id, status, mp_preapproval_id) values (u4,'pending','PRE4') returning id into s4;
  insert into subscriptions(customer_id, status, mp_preapproval_id) values (u5,'pending','PRE5') returning id into s5;
  insert into mp_preapprovals(id, status, payer_email, plan_id, subscription_id, raw) values
    ('PRE1','authorized','a@t.test','P',s1,'{}'),('PRE2','authorized','b@t.test','P',s2,'{}'),('PRE3','authorized','c@t.test','P',s3,'{}'),
    ('PRE4','cancelled','d@t.test','P',s4,'{}'),('PRE5','authorized','e@t.test','P',s5,'{}');

  -- A1 mc_period_ok
  res := res || jsonb_build_object('A1_ok_em_carencia', mc_period_ok(v_t-2, null), 'A1_fora_carencia', mc_period_ok(v_t-4, null), 'A1_cancelado_sem_carencia', mc_period_ok(v_t-1, now()));

  -- A3 recusa dentro da carência (u1) e fora (u2)
  perform apply_mp_authorized_payment(jsonb_build_object('id','a1','preapproval_id','PRE1','transaction_amount',45,'status','processed','last_modified',(now())::text,'payment',jsonb_build_object('id','PAYA1','status','rejected')));
  perform apply_mp_authorized_payment(jsonb_build_object('id','a2','preapproval_id','PRE2','transaction_amount',45,'status','processed','last_modified',(now())::text,'payment',jsonb_build_object('id','PAYA2','status','rejected')));
  res := res || jsonb_build_object('A3_recusa_em_carencia_status', (select status from subscriptions where id=s1), 'A3_recusa_fora_carencia_status', (select status from subscriptions where id=s2));

  -- A2 cron: u1 (dentro) fica active; u2 já past_due; cria u? já coberto. Rodar e conferir u1
  perform mc_expire_subscriptions();
  res := res || jsonb_build_object('A2_cron_u1_status', (select status from subscriptions where id=s1));
  update subscriptions set current_period_end = v_t-4 where id=s1;
  perform mc_expire_subscriptions();
  res := res || jsonb_build_object('A2_cron_u1_fora_carencia', (select status from subscriptions where id=s1));
  update subscriptions set status='active', current_period_end=v_t-2 where id=s1;

  -- A4 aprovado dentro da carência: soma sobre o fim anterior (v_t-2+30)
  perform apply_mp_authorized_payment(jsonb_build_object('id','a3','preapproval_id','PRE1','transaction_amount',45,'status','processed','last_modified',(now())::text,'payment',jsonb_build_object('id','PAYA3','status','approved')));
  res := res || jsonb_build_object('A4_fim_esperado', (v_t-2)+30, 'A4_fim', (select current_period_end from subscriptions where id=s1), 'A4_status', (select status from subscriptions where id=s1));
  -- A5 aprovado fora da carência (u2 past_due): soma sobre hoje
  perform apply_mp_authorized_payment(jsonb_build_object('id','a4','preapproval_id','PRE2','transaction_amount',45,'status','processed','last_modified',(now())::text,'payment',jsonb_build_object('id','PAYA4','status','approved')));
  res := res || jsonb_build_object('A5_fim_esperado', v_t+30, 'A5_fim', (select current_period_end from subscriptions where id=s2), 'A5_status', (select status from subscriptions where id=s2));

  -- B1 estorno: u3 paga, reserva na fila, estorna
  perform apply_mp_authorized_payment(jsonb_build_object('id','b1','preapproval_id','PRE3','transaction_amount',45,'status','processed','last_modified',(now())::text,'payment',jsonb_build_object('id','PAYB1','status','approved')));
  res := res || jsonb_build_object('B1_antes_status', (select status from subscriptions where id=s3), 'B1_antes_fim', (select current_period_end from subscriptions where id=s3));
  select id into v_book from books limit 1;
  begin
    insert into reservations(customer_id, book_id, status) values (u3, v_book, 'queued');
    res := res || jsonb_build_object('B1_reserva_criada', true);
  exception when others then res := res || jsonb_build_object('B1_reserva_criada', 'falhou: '||sqlerrm);
  end;
  perform apply_mp_authorized_payment(jsonb_build_object('id','b1','preapproval_id','PRE3','transaction_amount',45,'status','processed','last_modified',(now())::text,'payment',jsonb_build_object('id','PAYB1','status','refunded')));
  res := res || jsonb_build_object('B1_estorno_status', (select status from subscriptions where id=s3), 'B1_estorno_fim', (select current_period_end from subscriptions where id=s3),
     'B1_payments_status', (select status from payments where mp_payment_id='PAYB1'), 'B1_reservas_abertas', (select count(*) from reservations where customer_id=u3 and status in ('queued','offered')),
     'B1_alertas', (select count(*) from email_log where dedupe_key='rev:PAYB1'));
  -- 2ª chamada não duplica
  perform apply_mp_authorized_payment(jsonb_build_object('id','b1','preapproval_id','PRE3','transaction_amount',45,'status','processed','last_modified',(now())::text,'payment',jsonb_build_object('id','PAYB1','status','refunded')));
  res := res || jsonb_build_object('B1_alertas_apos_2a', (select count(*) from email_log where dedupe_key='rev:PAYB1'), 'B1_fim_apos_2a', (select current_period_end from subscriptions where id=s3));

  -- B2 chargeback com assinatura cancelada no MP: vira canceled
  update subscriptions set status='active', current_period_end=v_t+30, started_at=now() where id=s4;
  update mp_payments set id=id where false;
  insert into mp_payments(id, preapproval_id, status, amount_cents, paid_at, applied, raw) values ('PAYC1','PRE4','approved',4500, now(),true,'{}');
  perform apply_mp_authorized_payment(jsonb_build_object('id','c1','preapproval_id','PRE4','transaction_amount',45,'status','processed','last_modified',(now())::text,'payment',jsonb_build_object('id','PAYC1','status','charged_back')));
  res := res || jsonb_build_object('B2_chargeback_status', (select status from subscriptions where id=s4), 'B2_mp_status', (select status from mp_payments where id='PAYC1'));

  -- B3 estorno do ciclo antigo com ciclo mais novo pago: só retira 30 dias
  perform apply_mp_authorized_payment(jsonb_build_object('id','d1','preapproval_id','PRE5','transaction_amount',45,'status','processed','last_modified',(now()-interval '40 days')::text,'payment',jsonb_build_object('id','PAYD1','status','approved')));
  perform apply_mp_authorized_payment(jsonb_build_object('id','d2','preapproval_id','PRE5','transaction_amount',45,'status','processed','last_modified',(now()-interval '1 day')::text,'payment',jsonb_build_object('id','PAYD2','status','approved')));
  res := res || jsonb_build_object('B3_fim_antes', (select current_period_end from subscriptions where id=s5));
  perform apply_mp_authorized_payment(jsonb_build_object('id','d1','preapproval_id','PRE5','transaction_amount',45,'status','processed','last_modified',(now()-interval '40 days')::text,'payment',jsonb_build_object('id','PAYD1','status','refunded')));
  res := res || jsonb_build_object('B3_fim_depois', (select current_period_end from subscriptions where id=s5), 'B3_status', (select status from subscriptions where id=s5));

  -- idempotência da migração: rodar de novo os patches não pode falhar (conferido ao reaplicar o arquivo na prática)
  raise exception 'RESULT %', res::text;
end $t$;
