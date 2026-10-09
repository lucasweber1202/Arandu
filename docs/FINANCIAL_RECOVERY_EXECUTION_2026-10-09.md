# Recovery execution — 09/10/2026

Esta evidência registra a preparação do lote `agent/recovery-execution` sobre
main `c3508fc3f33b8427fdc850f53c2c037c5e9cfc31` (merge da PR #151).
Resultados do CI da nova PR devem ser consultados no HEAD exato; não inferir
sucesso pelo CI da base. Nenhuma conversão foi autorizada por esta evidência.

| Item | Estado e evidência |
| --- | --- |
| Main | VALIDADO: c3508fc3f33b8427fdc850f53c2c037c5e9cfc31 na consulta incremental |
| PR #151 | EXECUTADO: merge existente; revisão direcionada ao export nesta rodada |
| CI da main | VALIDADO: run #813, 37968792702, concluído success; quatro checks aprovados |
| Merge audit | VALIDADO: #25, 37968792727, success |
| Novo lote/PR | IMPLEMENTADO em branch própria; sem merge nesta evidência |
| Checks do novo lote | TESTADO LOCALMENTE: check:all, build e negativos de export/transferência; CI novo ainda pendente na emissão |
| Defeitos corrigidos | IMPLEMENTADO: checksum real do recipient antes do probe; age recebe só PATH; evidência de exits/SHA/reconciliação; destino/SHA aprovados, readback e não sobrescrita |
| Executor | IMPLEMENTADO: ubuntu-24.04 padrão; self-hosted arandu-recovery fallback, disponibilidade não comprovada |
| Ferramentas | IMPLEMENTADO: PGDG 17.11-1.pgdg24.04+2 assinado/fingerprint; age 1.3.2/hash oficial |
| Infra configurada | Nenhum Environment, runner, bucket, secret ou destino de restore criado/alterado; workflow proposto via PR |
| Destino privado | BLOQUEADO: bucket privado existente/retention/jurisdição/recuperação da chave precisam de aprovação específica; nenhum destino presumido |
| Autenticação | BLOQUEADO para export: credenciais administrativas de DB/capabilities S3 não presentes no executor; não solicitadas pelo chat |
| Backup Pilot | BLOQUEADO / NOT RUN: offgpyysgdhfemjlchod |
| Backup legado | BLOQUEADO / NOT RUN: igacnfjeuqhxcmfyepgj |
| Restore Pilot | BLOQUEADO / NOT RUN: nenhum backup hospedado ou executor isolado aprovado |
| Restore legado | BLOQUEADO / NOT RUN: mesmas dependências |
| Hashes hospedados | NOT RUN: não existem ciphertexts hospedados desta rodada; código confere SHA-256 local e remoto |
| Ensaio real | IMPLEMENTADO: duas instâncias novas PG17, age real, restore do mesmo arquivo e reconciliação; obrigatório em database. Pendente de execução CI na emissão |
| Dados históricos | BLOQUEADO para conversão: oito registros com campos potencialmente pessoais; classificação/retention LGPD não aprovadas; nenhuma exclusão/anonimização executada |
| Demo | BLOQUEADO para canônica: Vercel dpl_EzwCM6SfPsJmMVzZ19wEuspNeapS READY; sandbox não prova Auth/RLS/jornadas financeiras |
| Production | BLOQUEADO: Vercel dpl_BrjQyAqoReQgcytmWcu2JCo1Ssfc ERROR; primeira linha do build não comprovada; não repetido endpoint 403 |
| Linear | EXECUTADO: ARA-8 reaberta In Progress e atualização incremental com estados efetivos |
| Operações omitidas | Nenhum dump real, upload de negócio, restore hospedado, migration, cutover, alteração da allowlist/RLS, recurso pago ou bypass |

## Testes e limites

Os negativos locais de export usam subprocessos simulados; os de transferência
usam S3 simulado. Comprovam falhas, identidade, paths, não sobrescrita e ausência
de falso PASS. **Não são recovery hospedado.** O teste real no database usa
binários oficiais instalados, registros sintéticos e o mesmo mecanismo de
export. Não depende de secrets, serviço pago ou Docker. O executor desta sessão
não tem PG17/age e não permite os usuários de sistema exigidos por apt/initdb;
a instalação apt foi recusada por setgroups/setuid. Não contornar essa limitação:
executar o ensaio no runner GitHub autorizado e registrar seu resultado real.

O ensaio verifica decriptação correta/incorreta/corrompida, pg_restore --list,
tabelas/dados/contagens, constraints, índices, functions, views, triggers,
policies/RLS, ACL/owners/default privileges, roles sem senhas, metadados
Auth/Storage/migrations sintéticos e extensões. Restaurar schemas chamados auth
e storage em PostgreSQL puro **não comprova** serviços Supabase compatíveis.

## Intervenções estritamente necessárias

1. **Environment:** em https://github.com/lucasweber1202/Arandu/settings/environments,
   configurar/verificar database-recovery, branch main somente, revisores e
   prevent self-review quando disponível. O conector rejeitou especificamente
   actions/runners e environments/database-recovery como endpoints não
   suportados; não houve solicitação de autenticação remota.
2. **Destino:** aprovar bucket AWS S3 privado já existente, prefixo novo por
   operação, jurisdição/retention/custo/acesso após rotação. Confirmar IAM/Block
   Public Access e PUT condicional. Não criar serviço pago. Registrar a decisão
   no ARA-8 ou registro aprovado e montar o JSON documentado no runbook.
3. **Secrets:** no mesmo Environment, cadastrar ARANDU_PILOT_RECOVERY_DATABASE_URL,
   ARANDU_LEGACY_RECOVERY_DATABASE_URL, ARANDU_RECOVERY_RECIPIENT e, para hosted,
   ARANDU_RECOVERY_DESTINATION. Este último contém aprovação vinculada a projeto
   e SHA mais URLs SigV4 PUT/GET dos três objetos, fora do chat. A chave privada
   age permanece em cofre separado, com recuperação verificada. URLs não são
   permanência do backup: preservar identificação do prefixo e acesso do operador.
4. **Execução:** após revisão/merge com os quatro gates, aprovar o workflow manual
   na main e SHA revisados, Pilot primeiro. Sucesso exige export+PUT+GET+hash;
   restore e reconciliação continuam pendentes. Interrupções deixam possíveis
   objetos órfãos; não contar como backup aprovado, nem apagá-los automaticamente.
5. **Restore/cutover:** aprovar executor Supabase PG17 isolado e descartável e a
   classificação dos registros legados. Restore dos mesmos ciphertexts, revisão
   de roles privilegiadas, reconciliação de dados/configurações e gates do produto
   são necessários antes da Demo; Production vem depois, com aprovação de cutover.

Procedimento detalhado: [SUPABASE_ENCRYPTED_PRESERVATION.md](SUPABASE_ENCRYPTED_PRESERVATION.md).
