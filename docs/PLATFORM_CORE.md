# Núcleo B2B

`b2b_organizations` representa o tenant e `b2b_members` vincula um usuário autenticado a um papel. A criação da organização ocorre por RPC atômica. O administrador gera convite de uso único, guardado apenas como hash, vinculado ao e-mail da conta autenticada e válido por sete dias; não há endpoint público para assumir uma organização preexistente. `b2b_has_role` centraliza capacidades no banco. Leitura, criação e transição dependem de RLS, inclusive quando a API usa o token do usuário. A API não usa service role para dados B2B autenticados.

Tabelas: produtos, requisitos, documentos, mapeamentos, evidências, passaportes, cases CBAM, RFQs, convites, propostas, decisões, contratos e eventos. Chaves compostas vinculam entidade e organização; uma simples igualdade de IDs enviada pelo navegador não serve de autorização. Documentos e evidências nascem pendentes; transições de revisão passam por RPC restrita. Decisões e propostas são append-only nesta versão.

Capacidades iniciais: `admin` configura, revisa e abre fluxos; `compliance_manager` cadastra documentos, requisitos e produtos; `compliance_reviewer` revisa documentos/evidências; `procurement_manager` abre RFQs, convida e decide; `provider_user` responde convites da própria organização. `viewer` somente lê a própria organização. Os papéis não vêm de uma string manipulável no front.
