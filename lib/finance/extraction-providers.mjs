// P1.4 — provedores de extração atrás de uma interface única.
//
// ExtractionProvider: { id, version, method, supports(mime), extract({ bytes, mime, schemaKey }) }
//   → { facts:[...], pages, warnings:[...], flags:[...] } ou lança ExtractionFailure(code).
// O domínio nunca conhece o fornecedor: trocar de leitor é registrar outro
// provedor. O leitor determinístico v1 não usa rede nem dependências: lê texto
// de PDF simples (sem OCR), planilhas XLSX e DOCX com o zlib do Node.
// Provedor de modelo (LLM/OCR externo) existe só como abstração: sem
// configuração explícita ele se declara `provider_not_configured` — nunca
// finge extração.
import { inflateRawSync, inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { SCHEMAS, matchField, normalizeValue, untrustedText, initialStatus } from './document-intelligence.mjs';

export class ExtractionFailure extends Error {
  constructor(code, detail = '') { super(detail || code); this.code = code; }
}

export const MAX_PROCESS_BYTES = 10 * 1024 * 1024;
const MAX_INFLATED = 24 * 1024 * 1024;
const MAX_LINES = 5000;

export const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

// ------------------------------------------------------------------ ZIP (XLSX/DOCX)
export function readZip(buf) {
  const b = Buffer.from(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i -= 1) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new ExtractionFailure('parse_error', 'zip sem diretório central');
  const count = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  if (count > 2000) throw new ExtractionFailure('too_large', 'zip com entradas demais');
  const files = new Map();
  let total = 0;
  for (let n = 0; n < count; n += 1) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50) throw new ExtractionFailure('parse_error', 'zip corrompido');
    const method = b.readUInt16LE(p + 10), csize = b.readUInt32LE(p + 20), usize = b.readUInt32LE(p + 24);
    const nlen = b.readUInt16LE(p + 28), xlen = b.readUInt16LE(p + 30), clen = b.readUInt16LE(p + 32), local = b.readUInt32LE(p + 42);
    const flags = b.readUInt16LE(p + 8);
    const name = b.subarray(p + 46, p + 46 + nlen).toString('utf8');
    p += 46 + nlen + xlen + clen;
    if (flags & 1) throw new ExtractionFailure('encrypted', 'zip cifrado');
    total += usize;
    if (usize > MAX_INFLATED || total > MAX_INFLATED) throw new ExtractionFailure('too_large', 'conteúdo descompactado acima do limite');
    if (local + 30 > b.length || b.readUInt32LE(local) !== 0x04034b50) throw new ExtractionFailure('parse_error', 'zip corrompido');
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const data = b.subarray(start, start + csize);
    files.set(name, () => (method === 0 ? data : method === 8 ? inflateRawSync(data, { maxOutputLength: MAX_INFLATED }) : (() => { throw new ExtractionFailure('unsupported_format', 'compressão zip não suportada'); })()));
  }
  return files;
}

const xmlText = (s) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&');

/** XLSX → linhas [{ cells:[...], locator:'Planilha1!A3' }] da primeira planilha. */
export function xlsxRows(bytes) {
  const zip = readZip(bytes);
  const shared = zip.has('xl/sharedStrings.xml') ? [...zip.get('xl/sharedStrings.xml')().toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlText(m[1])) : [];
  const sheetName = [...zip.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  if (!sheetName) throw new ExtractionFailure('unreadable', 'planilha sem abas');
  const xml = zip.get(sheetName)().toString('utf8');
  const rows = [];
  for (const r of xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const c of r[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
      const attrs = c[1] || c[3] || '';
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1] || '';
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const inner = c[2] || '';
      let value = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? (/<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1] ?? '');
      value = type === 's' ? shared[Number(value)] ?? '' : xmlText(value);
      cells.push({ ref, value });
    }
    rows.push({ cells: cells.map((x) => x.value), locator: `${sheetName.replace(/^xl\/worksheets\//, '').replace('.xml', '')}!${cells[0]?.ref || 'A'}${r[1]}` });
    if (rows.length > MAX_LINES) break;
  }
  return rows;
}

/** DOCX → linhas de texto por parágrafo. */
export function docxLines(bytes) {
  const zip = readZip(bytes);
  if (!zip.has('word/document.xml')) throw new ExtractionFailure('unreadable', 'documento sem corpo');
  const xml = zip.get('word/document.xml')().toString('utf8');
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((p, i) => ({ text: xmlText([...p[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('')), locator: `parágrafo ${i + 1}` }))
    .filter((x) => x.text.trim()).slice(0, MAX_LINES);
}

// ------------------------------------------------------------------ PDF (texto simples, sem OCR)
function pdfString(src, i) {
  // literal "( ... )" com escapes e parênteses aninhados
  let depth = 0, out = '';
  for (let j = i; j < src.length; j += 1) {
    const ch = src[j];
    if (ch === '\\') {
      const nx = src[j + 1];
      const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
      if (nx in map) { out += map[nx]; j += 1; continue; }
      const oct = /^[0-7]{1,3}/.exec(src.slice(j + 1, j + 4));
      if (oct) { out += String.fromCharCode(parseInt(oct[0], 8)); j += oct[0].length; continue; }
      continue;
    }
    if (ch === '(') { depth += 1; if (depth === 1) continue; }
    if (ch === ')') { depth -= 1; if (depth === 0) return [out, j + 1]; }
    out += ch;
  }
  return [out, src.length];
}
function contentText(src) {
  const lines = [];
  let line = '';
  let pending = [];
  const flush = () => { if (line.trim()) lines.push(line.trim()); line = ''; };
  for (let i = 0; i < src.length;) {
    const ch = src[i];
    if (ch === '(') { const [s, j] = pdfString(src, i); pending.push(s); i = j; continue; }
    if (ch === '<' && src[i + 1] !== '<') {
      const end = src.indexOf('>', i);
      const hex = src.slice(i + 1, end).replace(/\s/g, '');
      if (/^[0-9a-fA-F]*$/.test(hex)) pending.push(Buffer.from(hex.length % 2 ? hex + '0' : hex, 'hex').toString('latin1'));
      i = end + 1; continue;
    }
    const op = /^(Tj|TJ|T\*|Td|TD|Tm|ET|'|")(?![A-Za-z])/.exec(src.slice(i, i + 3));
    if (op) {
      if (op[1] === 'Tj' || op[1] === 'TJ') { line += pending.join(''); pending = []; }
      else if (op[1] === "'" || op[1] === '"') { flush(); line += pending.join(''); pending = []; }
      else { flush(); pending = []; }
      i += op[1].length; continue;
    }
    i += 1;
  }
  flush();
  return lines;
}
/** PDF → páginas [{ page, lines:[...] }]. Recusa PDF cifrado; texto ilegível vira `unreadable`. */
export function pdfPages(bytes) {
  const src = Buffer.from(bytes).toString('latin1');
  if (!src.startsWith('%PDF-')) throw new ExtractionFailure('parse_error', 'cabeçalho PDF ausente');
  if (/\/Encrypt\s/.test(src)) throw new ExtractionFailure('encrypted', 'PDF protegido');
  const pages = [];
  const re = /<<([\s\S]*?)>>\s*stream\r?\n/g;
  let m;
  let inflated = 0;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    const end = src.indexOf('endstream', start);
    if (end < 0) break;
    const dict = m[1];
    if (/\/Subtype\s*\/Image|\/Type\s*\/XObject/.test(dict)) continue;
    let raw = Buffer.from(src.slice(start, end).replace(/\r?\n$/, ''), 'latin1');
    if (/\/FlateDecode/.test(dict)) {
      try { raw = inflateSync(raw, { maxOutputLength: MAX_INFLATED }); } catch { continue; }
    } else if (/\/Filter/.test(dict)) continue;
    inflated += raw.length;
    if (inflated > MAX_INFLATED) throw new ExtractionFailure('too_large', 'PDF descompactado acima do limite');
    const text = raw.toString('latin1');
    if (!/\bBT\b/.test(text)) continue;
    const lines = contentText(text);
    if (lines.length) pages.push({ page: pages.length + 1, lines });
  }
  const all = pages.flatMap((p) => p.lines).join('');
  const printable = all.replace(/[^\x20-\x7e -ÿ]/g, '').length;
  if (!all.trim() || printable / all.length < 0.85) throw new ExtractionFailure('unreadable', 'sem texto extraível (digitalizado ou com fonte não padrão: precisa de OCR ou digitação)');
  return pages;
}

// ------------------------------------------------------------------ rótulo:valor → fatos
const SPLIT = /^\s*(.{2,80}?)\s*(?::|\||\t|\.{3,}|\s{3,}|—|–| - )\s*(.+?)\s*$/;
/**
 * Converte linhas (rótulo/valor) em fatos do schema. Só rótulos conhecidos
 * geram fato; o resto é ignorado (o documento não cria campos). Repetição com
 * valores diferentes → `ambiguous`. Campo do schema não encontrado →
 * `not_provided` explícito.
 */
export function factsFromPairs(schemaKey, pairs, { method, parserVersion, confidence = 0.9 }) {
  const schema = SCHEMAS[schemaKey];
  const found = new Map();
  const flags = new Set();
  for (const pair of pairs) {
    const field = matchField(schemaKey, pair.label);
    if (!field) continue;
    const raw = untrustedText(pair.value, 2000);
    raw.flags.forEach((x) => flags.add(x));
    const list = found.get(field.key) || [];
    list.push({ field, raw: raw.text, page: pair.page ?? null, locator: pair.locator || null, flags: raw.flags });
    found.set(field.key, list);
  }
  const facts = [];
  for (const field of schema.fields) {
    const hits = found.get(field.key) || [];
    const base = { field_key: field.key, method, parser_version: parserVersion, criticality: field.critical ? 'critical' : 'standard' };
    if (!hits.length) { facts.push({ ...base, value_state: 'not_provided', raw_value: null, normalized_value: null, confidence: null, page: null, locator: null, flags: [] }); continue; }
    const normalized = hits.map((h) => ({ h, n: normalizeValue(field, h.raw) }));
    const distinct = new Set(normalized.filter((x) => x.n.value_state === 'present').map((x) => JSON.stringify([x.n.normalized, x.n.unit || null, x.n.currency || null])));
    const first = normalized.find((x) => x.n.value_state === 'present') || normalized[0];
    const ambiguous = distinct.size > 1;
    const state = ambiguous ? 'ambiguous' : first.n.value_state;
    facts.push({ ...base, value_state: state, raw_value: ambiguous ? normalized.map((x) => x.h.raw).join(' | ').slice(0, 2000) : first.h.raw,
      normalized_value: state === 'present' ? first.n.normalized : null, unit: first.n.unit || null, currency: first.n.currency || null,
      confidence: ambiguous ? 0.5 : state === 'present' ? confidence : 0.3, page: first.h.page, locator: first.h.locator, flags: [...new Set(hits.flatMap((h) => h.flags))] });
  }
  for (const fact of facts) fact.status = initialStatus({ critical: fact.criticality === 'critical', value_state: fact.value_state, confidence: fact.confidence });
  return { facts, flags: [...flags] };
}

const linePairs = (lines, page) => lines.map((text, i) => SPLIT.exec(text)).map((m, i) => (m ? { label: m[1], value: m[2], page, locator: page ? `página ${page}, linha ${i + 1}` : `linha ${i + 1}` } : null)).filter(Boolean);

// ------------------------------------------------------------------ provedores
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const deterministicProvider = Object.freeze({
  id: 'deterministic_v1', version: 'deterministic-v1.0', method: 'deterministic_parser',
  supports: (mime) => ['application/pdf', XLSX, DOCX].includes(mime),
  extract({ bytes, mime, schemaKey }) {
    if (!SCHEMAS[schemaKey]) throw new ExtractionFailure('parse_error', 'schema desconhecido');
    if (bytes.length > MAX_PROCESS_BYTES) throw new ExtractionFailure('too_large');
    let pairs, pages = 1, text = [];
    if (mime === 'application/pdf') {
      const parsed = pdfPages(bytes);
      pages = parsed.length;
      text = parsed.flatMap((p) => p.lines);
      pairs = parsed.flatMap((p) => linePairs(p.lines, p.page));
    } else if (mime === XLSX) {
      const rows = xlsxRows(bytes);
      text = rows.map((r) => r.cells.join(' '));
      pairs = rows.filter((r) => r.cells.length >= 2 && String(r.cells[0]).trim()).map((r) => ({ label: r.cells[0], value: r.cells[1], page: null, locator: r.locator }));
    } else if (mime === DOCX) {
      const lines = docxLines(bytes);
      text = lines.map((l) => l.text);
      pairs = lines.map((l) => ({ m: SPLIT.exec(l.text), l })).filter((x) => x.m).map(({ m, l }) => ({ label: m[1], value: m[2], page: null, locator: l.locator }));
    } else throw new ExtractionFailure('unsupported_format', 'sem leitor determinístico para este formato (imagem exige OCR)');
    const { facts, flags: valueFlags } = factsFromPairs(schemaKey, pairs, { method: 'deterministic_parser', parserVersion: this.version });
    // O texto inteiro é varrido só para AVISAR o revisor; nada nele é obedecido.
    const flags = [...new Set([...valueFlags, ...text.flatMap((line) => untrustedText(line).flags)])];
    const warnings = [];
    if (!facts.some((x) => x.value_state === 'present')) warnings.push('no_known_labels');
    return { facts, pages, warnings, flags };
  }
});

/**
 * Provedor de modelo externo (LLM/OCR). Só uma abstração: exige
 * configuração explícita por ambiente E contrato de dados (minimização,
 * retenção zero, sem treino). Sem isso, recusa — nunca simula.
 */
export function createModelProvider({ env = process.env, client = null } = {}) {
  const configured = Boolean(env.ARANDU_EXTRACTION_MODEL_PROVIDER && env.ARANDU_EXTRACTION_DATA_AGREEMENT === 'signed' && client);
  return Object.freeze({
    id: 'model_external', version: configured ? String(env.ARANDU_EXTRACTION_MODEL_VERSION || 'unversioned') : 'not-configured', method: 'model', configured,
    supports: () => configured,
    async extract({ bytes, mime, schemaKey }) {
      if (!configured) throw new ExtractionFailure('provider_not_configured', 'provedor de modelo não configurado');
      // O cliente recebe o schema fechado e devolve SOMENTE pares campo/valor;
      // a saída passa pelas mesmas validações e estados de revisão.
      const result = await client.extract({ bytes, mime, fields: SCHEMAS[schemaKey].fields.map((x) => ({ key: x.key, type: x.type })) });
      const pairs = (result?.pairs || []).map((x) => ({ label: SCHEMAS[schemaKey].fields.find((y) => y.key === x.field)?.synonyms[0] || '', value: x.value, page: x.page ?? null, locator: x.locator || null }));
      const { facts, flags } = factsFromPairs(schemaKey, pairs, { method: 'model', parserVersion: this.version, confidence: 0.8 });
      return { facts, pages: result?.pages || null, warnings: [], flags };
    }
  });
}

export const PROVIDER_REGISTRY = Object.freeze({ deterministic_v1: deterministicProvider });
export function providerFor(id, opts = {}) {
  if (id === 'model_external') return createModelProvider(opts);
  return PROVIDER_REGISTRY[id] || null;
}
