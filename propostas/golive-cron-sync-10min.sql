-- Go-live (A7): sync do Mercado Pago de 5 para 10 minutos (hoje: jobid 2, mc-mp-sync, '*/5 * * * *').
-- Com retry em 429 dentro da função, 10 min reduz a pressão sobre a API sem atrasar a liberação (o botão "Verificar pagamento" cobre a espera).
-- Aplicar só depois do deploy da nova mercadopago-sync. Reverter: schedule '*/5 * * * *'.
select cron.alter_job(job_id := 2, schedule := '*/10 * * * *');
