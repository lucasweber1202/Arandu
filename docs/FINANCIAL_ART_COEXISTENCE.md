# Convivência entre a vertical de Arte e o Financial Procurement

## Decisão desta rodada: coexistência aditiva

Nada da vertical de Arte foi removido, renomeado, desligado ou migrado
destrutivamente. As duas verticais convivem no mesmo repositório e no mesmo
banco, separadas por nomes e por diretórios:

| Camada | Arte | Financial Procurement |
| --- | --- | --- |
| Banco | tabelas existentes, sem prefixo comum | prefixo `fin_` |
| Migrations | sequência canônica existente | um arquivo aditivo ao final |
| API | rotas existentes em `api/[...path].js` | `/api/finance/*` |
| Front | páginas na raiz, com casca pública | `finance/` e `provider/`, casca própria |
| CSS/JS | `css/arandu-*.css`, `js/*.js` | `finance/style.css`, `finance/app.js` |
| Testes | suítes existentes | `check:finance`, `tests/database/financial-procurement.sql`, `tests/e2e/finance-procurement.spec.js` |

## Por que não separar agora

Separar repositórios ou bancos é uma operação destrutiva e irreversível na
prática. Nesta rodada não há nenhuma evidência que a justifique: o custo de
convivência é baixo (prefixo no banco, diretório no front, um ramo no roteador
de API) e os gates existentes continuam verdes sem serem enfraquecidos.

Nenhuma migration desta rodada executa `DROP` sobre objeto de Arte. O rollback
do procurement financeiro remove apenas objetos `fin_*`, e remove as policies
antes das tabelas justamente para não precisar de `cascade`.

## Se a separação for desejada no futuro

A ordem segura seria:

1. congelar a criação de novos dados na vertical a ser movida;
2. exportar o subconjunto de tabelas (prefixo `fin_` é suficiente para o
   procurement financeiro — não há FK atravessando as duas verticais, exceto
   `auth.users`, que é comum);
3. reconstituir as contas no destino ou manter um provedor de identidade
   compartilhado;
4. republicar os diretórios de front correspondentes;
5. só então, e com backup verificado, considerar remoção na origem.

O ponto 2 é possível hoje porque **nenhuma tabela `fin_*` referencia tabela de
Arte**. Essa propriedade deve ser preservada: se algum dia uma FK cruzar as
verticais, a separação deixa de ser uma exportação e vira uma migração de dados.

## O que exige decisão humana

Se o nome "Arandu" deve permanecer compartilhado pelas duas verticais. Nenhum
rebranding irreversível foi feito nesta rodada: o código, o domínio e os
manifests continuam como estavam.
