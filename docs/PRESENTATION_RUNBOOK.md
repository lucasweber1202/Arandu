# Roteiro de apresentação da Arandu

## Escopo e limites

O modo de apresentação demonstra a experiência do produto sem declarar prontidão de lançamento. O catálogo, as reservas, os indicadores operacionais e os certificados exibidos nesse modo são demonstrativos. Nenhum deles comprova estoque, preço, venda, autorização, procedência ou operação real.

O build aceita `ARANDU_PRESENTATION_MODE=true` somente fora de `VERCEL_ENV=production`. Em produção a configuração encerra o build com erro. Sem a variável, o produto mantém os gates normais e o catálogo público continua fail-closed.

## Preparação

1. Crie um Vercel Preview da branch com `ARANDU_PRESENTATION_MODE=true` apenas no ambiente Preview.
2. Confirme a faixa “Ambiente de apresentação” no topo.
3. Confirme que `robots.txt` bloqueia indexação e que o Preview não usa domínio canônico.
4. Abra `/demo.html` para iniciar o roteiro.

## Roteiro sugerido (8 minutos)

1. **Proposta de valor:** apresente a home e a mediação curatorial.
2. **Descoberta:** abra `/comprar-arte.html`, pesquise, filtre e altere a visualização.
3. **Seleção:** salve uma obra e mostre a seleção persistida apenas no navegador.
4. **Reserva:** preencha dados fictícios e envie. A confirmação deve declarar que nenhuma operação ou contato foi enviado.
5. **Coleções:** abra `/colecoes.html` e destaque que são composições demonstrativas.
6. **Procedência:** abra a verificação e consulte `ARD-2026-0001`; o resultado deve dizer “sem validade comercial”.
7. **Operação:** abra `/admin-preview.html`; explique que é uma leitura demonstrativa, sem acesso ou mutação administrativa.
8. **Encerramento:** apresente os gates externos ainda pendentes no relatório da PR.

## Verificações obrigatórias antes de cada sessão

- Não há chamadas bem-sucedidas de escrita para reservas, pagamentos ou certificados.
- Admin real continua redirecionando usuários sem sessão/MFA.
- O catálogo da API continua recusando dados que não estejam verificados.
- `npm run predeploy` continua falhando enquanto gates externos estiverem pendentes.
- Nenhuma tela ou fala descreve dados demonstrativos como evidência real.

## Limite operacional do e-mail

O cron nativo está agendado diariamente às 12:00 UTC porque o plano Vercel Hobby rejeita frequências maiores no deployment. Ele permanece desligado por `ARANDU_EMAIL_DISPATCH_ENABLED=false`. Antes de operação real, a frequência e o SLA precisam de decisão explícita (plano Vercel compatível ou disparador externo autenticado); não trate o cron diário como aprovação operacional.
