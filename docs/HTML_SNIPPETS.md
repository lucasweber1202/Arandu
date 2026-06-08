# Snippets HTML — Arandu

Blocos reutilizáveis para manter consistência enquanto o projeto ainda está em HTML estático.

## Header padrão

```html
<header class="site-header">
  <div class="container header-inner">
    <a class="brand-logo" href="index.html">Arandu</a>
    <nav class="site-nav">
      <a href="encontrar-arte.html">Encontrar arte</a>
      <a href="obras.html">Obras</a>
      <a href="colecoes.html">Coleções</a>
      <a href="artistas.html">Artistas</a>
      <a href="contato.html">Contato</a>
    </nav>
    <a class="cta" href="contato.html">Falar com a curadoria</a>
  </div>
</header>
```

## Hero

```html
<section class="section">
  <div class="container">
    <p class="eyebrow">Etiqueta</p>
    <h1 class="title">Título principal.</h1>
    <p class="lead">Texto introdutório com proposta clara.</p>
  </div>
</section>
```

## Card de obra

```html
<article class="card" data-catalog-card data-price="4200" data-tags="pintura casa">
  <div class="thumb thumb-terra"></div>
  <span class="tag">Obra única · Certificada</span>
  <h3>Nome da obra</h3>
  <p>Artista · Técnica · Dimensões</p>
  <strong>R$ 4.200</strong>
  <a class="cta" href="obra.html">Ver obra</a>
</article>
```

## Card de artista

```html
<article class="card">
  <div class="thumb"></div>
  <p>Cidade / Estado · Linguagem</p>
  <h3>Nome do artista</h3>
  <p>Bio curta com pesquisa central.</p>
  <a class="cta" href="artista.html">Conhecer trajetória</a>
</article>
```

## Formulário

```html
<form class="form-card" data-form-type="contato">
  <h3>Título do formulário</h3>
  <input name="nome" placeholder="Nome" required />
  <input name="email" placeholder="Email" required />
  <textarea name="mensagem" placeholder="Mensagem"></textarea>
  <button type="submit">Enviar</button>
</form>
```

## CTA final

```html
<section class="section section-muted">
  <div class="container split">
    <div>
      <p class="eyebrow">Próximo passo</p>
      <h2 class="section-title">Receba orientação da curadoria.</h2>
    </div>
    <a class="cta" href="contato.html">Falar com a curadoria</a>
  </div>
</section>
```
