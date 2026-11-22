-- Sábado único, das 09h às 14h (decisão do dono, 21/11/2026).
-- Fechamento dos pedidos e cancelamentos: 08h do sábado (1 hora antes da janela das 09h, para o
-- dono preparar as entregas antes de o motoboy sair).
-- Vagas por janela/bairro: decisão adiada; window_capacity = 9999 significa "sem limite por enquanto".
-- Quando o dono definir o limite, basta atualizar settings.window_capacity e regenerar as janelas futuras.
insert into settings(key, value) values
  ('saturday_start',          '"09:00"'),
  ('saturday_end',            '"14:00"'),
  ('saturday_window_minutes', '300'),     -- 300 = uma janela 09–14h por bairro; use 60/120 para janelas menores
  ('saturday_cutoff_hours_before', '1'),  -- fecha às 08h do sábado
  ('window_capacity',          '9999')     -- sem limite por enquanto (decisão adiada)
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function generate_delivery_days(p_weeks int default 8) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_start time; v_end time; v_len int; v_cap int; v_cut int;
  v_first date; v_day date; v_dd int; v_area record; v_t time; v_t2 time;
  v_days int := 0; v_wins int := 0; v_n int;
begin
  perform mc_require_ops_or_service();
  if p_weeks is null or p_weeks < 1 or p_weeks > 26 then
    perform mc_fail('invalid_weeks','Informe entre 1 e 26 semanas.');
  end if;
  v_cap := mc_setting_int('window_capacity');
  v_cut := mc_setting_int('saturday_cutoff_hours_before');
  if v_cap is null or v_cap < 1 then perform mc_fail('config_pending','Configuração window_capacity pendente.'); end if;
  if v_cut is null or v_cut < 0 then perform mc_fail('config_pending','Configuração saturday_cutoff_hours_before pendente.'); end if;
  v_start := (mc_setting('saturday_start') #>> '{}')::time;
  v_end   := (mc_setting('saturday_end')   #>> '{}')::time;
  v_len   := mc_setting_int('saturday_window_minutes');
  if v_start is null or v_end is null or v_len is null or v_len < 15 or v_end <= v_start then
    perform mc_fail('config_pending','Configuração de horário de sábado inválida.');
  end if;

  -- próximo sábado estritamente após hoje (America/Sao_Paulo)
  v_first := mc_today() + ((6 - extract(dow from mc_today())::int + 6) % 7 + 1)::int;
  if extract(dow from v_first) <> 6 then v_first := v_first + (6 - extract(dow from v_first)::int); end if;

  for i in 0..p_weeks-1 loop
    v_day := v_first + (i * 7);
    insert into delivery_days(day, cutoff_at, status)
    values (v_day, ((v_day + v_start) at time zone 'America/Sao_Paulo') - make_interval(hours => v_cut), 'open')
    on conflict (day) do nothing;
    get diagnostics v_n = row_count; v_days := v_days + v_n;
    select id into v_dd from delivery_days where day = v_day;

    for v_area in select id from served_areas where active loop
      v_t := v_start;
      while v_t < v_end loop
        v_t2 := least(v_t + make_interval(mins => v_len), v_end);
        insert into delivery_windows(delivery_day_id, area_id, starts_at, ends_at, capacity)
        select v_dd, v_area.id, v_t, v_t2, v_cap
        where not exists (select 1 from delivery_windows w
                          where w.delivery_day_id = v_dd and w.area_id = v_area.id and w.starts_at = v_t);
        get diagnostics v_n = row_count; v_wins := v_wins + v_n;
        v_t := v_t2;
      end loop;
    end loop;
  end loop;
  perform mc_audit('generate_delivery_days','delivery_days', v_first::text, jsonb_build_object('weeks',p_weeks,'days_created',v_days,'windows_created',v_wins));
  return jsonb_build_object('days_created', v_days, 'windows_created', v_wins);
end $$;

revoke all on function generate_delivery_days(int) from public, anon, authenticated;
grant execute on function generate_delivery_days(int) to authenticated, service_role;
