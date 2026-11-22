-- Frente C — bairros atendidos (decisão do dono: toda a Zona Sul do Rio).
-- ATENÇÃO: são APROXIMAÇÕES por prefixo de 4 dígitos do CEP, a conferir com a base dos Correios.
-- Santa Teresa e Cosme Velho NÃO estão incluídos (CEPs não confirmados).
-- check_service_area (0020_A) casa por prefixo; nenhum ajuste necessário.
insert into served_areas(name, cep_prefixes, active) values
  ('Leme e Copacabana',                          array['2201','2202','2203','2204','2205','2206','2207','2208'], true),
  ('Glória, Catete, Flamengo e Laranjeiras',     array['2221','2222','2223','2224'], true),
  ('Botafogo, Humaitá e Urca',                   array['2225','2226','2227','2228','2229'], true),
  ('Ipanema, Arpoador e Leblon',                 array['2241','2242','2243','2244'], true),
  ('Lagoa, Jardim Botânico, Gávea e Vidigal',    array['2245','2246','2247'], true),
  ('São Conrado e Rocinha',                      array['2261'], true)
on conflict (name) do update set cep_prefixes = excluded.cep_prefixes, active = excluded.active;
