import { existsSync, readFileSync } from 'node:fs';

const requiredDocs = {
  'docs/OPERACAO_COMERCIAL_INDEX.md': ['GO_LIVE_ARANDU', 'PRIMEIROS_30_DIAS', 'PROSPECCAO_ARTISTAS_PLAYBOOK', 'METRICAS_FUNIL_ARANDU'],
  'docs/GO_LIVE_ARANDU.md': ['Deploy na Vercel', 'Catálogo real', 'Mídias sociais'],
  'docs/PRIMEIROS_30_DIAS.md': ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'],
  'docs/PROSPECCAO_ARTISTAS_PLAYBOOK.md': ['Mensagem inicial curta', 'Resposta se o artista perguntar sobre comissão', 'Sinais de alerta'],
  'docs/CHECKLIST_PARCEIRA_ARTISTA.md': ['Dados do artista', 'Condições comerciais', 'Logística'],
  'docs/PROSPECCAO_COMPRADORES_EMPRESAS.md': ['Comprador individual', 'Arquitetos', 'Mensagem para empresas'],
  'docs/FLUXO_COMPRA_RESERVA.md': ['Reserva de obra', 'Minha Seleção', 'Métricas'],
  'docs/OBJECOES_E_RESPOSTAS.md': ['Compradores', 'Artistas', 'Arquitetos e empresas'],
  'docs/CALENDARIO_CONTEUDO_30_DIAS.md': ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'],
  'docs/METRICAS_FUNIL_ARANDU.md': ['Funil geral', 'Eventos recomendados', 'Relatório semanal'],
  'docs/SEO_DOMINIO_CHECKLIST.md': ['Domínio', 'Sitemap', 'Open Graph']
};

const issues = [];

Object.entries(requiredDocs).forEach(([file, terms]) => {
  if (!existsSync(file)) {
    issues.push(`Documento comercial ausente: ${file}`);
    return;
  }
  const content = readFileSync(file, 'utf8');
  terms.forEach((term) => {
    if (!content.includes(term)) issues.push(`${file} não contém seção ou termo esperado: ${term}`);
  });
});

if (existsSync('README.md')) {
  const readme = readFileSync('README.md', 'utf8');
  Object.keys(requiredDocs).forEach((file) => {
    if (!readme.includes(file)) issues.push(`README não referencia ${file}`);
  });
}

console.log('Arandu Commercial Docs Check');
console.log(`Documentos verificados: ${Object.keys(requiredDocs).length}`);
console.log(`Erros: ${issues.length}`);

if (issues.length) {
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}
