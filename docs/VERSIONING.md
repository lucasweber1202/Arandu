# Estratégia de versionamento

## Situação atual

O `package.json` permanece em `0.1.0` enquanto o Arandu está em pré-lançamento e os gates externos ainda não foram concluídos.

As marcações `v1.0`, `v1.1` e semelhantes existentes no changelog representam **marcos internos de produto e implementação**, não uma liberação pública e operacional da plataforma.

Essa distinção evita que uma melhoria técnica seja confundida com autorização para abrir catálogo, vendas ou produção.

## Regra até o lançamento

Antes da primeira liberação pública:

- mantenha `package.json` e `package-lock.json` sincronizados;
- registre mudanças em `Não lançado` no changelog;
- não crie tag de release pública;
- não use número de versão como substituto para os gates de `ops/release-evidence.json`.

## Primeira versão pública

A versão `1.0.0` pública somente deve ser criada quando:

- `npm run release:check` passar;
- `npm run predeploy` passar;
- catálogo, política comercial e piloto tiverem aprovação humana;
- staging, backup, restore e canários estiverem referenciados;
- domínio, contato LGPD e monitoramento estiverem ativos;
- o commit liberado estiver identificado e imutável.

## Depois do lançamento

Use SemVer:

- `PATCH`: correção compatível e sem mudança de contrato;
- `MINOR`: funcionalidade compatível ou expansão de capacidade;
- `MAJOR`: mudança incompatível de API, dados ou operação.

Toda release deve atualizar, no mesmo PR:

1. `package.json`;
2. `package-lock.json`;
3. `CHANGELOG.md`;
4. documentação afetada;
5. evidências e notas de rollback, quando aplicável.

## Tags

Tags devem apontar para commits da `main` com CI verde. O nome recomendado é `vMAJOR.MINOR.PATCH`.

Não mova uma tag publicada. Em caso de erro, publique uma nova versão corretiva.
