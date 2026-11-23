-- 0080: reservar exige assinatura ativa E dentro do período pago (current_period_end >= hoje, America/Sao_Paulo).
-- Protege o acesso caso um webhook de renovação falhe ou atrase. Já aplicada no banco (patch sobre a definição vigente).
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('reserve_book'::regproc);
  if position('current_period_end >=' in d) > 0 then return; end if;
  n := replace(d, 'where customer_id = v_uid and status = ''active'') then',
    'where customer_id = v_uid and status = ''active'' and (current_period_end is null or current_period_end >= (now() at time zone ''America/Sao_Paulo'')::date)) then');
  if n = d then raise exception 'trecho de reserve_book não encontrado'; end if;
  execute n;
end $$;
