begin;
-- sem capacidade/corte configurados: config_pending
delete from settings where key in ('window_capacity','saturday_cutoff_hours_before');
select t.throws($$select generate_delivery_days(2)$$, 'config_pending', 'exige configuração');
insert into settings(key,value) values ('window_capacity','9999'),('saturday_cutoff_hours_before','1');
select t.eq((generate_delivery_days(4)->>'days_created')::int, 4, '4 sábados');
select t.eq((select count(*)::int from delivery_days where extract(dow from day)=6), 4, 'todos são sábado');
select t.eq((select count(*)::int from delivery_windows), 4 * (select count(*)::int from served_areas where active), 'uma janela por bairro por sábado');
select t.eq((select min(starts_at)::text||'-'||max(ends_at)::text from delivery_windows), '09:00:00-14:00:00', 'janela 09-14h');
select t.eq((select count(*)::int from delivery_days where day <= current_date), 0, 'só sábados futuros');
select t.eq((generate_delivery_days(4)->>'days_created')::int, 0, 'idempotente');
select t.eq((select count(*)::int from delivery_days where (cutoff_at at time zone 'America/Sao_Paulo')::time <> '08:00'), 0, 'fecha às 08h');
-- janelas de 2h: 09-11, 11-13, 13-14
update settings set value='120' where key='saturday_window_minutes';
select generate_delivery_days(1);
select t.eq((select count(*)::int from delivery_windows w join delivery_days d on d.id=w.delivery_day_id
             where d.day=(select min(day) from delivery_days) and w.area_id=(select min(id) from served_areas)), 3, 'fatias de 2h');
rollback;
