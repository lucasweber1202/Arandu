# Pacote final de merge — PR #11

Este documento resume o pacote final de melhorias antes do merge da experiência de plataforma, login e empresas.

## Objetivo da rodada

Transformar o PR em uma versão mais estável para merge, com menos risco de sobreposição, navegação confusa, funções duplicadas ou páginas públicas inconsistentes.

## Direção de produto aplicada

A navegação pública passa a seguir a lógica de galerias e marketplaces de arte mais maduros:

1. entrada por intenção;
2. descoberta de obras;
3. apoio curatorial;
4. área do comprador;
5. portal do artista;
6. frente de empresas/projetos.

## Melhorias consolidadas

### 1. Navegação e login

- O item `Entrar` passa a aparecer no header público.
- A página `login.html` permite escolher entre comprador, artista ou empresa.
- O redirecionamento pós-login segue a intenção do perfil:
  - comprador: `minha-conta.html`;
  - artista: `portal-artista.html`;
  - empresa: `empresas.html`.
- A página `cadastro.html` foi alinhada à mesma lógica de perfis.

### 2. Área pessoal do comprador

- `minha-conta.html` foi refeita para funcionar como área pessoal.
- A página concentra seleção, preferências, propostas e próximos passos.
- O painel continua usando a API de autenticação já existente.

### 3. Portal do artista

- Foi criada a página `portal-artista.html`.
- Inclui entrada para login como artista.
- Inclui formulário de reavaliação de preço.
- A proposta é permitir que o artista justifique revisão de preço por exposição, venda comparável, nova série, escassez ou reposicionamento.

### 4. Empresas

- `empresas.html` foi refeita para ser mais comercial e mais clara.
- Agora a página tem:
  - hero orientado a empresas e espaços;
  - programa corporativo;
  - aplicações por tipo de ambiente;
  - formulário de briefing rápido;
  - proposta de valor mais direta.

### 5. Hardening visual

- `css/arandu-interface-hardening.css` reduz risco de:
  - sobreposição;
  - texto claro em fundo claro;
  - cards comprimidos;
  - tags quebrando de forma ruim;
  - elementos flutuantes antigos interferindo na experiência.

### 6. Auditoria em runtime

- `js/arandu-interface-audit.js` atua como guarda leve da interface.
- Ele mantém o login visível, remove duplicidades de seções e limpa elementos flutuantes herdados.

### 7. Build global

- `vite.config.js` injeta o hardening visual e a auditoria em todas as páginas HTML.
- Isso reduz o risco de páginas antigas ficarem fora do padrão visual.

## Pontos que devem ser validados antes do merge

Rodar:

```bash
npm run check:quality
npm run check:all
npm run build
npm run preview -- --host 0.0.0.0
```

Revisar:

```text
/
login.html
cadastro.html
minha-conta.html
portal-artista.html
empresas.html
comprar-arte.html
obras.html
obra.html?id=estudo-de-solo-04
```

## Critérios para merge

Pode fazer merge se:

- `check:all` passar;
- `build` passar;
- o header exibir `Entrar` nas páginas públicas;
- a home não mostrar textos claros em cards claros;
- `login.html` mostrar comprador, artista e empresa;
- `empresas.html` mostrar briefing rápido;
- `portal-artista.html` mostrar formulário de reavaliação de preço;
- não houver duplicidade visual evidente de busca, login ou seções comerciais.

## Pendências pós-merge

- Conectar perfis persistentes em tabelas dedicadas no Supabase.
- Separar permissões por tipo de usuário.
- Evoluir o painel do artista com status real de obras.
- Evoluir a área de empresas com pipeline e propostas salvas.
