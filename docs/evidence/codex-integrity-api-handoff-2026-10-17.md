# Handoff de integridade e assignments — 17/10/2026

Base: `605c7f5a9ff619e18fec6f1e7160949d878f345a` (#211/#213/#214 integradas).
Nenhuma mudança de frontend, seed ou E2E. Os consumidores da #214 já consultam
`buyer_name` quando disponível.

## Nome do comprador

`GET /api/finance/assignments?organization_id=<organização provedora>` conserva
todos os campos e acrescenta `rows[].buyer_name: string|null`.

```json
{"ok":true,"rows":[{"proposal_id":"00000000-0000-4000-8000-000000000001","rfq_id":"00000000-0000-4000-8000-000000000002","buyer_name":"Compradora sintética","version":2}]}
```

Exemplo parcial sintético: os campos anteriores continuam presentes. Nome vem
de `trade_name` não vazio ou `legal_name`, na organização realmente dona da RFQ
do convite aceito. Não vem de parâmetro do navegador, termos da proposta ou
nome do provedor. Não são retornados contatos, documentos, CNPJ ou outros dados
da organização. Ausência autorizada de nome é `null`, nunca um nome inventado.

Servidor usa o JWT do chamador, valida membresia em organização PROVIDER e
envia somente os IDs das RFQs das propostas autorizadas (até 200) à nova RPC
`fin_assignment_buyer_names(uuid,uuid[])`. A RPC reconfere membresia e vínculo
convite aceito/proposta. Nenhum SELECT de organização compradora é concedido
ao provedor. Outro tenant/provedor, organização forjada e membro removido não
conseguem obter o nome. Falha da RPC não cai em consulta por service role.

Essa leitura não tem replay de escrita; não há retry automático novo. Mesmos
erros de sessão, organização, limite e indisponibilidade do endpoint. Lista
vazia permanece `{ok:true,rows:[]}`. `contract_id` da #211 e tarefas da #213/#214
não foram alterados.

## Decisão e aprovação

`POST /api/finance/decisions` continua exigindo `expected_version` e chamando
`fin_record_decision_v2`. Versão obsoleta continua conflito
`proposal_version_changed`, sem decisão/evento parcial. Não atualizar o número
e confirmar automaticamente: é preciso mostrar as novas condições à pessoa.

A RPC antiga `fin_record_decision(uuid,uuid,jsonb,text)` fica **interna**:
authenticated, anon e service_role perdem EXECUTE direto. A v2 SECURITY DEFINER
continua chamando a implementação como owner; a migration confere esse acesso
antes do commit. Integração externa antiga deve migrar para v2 com a versão
efetivamente vista, sem buscar a versão corrente para preencher silenciosamente.

Voto na aprovação reconfere membresia/entidade/policy na escrita e trava o
vínculo até commit. Remoção já commitada durante a espera do voto recebe
`forbidden`, sem voto/evento; voto autorizado primeiro faz a remoção esperar.
Papéis existentes são preservados: leitor indicado pode votar no fluxo legado;
policy continua exigindo os papéis definidos nela. Não há promoção de papel.

## Rollout e rollback

Migration: `docs/supabase-financial-enterprise-integrity.sql`, após task
accountability; marker `financial-enterprise-integrity-1`. **Schema primeiro,
aplicação depois**, com aprovação operacional própria e recovery aplicável.
Aplicação anterior já usa v2 e continua compatível com o schema corrigido.
Aplicação nova exige a RPC de nomes; sem rollout, assignments pode falhar
fechado. Não foi aplicada migration hospedada nesta missão.

Rollback da aplicação é compatível com v2. O arquivo de rollback SQL remove
somente a RPC aditiva de nomes e restaura o marker anterior; mantém o fechamento
da RPC antiga e a guarda do voto. É rollback compatível com correções de
segurança preservadas, não restauração irrestrita dos privilégios vulneráveis.
O doctor bloqueia até reconciliar/reaplicar o schema esperado. Dados e decisões
registradas não são reescritos.

## Ensaios locais

Os 429 da #214 são limites legítimos, não sucesso falso. Não acrescentei um
seletor por header/query nem um bypass de rate limit. O runtime atual não
fornece atestado de servidor local que não possa ser herdado de configuração
de hospedagem; um perfil novo exige esse contrato e seus negativos primeiro.
Production e Preview conservam integralmente a política atual. Para o ensaio,
separar seed/auditoria/apresentação e respeitar a janela; não fazer retry storm.
