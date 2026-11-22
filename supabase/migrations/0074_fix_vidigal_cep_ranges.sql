-- Correção: a faixa única do Vidigal (22450220–22452780) cobria toda a Gávea (22451xxx).
-- Idempotente: em bancos novos, a 0073 já traz as faixas corretas.
update blocked_cep_ranges set cep_from = '22450220', cep_to = '22450999',
       label = 'Vidigal (Av. Niemeyer, Estrada do Vidigal, Av. Pres. João Goulart)'
 where label = 'Vidigal';
insert into blocked_cep_ranges(cep_from, cep_to, label)
select '22452000','22452999','Vidigal (ruas internas)'
 where not exists (select 1 from blocked_cep_ranges where label = 'Vidigal (ruas internas)');
