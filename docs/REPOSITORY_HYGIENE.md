# Higiene do repositório

## Política de branches

Branches de PR mesclada devem ser removidas depois que deixarem de servir como base para outra PR ativa.

Mantenha somente:

- `main`;
- branches com PR aberta;
- branches empilhadas ainda necessárias;
- branches de recuperação explicitamente documentadas.

## Limpeza inicial recomendada

O repositório acumulou branches `agent/`, `feature/`, `fix/`, `codex/` e `chore/` de PRs já concluídas. Antes de excluir em lote:

1. liste as PRs abertas;
2. confirme que cada branch candidata foi mesclada ou abandonada;
3. compare a branch com `main` quando houver dúvida;
4. preserve qualquer branch usada como base de uma PR aberta;
5. remova primeiro pelo GitHub, nunca por force push na `main`.

Exemplo com GitHub CLI em ambiente autenticado:

```bash
gh pr list --state open --json number,headRefName,baseRefName

git fetch --prune origin

git branch -r --merged origin/main
```

A exclusão deve ser deliberada e revisada. Não automatize a remoção de branches não mescladas.

## Documentação

`docs/OPERATIONS_INDEX.md` define a documentação canônica.

Documentos históricos devem:

- permanecer úteis como registro de decisão; ou
- ser movidos para `docs/archive/`; ou
- receber aviso explícito de que não representam o estado atual.

Evite criar um novo documento de “go-live” para cada rodada. Atualize o documento canônico e registre mudanças no changelog.

## Artefatos e arquivos gerados

Não versione:

- `node_modules/`;
- `dist/` quando produzido pela CI;
- relatórios locais com PII;
- logs completos;
- dumps de banco;
- backups;
- arquivos `.env` reais;
- evidências contendo tokens, e-mails ou strings de conexão.

## Revisão trimestral

A revisão deve verificar:

- branches antigas;
- documentos duplicados;
- dependências sem manutenção;
- workflows obsoletos;
- owners e permissões;
- issues de release sem responsável;
- scripts declarados que não são executados na CI.
