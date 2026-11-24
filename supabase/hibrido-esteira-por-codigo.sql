-- supabase/hibrido-esteira-por-codigo.sql (aplicado em 24/11/2026)
-- Running & Hybrid: em Grupos A/B cada código (E1..E5) tem a própria corrida na esteira
-- (a dupla da esteira E1 troca com a do chão E1). Fica na linha do chão daquele código.
alter table public.hibrido_estacoes add column if not exists esteira text;
comment on column public.hibrido_estacoes.esteira is 'Grupos A/B: o que a dupla faz na esteira do mesmo código (E1..E5) desta estação do chão';
