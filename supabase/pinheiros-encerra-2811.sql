-- supabase/pinheiros-encerra-2811.sql
--
-- Agendamentos (pg_cron, horário GMT) criados em 24/11/2026. Cada job roda uma vez e se remove.
--
-- 1) JustClub Pinheiros encerra em 28/11/2026 às 13:00 SP (16:00 GMT): unidade inativa,
--    publicação Wellhub/TotalPass pausada, aulas e planos de app da unidade desativados.
--    O site e os bots param de mostrar Pinheiros na mesma hora (src/lib/pinheiros.ts).
-- 2) Running antigo de seg/qui/dom da Vila Olímpia (virou Running & Hybrid) desativado
--    em 30/11/2026 00:00 SP (03:00 GMT), depois da última ocorrência que ainda valia.

select cron.schedule('pinheiros-encerra-2811', '0 16 28 11 *', $job$
  update public.unidades set ativo = false, wellhub_estado = 'pausado', totalpass_estado = 'pausado'
   where id = '166a683d-5fe6-4177-8fd6-53deb70b428e';
  update public.club_aulas set ativo = false where unidade_id = '166a683d-5fe6-4177-8fd6-53deb70b428e' and ativo;
  update public.planos_disponiveis set ativo = false where unidade_id = '166a683d-5fe6-4177-8fd6-53deb70b428e' and ativo;
  select cron.unschedule('pinheiros-encerra-2811');
$job$);

select cron.schedule('vo-running-antigo-desativa-3011', '0 3 30 11 *', $job$
  update public.club_aulas set ativo = false
   where id in ('1f972cbd-bcff-4335-9fc4-4fd783372ecc','3f404544-6a7a-4fe8-a93d-06f7fb07b12b','1a256529-7841-4d81-9ffe-f3358e4822e4',
                '8ec6d714-bec0-4fc3-b0f3-0a9263e9c8a5','87f0cccf-90c6-4735-9c3d-cde5caaa3ec3','9c611db0-5fb8-4e10-b954-b30786cfe717',
                '1b131acb-18f0-42b7-9b8b-6673371a863b','031d5a75-a0c8-44a8-b329-71b3ca1ecb05','a7a8eaf4-c0a9-4ffb-a160-32791eabaaf2',
                '55ac4e8a-3b4e-4175-80c5-6a917feeb1ee','04a2117d-9004-47a8-912b-f204b6442938','b58c420f-bbf9-4f1d-b746-398f49bbd023',
                '78481247-5385-477d-bb74-c11b825350a3');
  select cron.unschedule('vo-running-antigo-desativa-3011');
$job$);
