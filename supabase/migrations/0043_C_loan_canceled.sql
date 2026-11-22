-- Frente C — novo valor de loan_status. Só pode ser usado em migrações posteriores (0044+).
alter type loan_status add value if not exists 'canceled';
