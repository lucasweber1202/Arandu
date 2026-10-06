// Construtores de documentos sintéticos para testes e evals (sem dados reais).
import { deflateSync, deflateRawSync, crc32 } from 'node:zlib';

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
/** PDF mínimo válido com uma página por array de linhas; `compress` usa FlateDecode. */
export function makePdf(pages, { compress = true, encrypt = false } = {}) {
  const objs = [];
  const kids = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push(null); // pages, preenchido depois
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (const lines of pages) {
    const content = `BT /F1 11 Tf 50 780 Td 14 TL ${lines.map((l, i) => `${i ? 'T* ' : ''}(${esc(l)}) Tj`).join(' ')} ET`;
    const body = compress ? deflateSync(Buffer.from(content, 'latin1')) : Buffer.from(content, 'latin1');
    objs.push({ dict: `<< /Length ${body.length}${compress ? ' /Filter /FlateDecode' : ''} >>`, body });
    const contentRef = objs.length;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentRef} 0 R >>`);
    kids.push(objs.length);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const parts = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets = [];
  let pos = parts[0].length;
  objs.forEach((o, i) => {
    offsets.push(pos);
    const chunk = typeof o === 'string' ? Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, 'latin1')
      : Buffer.concat([Buffer.from(`${i + 1} 0 obj\n${o.dict}\nstream\n`, 'latin1'), o.body, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
    parts.push(chunk); pos += chunk.length;
  });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R${encrypt ? ' /Encrypt 99 0 R' : ''} >>\nstartxref\n${pos}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(parts);
}

/** ZIP com entradas comprimidas (deflate). */
export function makeZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const data = Buffer.from(text, 'utf8');
    const comp = deflateRawSync(data);
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, comp);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(Object.keys(entries).length, 8); eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}
const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** XLSX mínimo: linhas de células de texto (shared strings). */
export function makeXlsx(rows) {
  const strings = [];
  const idx = (s) => { const i = strings.indexOf(s); if (i >= 0) return i; strings.push(s); return strings.length - 1; };
  const sheet = rows.map((cells, r) => `<row r="${r + 1}">${cells.map((c, j) => `<c r="${String.fromCharCode(65 + j)}${r + 1}" t="s"><v>${idx(String(c))}</v></c>`).join('')}</row>`).join('');
  return makeZip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'xl/sharedStrings.xml': `<sst>${strings.map((s) => `<si><t>${x(s)}</t></si>`).join('')}</sst>`,
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${sheet}</sheetData></worksheet>`
  });
}
/** DOCX mínimo: um parágrafo por linha. */
export function makeDocx(lines) {
  return makeZip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'word/document.xml': `<w:document><w:body>${lines.map((l) => `<w:p><w:r><w:t>${x(l)}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`
  });
}
