# Pivot B2B: primeiro corte

Base: `main` em `76c50bfe87414041843fd4c052ad85d51d0dd631` (Arandu Arte). Esta branch adiciona um núcleo B2B e duas experiências experimentais em `/b2b/`. Nenhuma migration antiga, página de arte ou tabela de arte é removida. A UX original permanece acessível. O PR não promove os gates de release da Arte a evidência B2B.

| Componente atual | Estado / dependência de arte | Reuso | Destino |
| --- | --- | --- | --- |
| Supabase Auth, cookie HttpOnly, proteção de origem e rate limit | Operacionais, agnósticos | Alto | KEEP |
| RLS, scripts de migration, teste PostgreSQL | Operacionais, tabelas antigas específicas | Alto | ADAPT com migration aditiva |
| RBAC/MFA de admin | Protege administração da Arte | Parcial | KEEP; papéis de organização separados |
| Certificados e histórico de obra | Com forte semântica de arte | Padrões de proveniência | ART_VERTICAL_ONLY; nova engine de documentos |
| Catálogo, artista, curadoria, seleção | Fortemente específicos | Padrões de UI | ART_VERTICAL_ONLY |
| Briefings, propostas, tarefas, CRM | Semântica mista | Ideias e jornadas | GENERALIZE incrementalmente; dados antigos intactos |
| API serverless e Vite multipágina | Infraestrutura comum | Alto | KEEP; novo domínio `b2b` |
| Gates de catálogo e comércio | Validam somente Arte | Baixo para B2B | DEPRECATE_LATER no pivot, preservar na Arte |

## Limites desta entrega

O MVP permite operar registros e fluxos com duas organizações autenticadas, desde que cada uma crie sua conta. Não há armazenamento seguro de bytes de documento nem upload de arquivo B2B: só metadados, hash declarado e revisão. O sistema não autentica o conteúdo do hash declarado. Convite usa o ID da organização fornecedora, sem e-mail ou link externo. Inclusão de outros membros na organização permanece fechada até existir convite verificado. QR é um endereço estável para o passaporte; a geração gráfica pode ser feita depois sem mudar o identificador.

## Rollback

Voltar a aplicação para o SHA acima restaura a UX de Arte. A migration B2B é aditiva; deixe as novas tabelas em repouso durante rollback e só as remova após export/backup e decisão explícita sobre retenção. Não execute `DROP CASCADE` em produção.
