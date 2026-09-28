# Brief — Aba de parcelamentos fiscais (`/admin/financeiro/parcelamentos`)

## Objetivo

Criar uma aba no financeiro para acompanhar os parcelamentos fiscais da JUST RUN
(RFB, PGFN, PMSP e PGM): parcelas já pagas, futuras, em atraso e as que colocam
um acordo em risco de rescisão. O financeiro (Katia) e o Ricardo precisam ver a
mesma coisa, e o desembolso precisa cair no DRE sem lançamento manual.

## Contexto e decisões já fechadas (Ricardo, 28/09/2026)

1. **DRE por regime de caixa.** A despesa nasce com a data real do pagamento,
   igual ao que Contas a Pagar já faz hoje.
2. **Janela rolante em Contas a Pagar.** Só entram as parcelas que vencem no mês
   corrente e no próximo. Motivo técnico: `fin_despesas` em modo `competencia`
   (que é o modo padrão do DRE) soma toda despesa lançada, paga ou não — lançar
   as ~300 parcelas futuras infla o DRE de todos os meses até 2031 e triplica o
   "em aberto" de Contas a Pagar (hoje 101 linhas). O horizonte completo fica na
   tela nova, num gráfico mês a mês.
3. **Centro de custo Geral já existe** (`unidade_id = null`, rotulado "Geral" em
   Contas a Pagar, Receitas, Recorrentes, Funcionários, e com coluna própria no
   DRE). Nada a criar. Os acordos nascem em Geral, porque a dívida é do CNPJ e
   não de uma unidade.

## Arquivos

| # | Arquivo | Ação |
|---|---|---|
| 1 | `supabase/fiscal-parcelamentos.sql` | **NOVO** — 593 linhas, completo |
| 2 | `src/app/admin/financeiro/parcelamentos/page.tsx` | **NOVO** — 932 linhas, completo |
| 3 | `src/app/admin/financeiro/parcelamentos/[id]/page.tsx` | **NOVO** — 791 linhas, completo |
| 4 | `src/app/admin/layout.tsx` | **EXISTENTE** — find/replace de 1 linha |

Os três arquivos novos vêm completos junto com este brief. Não reconstruir de
memória.

### Arquivo 4 — find/replace em `src/app/admin/layout.tsx`

Âncora verificada única na `main` (`grep -cF` = 1) e a linha nova ainda não
existe no arquivo (`grep -cF "parcelamentos"` = 0).

**Localizar:**

```
      { label: 'Recorrentes',          href: '/admin/financeiro/recorrentes' },
```

**Substituir por:**

```
      { label: 'Recorrentes',          href: '/admin/financeiro/recorrentes' },
      { label: 'Parcelamentos fiscais', href: '/admin/financeiro/parcelamentos' },
```

Fica dentro do grupo `Financeiro & Relatórios`, logo abaixo de "Recorrentes".
Nenhuma outra alteração no arquivo.

## O que o SQL cria

Três tabelas (`fiscal_acordos`, `fiscal_parcelas`, `fiscal_pendencias`), cada uma
com GRANTs por papel + `ENABLE ROW LEVEL SECURITY` + policy `fin_equipe_all`
(admin e coordenadora), conforme a regra do projeto de 23/09/2026. Mesmo recorte
do resto do financeiro.

Uma categoria nova em `categorias_despesa`: **"Parcelamentos Fiscais"**, grupo
`Impostos`, ordem 121 — fica ao lado da categoria "Impostos" existente no DRE.

Dois triggers de sincronização parcela ↔ despesa, nos dois sentidos, com guarda
anti-loop por `IS DISTINCT FROM` (cada lado só escreve quando o valor muda de
verdade, então o segundo disparo é no-op e para ali):

- `trg_fiscal_parcela_sync` em `fiscal_parcelas`
- `trg_fiscal_despesa_sync` em `public.despesas` ← **atenção: trigger em tabela
  existente.** Ele retorna de imediato quando `origem <> 'fiscal'`, ou seja, não
  toca em nenhuma despesa normal.

Quatro RPCs: `fiscal_gerar_parcelas`, `fiscal_sync_contas_a_pagar`,
`fiscal_resumo_acordos`, `fiscal_fluxo_futuro`. As duas primeiras são
`SECURITY DEFINER` com guarda de papel; as duas de leitura são `SECURITY INVOKER`
(a RLS das tabelas já restringe a admin/coordenadora — como DEFINER, sem guarda,
qualquer login lia as dívidas). Todas com `REVOKE` de `public`/`anon` e
`GRANT EXECUTE` para `authenticated, service_role`.

Carga inicial a partir dos relatórios (RFB/PGFN de **21/09/2026**, PGM e PMSP de
08/09/2026, relatório do Simples e a tabela da contabilidade): 12 acordos, ~130
parcelas e 9 pendências. O bloco de carga é idempotente — se `fiscal_acordos` já
tiver qualquer linha, ele emite um NOTICE e não roda de novo.

Ao final, a migration chama `fiscal_sync_contas_a_pagar()`, que cria **9 despesas**
em Contas a Pagar (as parcelas em atraso dos dois SIEFPAR e do PARCSN).

### Dados marcados como estimados

Onde o relatório não trouxe o dado por parcela, a linha entra com
`estimado = true` e a tela mostra `~` com o aviso de conferir no e-CAC:

- SIEFPAR 2023 e 2025: o relatório informa só o total em atraso (R$ 12.379,08 e
  R$ 10.025,40) e a quantidade (3 cada). Foi dividido por 3, com vencimento no
  último dia de jun/jul/ago de 2026.
- PARCSN: 3 parcelas em atraso, **valor não informado pelo relatório** — entram
  com valor 0 para serem preenchidas quando a contabilidade responder.
- As 3 simulações (RFB 60x, PGFN 6x, PGM 60x) entram com `status = 'simulado'`.

## Ordem de execução

1. Aplicar o SQL pelo **SQL Editor do Supabase** (produção). Confere o
   `NOTICE: Carga inicial concluída.` e o retorno `despesas_criadas = 9` no
   final.
2. Subir os dois `page.tsx` novos.
3. Aplicar o find/replace no `layout.tsx`.
4. Validar com esbuild.
5. Testar pelo checklist manual.

## Validação

```bash
npx esbuild@0.21.5 src/app/admin/financeiro/parcelamentos/page.tsx --bundle=false --outfile=/dev/null --loader:.tsx=tsx
npx esbuild@0.21.5 "src/app/admin/financeiro/parcelamentos/[id]/page.tsx" --bundle=false --outfile=/dev/null --loader:.tsx=tsx
npx esbuild@0.21.5 src/app/admin/layout.tsx --bundle=false --outfile=/dev/null --loader:.tsx=tsx
```

Os três precisam sair com exit 0. Já rodaram limpos aqui antes da entrega.

A migration já foi validada num PostgreSQL 16 local com o schema espelhado
(`perfis`, `unidades`, `categorias_despesa`, `fornecedores`, `despesas` e stubs
de `auth.uid()`/`auth.role()`). Aplicou limpa, os dois sentidos da baixa
sincronizaram, o estorno voltou nos dois lados e o
`fiscal_sync_contas_a_pagar()` rodado duas vezes não duplicou nada.

## Checklist manual

**Menu e carga**

- [ ] "Parcelamentos fiscais" aparece no menu, dentro de Financeiro & Relatórios,
      logo abaixo de "Recorrentes"
- [ ] A tela abre com **3 acordos na faixa vermelha** de risco de rescisão: os
      dois SIEFPAR (3 de 3 parcelas em atraso cada) e o PARCSN
- [ ] "Em atraso" mostra **R$ 22.404,48** em 9 parcelas (as 3 do PARCSN contam
      mas entram com valor 0 porque a contabilidade ainda não informou)
- [ ] O bloco "Fora de acordo" lista 9 pendências, com a de 08/2026
      (R$ 4.587,42) entre as de risco alto

**Sincronização com o financeiro**

- [ ] Em Contas a Pagar, filtrando "Todos os meses" + "Em aberto", aparecem as 9
      despesas com origem `fiscal` e categoria "Parcelamentos Fiscais"
- [ ] Abrir um acordo → "Marcar como paga" numa parcela, com data e valor → a
      despesa correspondente em Contas a Pagar fica paga com a mesma data
- [ ] O caminho inverso: baixar a despesa em Contas a Pagar → a parcela aparece
      como paga na tela do acordo
- [ ] Estornar a parcela → a despesa volta para "em aberto" e o valor volta ao
      valor original da parcela
- [ ] No DRE em regime de **caixa**, o mês do pagamento mostra a linha
      "Parcelamentos Fiscais" dentro do grupo Impostos, coluna **Geral**

**Comportamento das simulações**

- [ ] As 3 simulações aparecem no gráfico "Desembolso mês a mês" na cor clara e
      somem ao desmarcar "Incluir simulações"
- [ ] Nenhuma simulação gerou despesa em Contas a Pagar
- [ ] Trocar o status de uma simulação para "Ativo" e clicar em "Sincronizar" na
      lista → só a(s) parcela(s) dentro da janela (mês corrente + próximo)
      viram despesa

**Idempotência e mobile**

- [ ] Clicar "Sincronizar" duas vezes seguidas não duplica despesa (a segunda
      informa que não há nada novo)
- [ ] No celular, as duas telas usam cartões e não rolam para o lado

## Fora de escopo

- Não mexer em `fin_despesas`, `fin_faturamento`, `fin_resultado` nem em
  qualquer tela existente do financeiro
- Não mexer na tela de Contas a Pagar — ela lê `despesas` e já mostra as linhas
  novas sem alteração
- Não alterar a estrutura de `despesas`, `categorias_despesa`, `fornecedores` ou
  `unidades`; a única escrita nelas é o INSERT da categoria nova
- Não criar rateio de despesa entre unidades (uma despesa continua sendo Geral
  **ou** de uma unidade) — se for preciso, é outro trabalho
- Não criar alerta por e-mail ou WhatsApp de parcela a vencer — fica para uma
  fase 2, com cron

## Rollback

Os `.tsx` são arquivos novos: basta apagar a pasta
`src/app/admin/financeiro/parcelamentos/` e reverter a linha do `layout.tsx`.

Para o banco, na ordem:

```sql
-- 1. Remove as despesas que a integração criou (nenhuma outra tem origem 'fiscal')
DELETE FROM public.despesas WHERE origem = 'fiscal';

-- 2. Triggers (o de despesas é o único que toca tabela existente)
DROP TRIGGER IF EXISTS trg_fiscal_despesa_sync ON public.despesas;
DROP TRIGGER IF EXISTS trg_fiscal_parcela_sync ON public.fiscal_parcelas;

-- 3. Funções
DROP FUNCTION IF EXISTS public.fiscal_despesa_sync_parcela();
DROP FUNCTION IF EXISTS public.fiscal_parcela_sync_despesa();
DROP FUNCTION IF EXISTS public.fiscal_sync_contas_a_pagar();
DROP FUNCTION IF EXISTS public.fiscal_resumo_acordos();
DROP FUNCTION IF EXISTS public.fiscal_fluxo_futuro(integer, boolean);
DROP FUNCTION IF EXISTS public.fiscal_gerar_parcelas(uuid, date, integer, numeric, numeric, boolean);

-- 4. Tabelas (fiscal_parcelas cai junto por CASCADE, mas explícito é melhor)
DROP TABLE IF EXISTS public.fiscal_pendencias;
DROP TABLE IF EXISTS public.fiscal_parcelas;
DROP TABLE IF EXISTS public.fiscal_acordos;

-- 5. Categoria (só se nenhuma despesa manual tiver sido criada nela)
DELETE FROM public.categorias_despesa
 WHERE nome = 'Parcelamentos Fiscais'
   AND NOT EXISTS (
     SELECT 1 FROM public.despesas d
      WHERE d.categoria_id = categorias_despesa.id
   );
```

**Atenção no passo 1:** se alguém já tiver dado baixa em parcelas antes do
rollback, o DELETE apaga também esses pagamentos do DRE. Conferir antes com
`SELECT count(*), sum(valor) FROM despesas WHERE origem = 'fiscal' AND pago;`.

## Pendências de negócio (não são código)

Anotadas nas observações dos registros, para não se perderem:

1. **Valor das 3 parcelas do PARCSN** — a contabilidade não informou; as linhas
   estão com valor 0.
2. **O IRRF pode ser parcelado?** R$ 41.097,20 dos R$ 55.501,92 da RFB são IRRF
   cód. 3208, retido na fonte. A Lei 10.522/2002 veda parcelar tributo retido.
   Se a vedação valer, a simulação não passa no e-CAC e o plano muda.
3. **De onde vem o IRRF 3208 mensal** de R$ 4.535,60, e por que 07/2026 não
   aparece no relatório de 21/09.
4. **Prazo real do reenquadramento** — se já houve Termo de Exclusão com ciência,
   são 30 dias a partir dela, não o fim de janeiro de 2027.
5. **O TDM municipal cobre os 18 autos de ISS?** Os valores batem
   (R$ 7.822,14 × R$ 7.822,76), mas os autos seguem aparecendo como pendentes.
6. **Existe PPI municipal aberto?** O parcelamento da PGM está simulado sem
   desconto nenhum.
