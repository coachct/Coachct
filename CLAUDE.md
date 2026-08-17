# CLAUDE.md

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
