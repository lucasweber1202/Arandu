## Novo bloqueio de segurança — CI de 25/10

O run [40222765199](https://github.com/lucasweber1202/Arandu/actions/runs/40222765199), HEAD documental `03ee6be4257bda9a1e255757ddea19b284cf03c5`, falhou em validate/audit:ci (job 121258484577).
`zod@4.1.11` é dependência exata de `@vercel/cli-config@0.3.1`, via `@vercel/oidc@4.0.1` e `@vercel/functions@3.10.1`.
O advisory [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) classifica <4.6.6 como afetado por consumo excessivo de memória e indica 4.6.6 como corrigido.
Não houve demonstração de exploração na aplicação; os quatro findings npm são a cadeia transitiva, não quatro exploits demonstrados.
A aplicação importa waitUntil em lib/product-analytics-dispatch.mjs; alcance explorável dessa cadeia no runtime permanece NOT_PROVEN.

**P0-Release de segurança: BLOCKED.** Os verdes de 23/10 continuam históricos, mas não autorizam merge/freeze agora. Parecer final da PR #265 passa a BLOCKED para integração do release até correção/revalidação da cadeia compartilhada, embora sua lógica de preflight tenha passado na revisão isolada.
Não houve redução de audit-level, allowlist, remoção de check ou npm audit fix --force.

### Patch isolado para o owner do arquivo compartilhado

[Patch candidato](release-assurance-2026-10-25-zod.patch) fixa override somente sob @vercel/cli-config@0.3.1 para zod 4.6.6.
O arquivo package.json real **não foi alterado**, respeitando ownership compartilhado da missão §3.
Estado do patch: PROPOSED / NOT_VALIDATED_RUNTIME. git apply --check e validade JSON em cópia isolada PASS; dependências diretas preservadas.
O patch não inclui package-lock.json: registro npm inacessível neste executor; nenhum integrity foi inventado.
Não é correção concluída nem autorização para integrar só package.json. Owner precisa integrar o patch coordenadamente e gerar/revisar o lockfile com npm no registry oficial, sem atualização geral.

Em cópia isolada do SHA reconciliado, antes do freeze:
```sh
git apply --check docs/evidence/release-assurance-2026-10-25-zod.patch
git apply docs/evidence/release-assurance-2026-10-25-zod.patch
npm install --package-lock-only --ignore-scripts
npm ci --include=optional
npm ls zod @vercel/cli-config @vercel/oidc @vercel/functions
npm run audit:ci
npm run test:analytics
npm run check:all
npm run build
```
Conferir diff restrito ao override e resolução de zod, integridade do pacote, import waitUntil e validação da configuração Vercel antes de aceitar.
Se override não for compatível, escolher atualização upstream validada do SDK; não aceitar downgrade major sugerido automaticamente pelo audit sem revisão.
Exigir os quatro gates no novo HEAD. Rollback do patch e lockfile deve ser conjunto, mas restaura a dependência sinalizada: não é liberação segura.
Dependência externa exata: responsável por package.json/package-lock.json + executor com registry npm acessível.
