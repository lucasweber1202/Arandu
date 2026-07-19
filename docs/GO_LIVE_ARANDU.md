# Go-live Arandu — decisão de lançamento

O Arandu deve sair do preview fechado somente quando os gates abaixo estiverem comprovados. A existência das páginas ou o sucesso do build, isoladamente, não autoriza abertura pública.

## 1. Sequência obrigatória

1. Aplicar as migrations na ordem de `docs/supabase-migrations.json`.
2. Aprovar o catálogo real e executar seed.
3. Confirmar escrita, leitura e limpeza no Supabase publicado.
4. Fazer QA do website consolidado.
5. Configurar domínio, contato e ativos finais da marca.
6. Aprovar a política comercial e os responsáveis operacionais.
7. Rodar o piloto fechado.
8. Corrigir todos os bloqueadores críticos.
9. Rodar `npm run predeploy`.
10. Abrir produção e repetir os smoke tests no domínio final.

## 2. Deploy na Vercel e infraestrutura

- deploy protegido sem erros;
- domínio próprio em HTTPS;
- Supabase, service role e token administrativo configurados no servidor;
- autenticação com URLs finais de redirecionamento;
- probes de tabelas, views e RLS aprovados;
- catálogo com no mínimo 5 artistas e 20 obras reais;
- identidades, fontes, preços, disponibilidade e autorizações verificados;
- teste canário de escrita concluído;
- rate limit distribuído confirmado;
- contato LGPD, monitoramento de erros e alertas configurados;
- restauração de backup comprovada nos últimos 30 dias;
- `/api/health?probe=1` com `verifiedReady: true`.

## 3. Catálogo real

- pelo menos 5 artistas e 20 obras verificadas;
- consentimentos e autorizações de imagem registrados;
- preço, disponibilidade, procedência e textos revisados;
- `data/catalog-release.json` aprovado;
- seed e teste canário concluídos sem erro.

## 4. Marca e contato

- logo e favicon finais;
- paleta e aplicações revisadas;
- imagem social final;
- canonical, sitemap e robots apontando apenas para o domínio próprio;
- WhatsApp ou e-mail real testado;
- `ARANDU_BRAND_READY=true` somente após aprovação.

## 5. Operação comercial

Todos os itens de `data/commercial-policy.json` precisam estar definidos e aprovados:

- comissão;
- prazo da reserva;
- forma de pagamento;
- frete e seguro;
- cancelamento e devolução;
- avaria no transporte;
- certificado;
- modelo fiscal;
- responsável operacional.

Depois da aprovação, definir `ARANDU_COMMERCIAL_READY=true` e testar reserva e proposta ponta a ponta.

## 6. Piloto fechado

- deploy protegido pelo provedor;
- `ARANDU_PILOT_ENABLED=true`;
- `ARANDU_PILOT_APPROVED=false` enquanto a rodada estiver ativa;
- código de acesso e segredo fortes;
- coorte e roteiro de tarefas definidos;
- eventos mínimos chegando sem PII;
- feedback estruturado disponível no painel interno;
- zero bloqueadores críticos abertos.
- depois da rodada, `ARANDU_PILOT_APPROVED=true` e `ARANDU_PILOT_ENABLED=false` para a abertura pública.

O gate da aplicação controla a experiência da coorte; a proteção rígida do conteúdo continua sendo responsabilidade da infraestrutura de hospedagem.

## 7. Mídias sociais

- canais só devem apontar para o site depois da abertura pública;
- peças iniciais precisam usar obras e imagens autorizadas;
- links, biografia, imagem social e canal de atendimento devem ser conferidos no domínio final;
- a agenda editorial não substitui os gates técnicos, comerciais ou do piloto.

## 8. Testes finais

```bash
npm run check:all
npm run build
npm run check:catalog:release
npm run check:domain:release
npm run check:commercial:release
npm run check:pilot:release
npm run check:platform:release
npm run predeploy
```

No preview e novamente em produção:

- abrir `/status.html`;
- consultar `/api/health?probe=1`;
- testar busca, catálogo, artista e obra;
- testar cadastro, confirmação, login, seleção e logout;
- testar reserva e proposta;
- testar admin e painel do piloto;
- revisar teclado, mobile, desktop e mensagens de erro.

## 9. Decisão

Pode lançar quando `npm run predeploy` passar, o health check estiver verificado e o piloto não tiver bloqueadores críticos. Se um check de release falhar, a abertura permanece bloqueada até a evidência correspondente ser registrada.

Detalhes de implementação e responsabilidades: `docs/SPRINTS_2_A_5_IMPLEMENTACAO.md`, `docs/SPRINTS_6_A_12_IMPLEMENTACAO.md` e `docs/SETUP_PRODUCAO.md`.
