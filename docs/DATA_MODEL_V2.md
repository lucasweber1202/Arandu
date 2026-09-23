# Modelo v2 e mapa de migração

| Arandu Arte | Núcleo B2B | Estratégia |
| --- | --- | --- |
| artist | organization / counterparty | Nova entidade; sem migração automática |
| artwork | product | Nova entidade; obra preservada |
| certificate | document + passport | Nova semântica e whitelist pública |
| artwork_event | event | Histórico antigo preservado |
| saved_selection | project / shortlist futuro | Nenhuma cópia automática |
| company_brief | case / RFQ | Escopos diferentes |
| reservation | invitation | Similaridade de workflow, sem conversão |
| proposal / proposal_item | quote / terms | Nova entidade financeira |
| crm_note / task | note / task futuros | Legado fica em Arte |
| media_asset | attachment futuro | Sem reutilização de storage público |

Migration `docs/supabase-b2b-platform.sql` adiciona 16 tabelas e RPCs. Chaves compostas guardam fronteiras entre tenants; relacionamentos polimórficos por ID sem FK foram evitados nos fluxos financeiros e de evidência. Ainda não há migração de dados de Arte para B2B porque nenhuma equivalência preserva adequadamente consentimento, finalidade e significado comercial.
