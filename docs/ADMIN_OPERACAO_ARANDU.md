# Admin e operação interna — Arandu

Este guia explica como usar o painel `admin.html` depois do deploy.

## 1. Pré-requisitos

Antes de usar o painel com dados reais, confirme:

- `SUPABASE_URL` configurada;
- `SUPABASE_ANON_KEY` configurada;
- `SUPABASE_SERVICE_ROLE_KEY` configurada;
- `ARANDU_ADMIN_TOKEN` configurado;
- `docs/supabase-schema.sql` aplicado no Supabase;
- `/api/health` sem pendências críticas.

## 2. Acesso

Abra:

```text
/admin.html
```

Informe o mesmo valor definido em `ARANDU_ADMIN_TOKEN`.

O token é salvo apenas no navegador usado para operar o painel.

## 3. Painéis disponíveis

O admin consulta estes módulos:

- submissões de artistas;
- leads;
- obras;
- artistas;
- reservas;
- certificados;
- briefs de empresas;
- propostas;
- tarefas.

## 4. O que fazer todo dia no pré-lançamento

1. Abrir `status.html`.
2. Confirmar se o ambiente está respondendo.
3. Abrir `admin.html`.
4. Ver submissões novas.
5. Ver leads ou reservas novas.
6. Atualizar status dos registros.
7. Criar tarefas para o que precisa de retorno.
8. Conferir `lancamento.html` para acompanhar critérios mínimos.

## 5. Fluxo de artista

1. Artista envia formulário em `para-artistas.html`.
2. Submissão aparece no painel de submissões.
3. Status inicial: `received`.
4. Triagem: `screening`.
5. Análise: `curatorial_review`.
6. Aprovado: `approved`.
7. Recusado: `declined`.
8. Arquivado: `archived`.

Depois da aprovação, cadastrar o artista em `artistas` e as obras em `obras`.

## 6. Fluxo de obra

1. Cadastrar artista.
2. Cadastrar obra vinculada ao `artist_id`.
3. Conferir técnica, dimensões, ano, preço, status e leitura curatorial.
4. Criar certificado.
5. Publicar quando houver imagem, autorização e preço revisado.

Status principais:

- `available` — disponível;
- `in_conversation` — em conversa;
- `reserved` — reservada;
- `sold` — vendida;
- `not_published` — não publicada;
- `archived` — arquivada.

## 7. Fluxo de reserva

1. Comprador clica em reservar obra.
2. Reserva exige nome e WhatsApp.
3. Registro aparece em `reservations` quando o Supabase estiver configurado.
4. Curadoria confirma disponibilidade, condição, frete e prazo.
5. Status pode avançar de `requested` para `confirmed`, `converted`, `cancelled` ou `expired`.

## 8. Fluxo de certificado

1. Criar código único.
2. Vincular à obra.
3. Vincular ao artista.
4. Manter como `draft` enquanto os dados não forem conferidos.
5. Usar `valid` apenas quando a ficha técnica estiver fechada.
6. Testar verificação pública em `verificar-certificado.html`.

## 9. Critério para operar fora do modo demo

O painel deixa de ser apenas preparação quando:

- Supabase está configurado;
- service role está configurada;
- token administrativo está configurado;
- as tabelas existem;
- os registros aparecem no admin;
- alterações de status persistem depois de recarregar a página.
