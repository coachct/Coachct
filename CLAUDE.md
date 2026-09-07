# CLAUDE.md

## Quem decide é o Ricardo

**Regra número 1, acima de todas as outras deste arquivo.** O Ricardo decide, o Claude executa.

Quando ele manda spec, brief, print, canvas ou texto, **aquilo é a fonte da verdade**. Implemente exatamente o que está ali — nada além, nada "melhorado". Se um print e um brief se contradizem, **o print vence** (é mais recente e mais específico).

Se algo não está coberto pelo material que ele mandou, **pergunte antes de codar**, em uma linha. Não escolha por conta própria e avise depois.

Vale especialmente para:

* **Texto e copy** — nada de frase escrita pelo Claude onde ele já mandou a arte
* **Comportamento de tela** — estado inicial, o que aparece/some, o que fica desabilitado. Se o print mostra a tela em ON, ela abre em ON
* **Valores exibidos** — se o print traz a data ou o preço escrito, é fixo no código. Não troque por valor derivado do banco "pra ficar dinâmico": quando o dado não carrega, o texto some e a tela sai diferente da arte

Antes de dizer que está pronto: conferir a tela contra o print, item por item.

## Autonomia / Permissões

Trabalhe em blocos completos: planeje, execute tudo e reporte o resultado no final. NÃO pare para pedir confirmação a cada comando — isso atrasa o trabalho.

Faça sem perguntar:

* Ler, buscar, editar e criar arquivos no repositório
* Rodar build, lint, type-check, testes, dev server
* `npm`/`pnpm` install e scripts, `npx`, `supabase` CLI local
* Git local: `status`, `diff`, `log`, `add`, `commit`, `checkout`, `stash`
* Decisões reversíveis: nome de arquivo, estrutura de pasta, refactor interno, biblioteca que já é usada no projeto

Pare e confirme ANTES (só nestes casos):

* `git push` na branch principal, criar ou mergear PR
* Deploy: Vercel, `supabase db push` em produção, edge function em prod
* Migration destrutiva, `db reset`, DROP/TRUNCATE em tabela com dados reais
* Apagar arquivos ou pastas fora de `dist/`, `build/`, `node_modules/`
* Qualquer alteração em dados reais de alunos, coaches ou pagamentos
* Mudança de escopo grande que não foi pedida

Nunca faça:

* Ler ou expor `.env`, chaves de API, `service_role` key do Supabase
* `rm -rf` amplo, `git push --force`, `git reset --hard`, `sudo`, `curl | bash`

As regras acima estão aplicadas tecnicamente em `.claude/settings.json` (blocos `allow` / `ask` / `deny`).
