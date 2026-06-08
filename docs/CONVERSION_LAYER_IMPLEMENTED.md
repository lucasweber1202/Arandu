# Camada de conversão e clareza — Arandu

Esta rodada implementou melhorias antes do backend para tornar a experiência mais clara, consultiva e comercial.

## O que entrou

- Navegação agrupada por intenção com botão `Explorar`.
- Barra inferior mobile: Início, Buscar, Obras, Seleção e Curadoria.
- Página `comece-aqui.html` com quatro caminhos principais.
- Página `como-comprar-na-arandu.html` explicando o fluxo de compra consultiva.
- Página `colecionadores-iniciantes.html` para formação de repertório.
- Página `prova-de-confianca.html` centralizando confiança, certificado, reserva e preço.
- Páginas de obra reforçadas com status, nota curatorial, procedência e CTAs.
- Leitura curatorial automática na `minha-selecao.html`.
- Páginas de prospecção: `prospeccao-artistas.html`, `proposta-empresas.html`, `media-kit.html`.
- Página `arandu-para-instagram.html` para transformar o site em pautas de redes sociais.
- Página `analytics-conceitual.html` com plano de métricas antes de integrar ferramenta real.
- Estilos complementares em `css/arandu-product.css`.

## O que testar

```bash
npm run check:all
npm run build
```

Páginas principais:

- `/comece-aqui.html`
- `/como-comprar-na-arandu.html`
- `/colecionadores-iniciantes.html`
- `/prova-de-confianca.html`
- `/minha-selecao.html`
- `/obra-estudo-de-solo-04.html`
- `/obra-sertao-silencioso.html`
- `/obra-equilibrio-suspenso.html`
- `/prospeccao-artistas.html`
- `/proposta-empresas.html`
- `/arandu-para-instagram.html`
- `/analytics-conceitual.html`

## Próxima etapa

Antes do backend pesado, revisar visualmente o mobile e validar se a navegação agrupada realmente reduz confusão. Depois disso, iniciar CRUD real de obras, artistas, submissões e leads.
