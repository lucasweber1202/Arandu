# Suporte operacional do piloto

Para quem estiver de plantão durante o piloto. Cada item tem o sintoma, a
causa provável e o que fazer **pelo produto**.

> Alterar dados direto no banco não é solução de suporte. Ele aparece aqui
> apenas onde não existe caminho pelo produto, e sempre marcado como exceção.

---

## "Cliquei no link do convite e não acontece nada"

**Causa provável:** o link foi quebrado ao ser copiado. O token tem 64
caracteres e viaja depois do `#`; alguns clientes de e-mail cortam a parte
final ou removem o fragmento.

**O que fazer:** peça para abrir `/provider/invite.html` e colar o token no
campo. Se o token tiver menos de 64 caracteres, ele foi truncado — gere um
convite novo.

## "O convite diz que não é válido"

O produto dá a **mesma** resposta para convite inexistente, expirado, já usado
e revogado. Isso é intencional: distinguir permitiria descobrir tokens por
tentativa.

**Como saber qual é o caso:** consulte o estado do convite na RFQ, pelo portal
da empresa compradora. Ali aparece `invited`, `accepted`, `declined`, `revoked`
ou `expired`.

**Resolução:** se expirou ou já foi usado, a empresa gera um convite novo para
o mesmo provedor. Convites são baratos; reaproveitar um token não é possível
por construção.

## "Criei minha conta mas não consigo criar a organização"

**Causa provável:** a allowlist do piloto está ativa e este e-mail não está
nela. A mensagem na tela diz isso.

**O que fazer:** confirme o e-mail com a pessoa e peça ao responsável do Arandu
para incluí-lo. Entrar na allowlist é uma linha em `fin_pilot_allowlist`,
feita por quem administra o piloto — não pelo suporte, e não pelo usuário.

## "O provedor errado foi convidado"

**O que fazer:** a empresa revoga o convite pelo portal e convida o provedor
certo. Se o provedor errado já aceitou, a proposta dele existe mas **não
precisa ser escolhida** — a decisão é da empresa, e propostas não escolhidas
permanecem registradas, o que é o comportamento correto para auditoria.

## "A empresa preencheu a RFQ errada"

**Enquanto a RFQ está em rascunho ou aberta:** a demanda pode ser editada pelo
portal. A edição com a RFQ já aberta deixa evento próprio na trilha, porque ela
muda o enunciado debaixo de provedores que já leram os requisitos.

**Depois de coletar propostas:** não edite. Cancele a RFQ e crie outra. Mudar a
pergunta depois das respostas invalida a comparação.

## "O provedor enviou a proposta errada"

**O que fazer:** ele envia uma versão nova pelo próprio portal. A anterior
permanece no histórico — isso não é um problema a esconder, é o registro de que
houve revisão. Se a RFQ já saiu de `open`/`collecting`, ele não consegue mais
revisar; nesse caso a empresa decide se volta a RFQ para `collecting`.

## "A comparação está mostrando 'Estimativa não calculável'"

**Não é erro.** O Arandu recusa projetar quando a matemática não vale: taxa
pós-fixada, amortização SAC ou bullet, carência, ou fatia declarada sem a taxa
correspondente. A tela diz qual é o motivo.

**O que fazer:** se a empresa quiser comparar custo total, peça ao provedor que
informe o CET, que é exibido como dado declarado dele.

## "Uma proposta com nota alta parece pior que outra"

A pontuação é calculada sobre o peso que **aquela** proposta respondeu. Uma
proposta que respondeu pouco pode ter nota alta sobre esse pouco. Por isso a
tela mostra a cobertura de cada uma e separa as de cobertura baixa.

**O que fazer:** mostre a linha "Cobertura da pontuação" à empresa. Se ela
quiser comparar em pé de igualdade, peça aos provedores os campos faltantes.

## "Não consigo entrar na conta"

Autenticação é a mesma do restante do Arandu (Supabase Auth). Siga o
procedimento padrão de conta. O procurement financeiro não tem login próprio.

## "O mesmo provedor aparece duas vezes"

Cada empresa mantém o **próprio** cadastro de provedores. Duas linhas para o
mesmo banco dentro da *mesma* empresa são duplicata de cadastro: arquive uma
pelo portal. Entre empresas diferentes, não é duplicata — é relação comercial
distinta, com contatos e notas próprias. Ver
`FINANCIAL_PROVIDER_CANONICALIZATION.md`.

## "O contrato foi registrado errado"

Contrato e decisão são registros de auditoria: eles não são editáveis pelo
produto, de propósito. Registrar um contrato errado e corrigi-lo em silêncio
destruiria o valor do registro.

**O que fazer:** registre a correção como fato novo — encerre o contrato
(`terminated`) e registre o correto. A trilha mostra os dois, que é o que
aconteceu de verdade.

**Exceção:** se o erro for do piloto e não da empresa (por exemplo, um teste
nosso que virou registro), remova pelo banco, **anote no relatório do piloto** e
trate como incidente de operação, não como rotina.

## "Os e-mails não estão chegando"

Esperado enquanto o envio estiver desligado (`fin_settings.email_enabled =
false`). Os convites são entregues manualmente pela empresa. Ver
`FINANCIAL_EMAIL_TEMPLATES.md`.

---

## Rollback operacional

| Situação | Ação |
| --- | --- |
| Bug de interface | corrigir e publicar; nada no banco muda |
| Migration com problema | `docs/rollback/supabase-financial-procurement.rollback.sql` — **exporte antes**: ele remove as tabelas `fin_*` e os dados nelas |
| Piloto interrompido | desligue o acesso removendo os e-mails da allowlist; os dados permanecem |
| Dado de piloto precisa sair | exporte, depois remova; registre o que foi removido e por quê |

Nenhum rollback do procurement financeiro toca a vertical de Arte.
