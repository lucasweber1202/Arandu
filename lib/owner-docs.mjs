/**
 * Manuais operacionais servidos atrás da sessão administrativa.
 *
 * O painel interno linkava `docs/SETUP_PRODUCAO.md`, `docs/GO_LIVE_ARANDU.md`
 * e outros oito arquivos. Nenhum deles é publicado: `docs/` não entra em
 * `dist/`, então os 17 links davam 404 em produção — justamente os roteiros
 * que o proprietário abriria na hora de operar.
 *
 * Publicá-los em `dist/` os tornaria públicos. Aqui eles são lidos do disco e
 * renderizados atrás do mesmo guarda das páginas internas.
 */
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Só nome de arquivo simples, sem barra nem `..`: o caminho nunca sai de docs/. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(md|sql|json|txt)$/;

export function isSafeDocName(name) {
  return SAFE_NAME.test(String(name || '')) && !String(name).includes('..');
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function inline(text) {
  // O texto já chega escapado; aqui só as marcas de ênfase viram elemento.
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, target) => {
      if (/^https?:\/\//.test(target)) return `<a href="${target}" rel="noreferrer">${label}</a>`;
      if (/^[A-Za-z0-9][A-Za-z0-9._-]*\.(md|sql|json|txt)$/.test(target)) return `<a href="/docs/${target}">${label}</a>`;
      if (/^docs\/[A-Za-z0-9][A-Za-z0-9._-]*\.(md|sql|json|txt)$/.test(target)) return `<a href="/${target}">${label}</a>`;
      return label;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function renderTableRow(line, cell) {
  const cells = line.replace(/^\||\|$/g, '').split('|').map((value) => inline(value.trim()));
  return `<tr>${cells.map((value) => `<${cell}>${value}</${cell}>`).join('')}</tr>`;
}

/** Subconjunto de Markdown suficiente para os runbooks: títulos, listas,
 *  tabelas, blocos de código, citações e parágrafos. */
export function renderMarkdown(source) {
  const lines = escapeHtml(source).split(/\r?\n/);
  const out = [];
  let inCode = false;
  let listType = '';
  let inTable = false;
  let paragraph = [];

  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = ''; } };
  const closeTable = () => { if (inTable) { out.push('</tbody></table>'); inTable = false; } };
  // Markdown quebra o parágrafo na linha em branco, não a cada quebra de
  // linha. Sem isto, um runbook com linhas de 80 colunas virava um <p> por
  // linha e ficava ilegível.
  const closeParagraph = () => { if (paragraph.length) { out.push(`<p>${inline(paragraph.join(' '))}</p>`); paragraph = []; } };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      closeParagraph(); closeList(); closeTable();
      out.push(inCode ? '</code></pre>' : '<pre><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) { out.push(line); continue; }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeParagraph(); closeList(); closeTable();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      continue;
    }
    if (/^\s*(\*\s*){3,}$/.test(line) || /^\s*-{3,}\s*$/.test(line)) {
      closeParagraph(); closeList(); closeTable();
      out.push('<hr />');
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const separator = /^\s*\|[\s:|-]+\|\s*$/.test(lines[index + 1] || '');
      if (!inTable && separator) {
        closeParagraph(); closeList();
        out.push(`<table><thead>${renderTableRow(line.trim(), 'th')}</thead><tbody>`);
        inTable = true;
        index += 1;
        continue;
      }
      if (inTable) { out.push(renderTableRow(line.trim(), 'td')); continue; }
    } else if (inTable) {
      closeParagraph(); closeTable();
    }
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || ordered) {
      const wanted = bullet ? 'ul' : 'ol';
      if (listType !== wanted) { closeParagraph(); closeList(); out.push(`<${wanted}>`); listType = wanted; }
      out.push(`<li>${inline((bullet || ordered)[1].trim())}</li>`);
      continue;
    }
    const quote = line.match(/^\s*&gt;\s?(.*)$/);
    if (quote) { closeParagraph(); closeList(); out.push(`<blockquote>${inline(quote[1])}</blockquote>`); continue; }
    if (!line.trim()) { closeParagraph(); closeList(); continue; }
    closeList();
    paragraph.push(line.trim());
  }
  if (inCode) out.push('</code></pre>');
  closeParagraph();
  closeList();
  closeTable();
  return out.join('\n');
}

export async function listDocs(root = process.cwd()) {
  const entries = await readdir(resolve(root, 'docs'), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isSafeDocName(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Índice usado quando o console pede `docs/README.md`, que não existe no
 *  repositório: em vez de 404, o proprietário recebe a lista do que existe. */
export async function renderDocIndex(root = process.cwd()) {
  const docs = await listDocs(root);
  const items = docs
    .map((name) => `<li><a href="/docs/${escapeHtml(name)}">${escapeHtml(name)}</a></li>`)
    .join('');
  return `<h1>Manuais de operação</h1><p>${docs.length} arquivos em <code>docs/</code>. Eles não são publicados no site: só abrem para uma sessão administrativa.</p><ul>${items}</ul>`;
}

export async function renderDoc(name, root = process.cwd()) {
  if (!isSafeDocName(name)) return null;
  let source;
  try {
    source = await readFile(resolve(root, 'docs', name), 'utf8');
  } catch {
    return null;
  }
  if (name.endsWith('.md')) return `${renderMarkdown(source)}`;
  return `<h1>${escapeHtml(name)}</h1><pre><code>${escapeHtml(source)}</code></pre>`;
}
