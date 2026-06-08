# Limitações conhecidas — Arandu

Este documento evita confusão entre o MVP estático e uma plataforma completa.

## Sem backend

O projeto atual não possui servidor próprio, API ou banco de dados em produção.

## Formulários locais

`js/forms.js` salva dados localmente no navegador. Ele não envia e-mail, não grava no servidor e não cria lead real fora do dispositivo do usuário.

## Minha Seleção local

A seleção de obras usa `localStorage`. Se o usuário trocar de navegador ou limpar dados, a seleção desaparece.

## Certificado demonstrativo

`verificar-certificado.html` simula a verificação do código `ARD-2026-0001`. A consulta real dependerá da tabela `certificates` no banco.

## Painel administrativo mock

As páginas `admin-preview.html` e `painel-*.html` são protótipos visuais. Não alteram dados, não listam leads reais e não exigem login.

## Sem pagamento

Não há checkout, gateway, reserva real, carrinho, boleto, cartão ou PIX.

## Sem controle real de disponibilidade

Os status de obra são editoriais. Não há bloqueio automático para obra reservada ou vendida.

## Sem upload de imagens

O MVP usa placeholders visuais. Imagens reais devem ser adicionadas posteriormente em `assets/obras`, `assets/artistas` e `assets/social`.

## Políticas precisam de revisão

Privacidade, termos, entrega, devolução e política comercial são versões iniciais e devem ser revisadas juridicamente antes de operação real.
