import { existsSync, readFileSync } from 'node:fs';

const docs = [
  'docs/OPERACAO_COMERCIAL_INDEX.md',
  'docs/GO_LIVE_ARANDU.md',
  'docs/PRIMEIROS_30_DIAS.md',
  'docs/PROSPECCAO_ARTISTAS_PLAYBOOK.md',
  'docs/CHECKLIST_PARCEIRA_ARTISTA.md',
  'docs/PROSPECCAO_COMPRADORES_EMPRESAS.md',
  'docs/FLUXO_COMPRA_RESERVA.md',
  'docs/OBJECOES_E_RESPOSTAS.md',
  'docs/CALENDARIO_CONTEUDO_30_DIAS.md',
  'docs/METRICAS_FUNIL_ARANDU.md',
  'docs/SEO_DOMINIO_CHECKLIST.md'
];

const requiredTerms = {
  'docs/OPERACAO_COMERCIAL_INDEX.md': ['Operação comercial', 'Ordem de leitura recomendada'],
  'docs/GO_LIVE_ARANDU.md': ['O que precisa estar pronto', 'Critério para dizer que o Arandu pode ser divulgado'],
  'docs/PRIMEIROS_30_DIAS.md': ['Semana 1', 'Semana 4'],
  'docs/PROSPECCAO_ARTISTAS_PLAYBOOK.md': ['Mensagem inicial curta', 'Cadência semanal'],
  'docs/CHECKLIST_PARCEIRA_ARTISTA.md': ['Condições comerciais', 'Sinais de alerta'],
  'docs/PROSPECCAO_COMPRADORES_EMPRESAS.md': ['Comprador individual', 'Mensagem para empresas'],
  'docs/FLUXO_COMPRA_RESERVA.md': ['Reserva de obra', 'pós-venda'],
  'docs/OBJECOES_E_RESPOSTAS.md': ['Compradores', 'Artistas'],
  'docs/CALENDARIO_CONTEUDO_30_DIAS.md': ['Pilares de conteúdo', 'Semana 4'],
  'docs/METRICAS_FUNIL_ARANDU.md': ['Funil geral', 'Meta dos primeiros 30 dias'],
  'docs/SEO_DOMINIO_CHECKLIST.md': ['Domínio', 'Sitemap']
};

const errors = [];
const indexContent = existsSync('docs/OPERACAO_COMERCIAL_INDEX.md')
  ? readFileSync('docs/OPERACAO_COMERCIAL_INDEX.md', 'utf8')
  : '';

for (const doc of docs) {
  if (!existsSync(doc)) {
    errors.push(`Documento ausente: ${doc}`);
    continue;
  }
  const content = readFileSync(doc, 'utf8');
  for (const term of requiredTerms[doc] || []) {
    if (!content.includes(term)) errors.push(`${doc} não contém: ${term}`);
  }
  if (doc !== 'docs/OPERACAO_COMERCIAL_INDEX.md' && indexContent && !indexContent.includes(doc)) {
    errors.push(`Índice comercial não referencia: ${doc}`);
  }
}

console.log('Arandu Commercial Readiness Check');
console.log(`Documentos verificados: ${docs.length}`);
console.log(`Erros: ${errors.length}`);

if (errors.length > 0) {
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
}
