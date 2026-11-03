# CI proporcional ao risco — decisão do proprietário v6.1

Os contextos obrigatórios continuam `database`, `deploy-boundaries`, `validate`,
`presentation`, vinculados ao GitHub Actions e SHA candidato. Não é necessária
mudança do ruleset main-required-gates. O ruleset observado em 03/11 é ativo,
sem bypass, exige base atualizada e os quatro contextos. Leitura administrativa
de branch protection retornou 403; nenhum controle remoto foi alterado.

`ci.yml` classifica o diff completo base...head e verifica que o checkout é o
merge candidato e contém a base atual. Renomes incluem os dois caminhos;
remoções também são consideradas. Sem diff/classificação o run falha. Labels,
nomes de branch e entradas do autor não reduzem risco.

A: documentação explicativa explicitamente permitida e estilos/assets locais.
B: views/componentes e apresentação pura; superfícies compartilhadas ampliam os
E2E Chromium desktop/mobile. C: APIs e domínio não crítico; D: Auth, permissões,
Storage, Recovery, migrations, integridade econômica, workflows, política,
deploy e qualquer arquivo desconhecido. A classe mais alta prevalece.

A/B: audit, check:all, build de produto, budgets, assets, SEO, navegação e E2E
Chromium selecionados por superfície. Não há PostgreSQL, Docker, Firefox ou
WebKit nesse caminho. O mapeamento está em classify-event.mjs; módulos
compartilhados/desconhecidos ao mapeamento visual ampliam a todas as suítes
financeiras Chromium. C/D: ci-full.yml preserva a antiga matriz completa,
banco e export/restore real; demo-integration.yml é chamado com Supabase,
Auth, Storage, seed, quatro visitantes, Recovery e adversariais reais.

Cada contexto obrigatório exige classificação válida e sucesso do caminho
aplicável no SHA atual. Falha, cancelamento e ausência não passam. O caminho
não aplicável deve estar explicitamente skipped; isso não equivale a teste
aprovado. Um contexto só termina verde após todas as provas necessárias.

Push main, agenda semanal (segunda-feira 05:17 UTC) e workflow_dispatch executam
full validation. Regressão pós-merge: registrar run/SHA e severidade, suspender
promoção desse candidato, preservar evidências e corrigir via PR ou reverter
código por PR quando seguro. Não restaurar banco automaticamente. Release
exige full validation e integração real verdes no MESMO SHA; PR rápida não
comprova M3/M4/M5 nem autoriza publicação/cutover. Revalidar após correção.

A própria mudança de CI é D e valida a matriz integral. Ainda não há amostra
real do caminho rápido: meta de 5–10 minutos não é resultado medido. Comparar
runs da mesma classe de runner/dataset/cobertura; reportar setup, testes,
minutos arredondados por job e tempo de despacho separadamente de fila pura.

Próxima entrega backend, separada da CI: verificar consulta organizacional de
propostas externas e contagens derivadas sem fan-out, reutilizar RLS/estados/
versionamento canônicos; integrar contratos da #312 após seus gates e merge.
Frontend permanece com CC. Não há mudanças hospedadas nesta entrega.
