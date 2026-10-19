# Decisão de classificação antes da conversão

Procedimento de preservação, não autorização de descarte. Fontes atuais em
`../ops/consolidation/execution-2026-10-19/`; metadados somente, sem registros
pessoais. Snapshot de 19/10/2026 18:31 UTC. Inventário precisa ser renovado antes
da operação; mudanças invalidam a decisão dependente daquele inventário.

## Unidade de decisão e evidência

O responsável pelos dados registra, em canal privado, uma decisão por conjunto:
ref + schema/tabela + digest do inventário + origem/proveniência + finalidade +
classificação + vínculo com cliente + retenção/prazo/base da decisão + legal hold
e responsável consultado + destino privado/custódia + critério de descarte +
decisor/data/referência verificável. Conteúdo pessoal, contratos e pareceres
permanecem fora do repositório; aqui entra apenas referência sanitizada.

`unknown` não é `false`. Nome de tabela, zero Auth, idade do projeto ou aparência
de catálogo não provam ficção, ausência de cliente nem inexistência de hold.
Origem sintética exige provenance do gerador/seed e reconciliação do escopo.
Texto livre, JSON, links, nomes de arquivo e identificadores indiretos entram na
revisão; nenhuma leitura pessoal adicional é necessária para preparar a decisão.
Se a revisão de conteúdo for indispensável, o data owner define amostra mínima,
executor autorizado, minimização e acesso privado; não exportar para PR/chat.

## Conjuntos observados

Origem L = `igacnfjeuqhxcmfyepgj`, legado; P = `offgpyysgdhfemjlchod`, Pilot.
Para **todas** as linhas abaixo: vínculo com cliente, retenção e hold estão
NOT_PROVEN; decisor é o proprietário dos dados, com revisão jurídica quando
aplicável. Destino proposto é preservação cifrada em store privado aprovado,
separada de Demo. Critério de descarte comum: decisão humana por conjunto,
retenção cumprida, ausência de hold comprovada, recovery verificado e autorização
específica de exclusão. Nenhum desses critérios está satisfeito por esta tabela.

| Origem/conjunto | Quantidade | Tipo / potencial pessoal | Evidência necessária à decisão |
| --- | --- | --- | --- |
| L leads | 2 | name/email/whatsapp/company; message/payload livres; potencial cliente/contato | Proveniência, consentimento/finalidade, vínculo comercial e retenção |
| L reservations | 1 | user_id/lead_id/name/whatsapp; notes/payload; vínculo possível com lead/obra | Revisão de dependências e obrigação comercial, além de contato |
| L certificates | 5 | issued_to/issued_email; notes/payload; destinatário e direitos possíveis | Titularidade, necessidade de conservar prova/documento, dependências |
| L artists | 12 | name/legal_name/redes/portfolio, biografia e payload; pessoa identificável possível | Origem/licença, autorização/publicação, titularidade e direitos |
| L artworks | 22 | artist_id, imagens/URLs, textos, logistics/payload; vínculo indireto possível | Licença/direitos, vínculos com artista/certificado/reserva, payload |
| L demais 11 tabelas | 0 no snapshot | Ausência de linhas; schema/configuração ainda fazem parte da preservação | Novo inventário e confirmação de ausência de consumidores/obrigações |
| P api_rate_limits | 2 | Identificadores e informações operacionais potencialmente pessoais | Origem de chaves, finalidade e janela de retenção |
| P fin_job_runs | 4 | Logs operacionais; payload/identificadores não classificados | Metadados dos campos, retenção de auditoria e minimização |
| P curated_collections / catalog_releases | 4 / 1 | Conteúdo editorial/proveniência não comprovados | Fonte, titularidade/licença, dependências de catálogo |
| P fin_settings | 3 | Um marker schema_version observado; demais valores não consultados | Owner classifica configuração, custódia separada se houver material sensível |
| P demais tabelas | 0 | Nenhuma linha financeira observada; isso não classifica os 14 registros | Inventário renovado e confirmação do escopo |
| P/L Auth usuários/sessões/MFA e Storage objetos | 0 | Ausência de conteúdo no snapshot; não é ausência de configuração externa | Novo inventário, Auth/OAuth/chaves/configuração e bucket privado do Pilot |

As 42 linhas legadas são mantidas como potencialmente identificáveis ou de
origem desconhecida; oito contatos/destinatários são um sinal parcial, não o
universo de PII. Não há prova de dados hospedados fictícios nesta rodada.

## Como fechar a pendência sem fabricar aprovação

1. Renovar contagens exatas e verificar dependências, inclusive FK, consumidores,
   Auth, binários e configuração. Vincular as decisões ao inventário específico.
2. Preencher todas as dimensões acima; desconhecido bloqueia descarte/conversão.
   Registrar retenção e hold explicitamente, inclusive quando a decisão for
   preservar permanentemente. Decisão de preservação não autoriza reset.
3. Obter autorização de export e destino/custódia. Executar preservação e restore
   do mesmo conjunto; reconciliation MATCH técnico não resolve obrigação legal.
4. Resolver cada conjunto com dados pessoais/cliente: não copiar para Demo.
   Enquanto houver dado necessário, preservar a origem e submeter alternativa
   ao proprietário; não preencher personal_data_rows/customer_rows com zero.
5. Só produzir evidência aceita por consolidation:check quando a condição factual
   correspondente estiver comprovada. Um formulário assinado não altera as
   contagens ou a topologia; autorização de cutover é outra decisão.
