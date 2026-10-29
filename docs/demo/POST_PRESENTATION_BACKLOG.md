# Backlog pós-apresentação (a partir de 30/10/2026)

Ordenado pela sequência da guideline v3.6 §38 / v3.7 (P0 → P1-A → P1-B →
piloto → integrações). Nenhum item aqui foi iniciado nem autoriza escopo.
Achados da rodada de 28–29/10 estão marcados com ★.

## P0 residual

1. Registrar o resultado real da apresentação (o que foi mostrado, onde falhou), sem métricas comerciais inventadas.
2. ★ Prova da estação no computador definitivo (WSL2) se não tiver acontecido: `station` READY guardado como evidência.

## P1-A — Primeiro valor, adoção bilateral, portal da instituição

3. Teste com pessoas reais (tesourarias e gerentes de instituição) antes de qualquer claim comercial ou definição de ICP (Gestão continua hipótese).
4. Recusa de convite pela instituição como API própria (adiado desde 27/10).
5. ★ Nome do item de menu "Valor e savings": revisar contra a regra de savings com metodologia (guideline); avaliar apenas texto/rotulagem.
6. ~~Fundo da barra lateral em páginas longas~~ — verificado em 29/10: em rolagem real a barra é fixa e íntegra; era artefato de captura full-page. Fechado.

15. ★ `local.sh resume`: reiniciar o PostgREST depois que o banco fica saudável (caso C3) e, no modo `--check` do seed, não sugerir `demo:reset` (D1).
16. ★ Pluralização "1 dias" no prazo de liquidação (D5); rótulo "Pendente" × "Tarefa vencida" e datas de criação sem ano no painel do contrato (D6).
17. ★ Comparação de processo já contratado: diferenciar "proposta vencida" de proposta expirada antes da decisão (D2).
18. ★ Painel do contrato fora do histórico do navegador (Voltar sai da página) (D4).
19. ★ Seed: justificativa do Controller fala em "economia de MDR"; trocar por texto factual para não induzir claim (D3).
20. ★ Cenário sem proposta externa registrada pelo comprador (D7): avaliar incluí-la no seed canônico.

## P1-B — Demo hospedada M3 (trilha separada)

7. Recovery comprovado (export, restore do mesmo export, reconciliação), atribuição aprovada pelo owner e cutover autorizado; depois `hosted-parity` READY. Até lá Plano B permanece BLOCKED.
8. Acesso Vercel de leitura (logs/alias) para a plataforma — hoje NOT_RUN/403.

## Qualidade e ferramentas

9. ★ `scripts/demo/walkthrough.mjs` quebra (`window.__aranduCtx.data.rfqs` não existe mais): atualizar para localizar a solicitação pelo link, como o ensaio desta rodada fez.
10. ★ Smoke externo cross-browser (Firefox/WebKit) do domínio público, não só do CI.
11. `sandboxJavascript` a 99 % do orçamento: planejar a retirada do sandbox legado depois que a visita pública for a única porta de entrada (não acrescentar nada a ele).
12. ★ Seed com datas relativas: documentar no roteiro os prazos como "em N dias" ou fixar a data do setup no relatório.

## P2 — Production / M5 e expansão

13. Production segue bloqueada por `finance:env:check` até recovery/cutover; não relaxar a proteção.
14. Integrações bancárias/Open Finance e Product Packs só após piloto validado (§38).
