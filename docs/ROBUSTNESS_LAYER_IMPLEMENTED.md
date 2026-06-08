# Camada de robustez operacional — Arandu

Esta etapa adiciona controle de qualidade, auditoria, exportação centralizada, tarefas globais e automações por trigger no banco.

## Novos arquivos de banco

```text
supabase/2026_06_robustness.sql
```

Inclui:

- view `v_artworks_full`;
- view `v_pipeline_summary`;
- view `v_quality_issues`;
- trigger para registrar mudança de status/preço de obra;
- trigger para sincronizar reserva com status da obra.

## Novas APIs

```text
api/admin/quality.js
api/admin/export.js
```

### `/api/admin/quality`

Retorna:

- índice operacional;
- métricas básicas;
- alertas de qualidade;
- inconsistências de acervo, certificado, imagem, reserva e tarefas.

### `/api/admin/export`

Exporta recursos em JSON ou CSV:

```text
/api/admin/export?resource=artworks&format=csv
/api/admin/export?resource=leads&format=csv
/api/admin/export?resource=quality&format=csv
```

Recursos suportados:

- artworks
- artists
- leads
- submissions
- briefs
- proposals
- reservations
- certificates
- tasks
- notes
- quality

## Novos painéis

```text
painel-tarefas.html
painel-qualidade.html
```

### Tarefas

Permite visualizar tarefas criadas na gaveta de detalhes de qualquer registro.

### Qualidade

Permite rodar auditoria operacional e ver problemas como:

- obra publicada sem artista;
- obra publicada sem certificado;
- obra publicada sem imagem;
- artista publicado sem bio curta;
- reserva ativa vencida;
- tarefa vencida.

## Painel central

`painel.html` agora inclui:

- Tarefas;
- Qualidade.

## Como aplicar

Depois das migrations anteriores, rode no Supabase:

```sql
-- conteúdo de:
supabase/2026_06_robustness.sql
```

## Como testar

```bash
git pull
npm install
npm run check:all
npm run build
```

Depois do deploy:

```text
/painel-qualidade.html
/painel-tarefas.html
/api/admin/quality
/api/admin/export?resource=artworks&format=csv
```

## Próximo nível

- geração de certificado em PDF;
- upload para Supabase Storage;
- proposta curatorial em PDF;
- renderização pública 100% a partir do banco;
- permissões por usuário administrativo.
