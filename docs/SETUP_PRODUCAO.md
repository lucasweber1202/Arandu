# Setup de produção — Arandu

## 1. Preparar e validar o código

```bash
npm install
npm run check:all
npm run build
npm run release:status
```

Os checks normais validam código e contratos. Os checks `*:release` validam decisões e dependências externas; por isso devem falhar enquanto os gates não estiverem concluídos.
O comando `release:status` gera `reports/release-status.json` e não libera produção por conta própria.

## 2. Configurar o ambiente de preview

Use um preview protegido e configure:

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ARANDU_ADMIN_TOKEN=

ARANDU_SITE_URL=https://dominio-proprio.example
ARANDU_WHATSAPP_NUMBER=
ARANDU_CONTACT_EMAIL=
ARANDU_BRAND_READY=false
ARANDU_COMMERCIAL_READY=false

ARANDU_PILOT_ENABLED=true
ARANDU_PILOT_APPROVED=false
ARANDU_PILOT_ACCESS_CODE=
ARANDU_PILOT_SECRET=
```

Requisitos:

- `ARANDU_SITE_URL`: HTTPS e domínio próprio, sem `*.vercel.app` ou `localhost`;
- ao menos um canal real de contato;
- código do piloto com pelo menos 10 caracteres;
- segredo do piloto com pelo menos 32 caracteres;
- chaves Supabase e token administrativo somente no ambiente servidor.

Não coloque segredos em arquivos públicos, HTML ou JavaScript do navegador.

Antes de copiar valores para a Vercel, valide formato e força sem imprimir os segredos:

```bash
npm run check:env
```

## 3. Aplicar migrations do Supabase

A ordem fonte de verdade está em `docs/supabase-migrations.json`.

Para gerar um único SQL auditável, com SHA-256 de cada etapa:

```bash
npm run migrations:bundle
npm run migrations:bundle -- --flow=existingDatabase
```

Os arquivos são criados em `reports/`. Confirme o fluxo escolhido com o estado real do banco antes de executar no SQL Editor ou por conexão administrativa.

Instalação nova:

1. `docs/supabase-schema.sql`
2. `docs/supabase-production.sql`
3. `docs/supabase-sprint1-auth-ownership.sql`
4. `docs/supabase-sprint2-catalog-readiness.sql`
5. `docs/arandu-mvp-collections.sql`
6. `docs/supabase-sprint5-pilot.sql`
7. `docs/supabase-sprint6-12-platform.sql`

Banco existente:

1. `docs/supabase-sprint1-auth-ownership.sql`
2. `docs/supabase-production.sql`
3. `docs/supabase-sprint2-catalog-readiness.sql`
4. `docs/arandu-mvp-collections.sql`
5. `docs/supabase-sprint5-pilot.sql`
6. `docs/supabase-sprint6-12-platform.sql`

O Sprint 2 precisa ser aplicado depois de `supabase-production.sql`, porque substitui as policies permissivas do catálogo. As coleções dependem das views públicas seguras do Sprint 2. O Sprint 5 cria as tabelas privadas do piloto. A migration dos Sprints 6–12 adiciona rate limit distribuído, workflow editorial, auditoria, LGPD, idempotência e conversão consentida.

```bash
npm run check:migrations
```

No Supabase Auth, habilite email/senha e configure as URLs reais de redirecionamento.

## 4. Preparar o catálogo real

1. Substitua os fixtures por registros comprovados.
2. Preencha identidade, origem, consentimento de publicação e datas de verificação dos artistas.
3. Preencha autorização da imagem, origem, preço, disponibilidade e data de verificação das obras.
4. Garanta pelo menos 5 artistas e 20 obras elegíveis.
5. Atualize `data/catalog-release.json` para `datasetKind: "real"` e `verifiedReady: true` somente após revisão humana.
6. Rode:

```bash
npm run check:catalog:release
npm run seed:supabase:dry
npm run seed:supabase
```

O catálogo público retorna indisponibilidade controlada até que o gate real esteja aprovado; ele não reutiliza fixtures como se fossem produção.

O importador de `catalogo-intake.html` usa `data/catalog-intake-template.csv`. Linhas básicas podem ser enviadas para revisão, mas a interface destaca separadamente os campos que ainda impedem elegibilidade no catálogo real.

## 5. Confirmar escrita real

Depois do deploy protegido:

```bash
ARANDU_WRITE_TEST_URL=https://preview-protegido.example npm run check:supabase:write
```

O teste cria, relê e remove um registro canário pela API e atualiza `write_verified_at`. Sem essa confirmação, `v_catalog_readiness.verified_ready` permanece falso.

## 6. Aprovar marca e operação comercial

Marca:

- logo, favicon, imagem social e paleta final revisados;
- domínio e contato reais funcionando;
- só então definir `ARANDU_BRAND_READY=true`.

Comercial:

- preencher e aprovar todos os itens de `data/commercial-policy.json`;
- usar `docs/APROVACAO_COMERCIAL.md` para registrar a decisão completa;
- revisar reserva, pagamento, comissão, frete, seguro, avaria, cancelamento, devolução, certificado e responsável operacional;
- só então definir `ARANDU_COMMERCIAL_READY=true`.

Reservas e propostas permanecem bloqueadas enquanto o gate comercial estiver falso.

```bash
npm run check:domain:release
npm run check:commercial:release
```

Além dos flags, preencha `ops/release-evidence.json`. O arquivo não é copiado para o site público e registra somente referências não sensíveis e datas de comprovação; nunca coloque chaves, tokens, contatos pessoais ou contratos completos nele.

## 7. Executar o piloto fechado

1. Mantenha o deploy protegido no provedor.
2. Defina `ARANDU_PILOT_ENABLED=true`, código e segredo fortes.
3. Compartilhe apenas `/piloto.html` com a coorte selecionada.
4. Acompanhe `/painel-piloto.html` com token administrativo.
5. Registre feedback; não colete texto digitado, e-mail ou telefone na telemetria de comportamento.
6. Respeite `Do Not Track` e revise bloqueadores críticos antes de abrir o site.
7. Após resolver os bloqueadores, defina `ARANDU_PILOT_APPROVED=true` e `ARANDU_PILOT_ENABLED=false` para a abertura pública.

```bash
npm run check:pilot:release
```

O check de release exige a conclusão aprovada do piloto. Código e segredo só são obrigatórios enquanto o gate da coorte estiver habilitado.

## 8. Testar os fluxos ponta a ponta

Verifique no preview:

- `/status.html` e `/api/health?probe=1`;
- catálogo e artistas somente com release verificado;
- cadastro, confirmação de e-mail, login e logout;
- seleção sincronizada entre sessões;
- reserva e proposta somente após aprovação comercial;
- admin e métricas do piloto com token;
- sitemap, robots, canonical e redirecionamentos no domínio próprio;
- navegação por teclado, celular e desktop.

Para conferir páginas publicadas:

```bash
npm run check:live -- https://preview-protegido.example
```

## 9. Autorizar lançamento

Rode a barreira final:

```bash
npm run predeploy
```

O comando só deve passar quando ambiente, evidências, catálogo, domínio, comercial, piloto e plataforma estiverem realmente prontos. Em seguida, faça o deploy de produção, rode `npm run check:live:prod` e repita os fluxos críticos no domínio final.
