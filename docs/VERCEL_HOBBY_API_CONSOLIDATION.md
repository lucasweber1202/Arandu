# Consolidação de API para Vercel Hobby

A Vercel Hobby limita a quantidade de Serverless Functions por deployment. O projeto estava ultrapassando esse limite porque cada arquivo dentro de `api/` virava uma função separada.

## Solução aplicada

- A API foi consolidada em uma única função:

```text
api/health.js
```

- O `vercel.json` agora redireciona as rotas `/api/*` para essa função consolidada:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api/health" }
  ]
}
```

- Os arquivos de API duplicados foram removidos para reduzir o número de funções no deployment.

## Rotas mantidas via router consolidado

A função consolidada trata internamente:

```text
/api/health
/api/forms
/api/leads
/api/search
/api/public/catalog
/api/public/artists
/api/admin/artists
/api/admin/artworks
/api/admin/certificates
/api/admin/crm
/api/admin/operational
/api/admin/quality
/api/admin/export
```

## Observação

As rotas de autenticação foram removidas do deployment separado para respeitar o limite Hobby. A camada operacional principal, formulários, CRM, catálogo, busca e painéis administrativos continuam priorizadas no router consolidado.

## Como testar

```bash
git pull
npm install
npm run check:all
npm run build
```

Depois do deploy:

```text
/api/health
/api/forms
/api/search?q=fotografia
/api/admin/crm?type=leads
/api/admin/operational?resource=tasks
/api/admin/quality
```
