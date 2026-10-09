# Incidentes, backup e observabilidade

## Logs e alertas

- Toda falha de API recebe `X-Request-ID`.
- Logs de erro usam somente campos permitidos e removem quebras de linha.
- E-mail, telefone, corpo do request, cookies, JWTs e chaves não entram no
  evento.
- `ARANDU_ERROR_MONITORING_ENDPOINT` precisa usar HTTPS.
- O token do provedor é variável exclusiva do servidor.
- Configure retenção de eventos por no máximo 30 dias, salvo obrigação formal
  aprovada e documentada.
- Só marque `ARANDU_ERROR_MONITORING_READY=true` depois de receber e localizar
  um erro canário pelo request ID.

## Severidades

Analytics de produto não é trilha de auditoria ou monitoramento de erros.
Falha de PostHog não interrompe transações. Para bloquear coleta, configure
`ARANDU_ANALYTICS_ENABLED=false` no servidor e redeploy. Não envie payloads
financeiros ou segredos em issues do Linear. Contrato, retenção/exclusão,
verificação e rollback em [PRODUCT_ANALYTICS.md](PRODUCT_ANALYTICS.md).

| Severidade | Exemplo | Ação |
| --- | --- | --- |
| crítica | exposição de segredo, bypass de autorização, perda de dados | bloquear deploy e iniciar incidente |
| alta | reservas inconsistentes, indisponibilidade comercial | pausar operação e investigar |
| média | falha parcial com alternativa segura | corrigir antes da próxima liberação |
| baixa | degradação visual ou documentação | registrar no backlog |

## Backup e restauração

1. Registre uma referência externa do backup sem credenciais ou PII.
2. Faça restauração em projeto descartável.
3. Aplique `npm run test:database`.
4. Execute probes de RLS, concorrência, expiração e canário.
5. Registre data, papel responsável e referência em
   `ops/release-evidence.json`.
6. Nunca considere a existência de um backup como prova de restauração.

## Incidente

1. interromper escritas afetadas;
2. preservar request IDs e referências de deploy;
3. rotacionar credenciais quando houver suspeita de exposição;
4. avaliar titulares e obrigações de comunicação;
5. corrigir em branch e PR;
6. validar rollback e restauração;
7. registrar causa, impacto, correção e prevenção sem PII.
