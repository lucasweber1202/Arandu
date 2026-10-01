// PDF mínimo (uma página, Helvetica) para os documentos fictícios da demonstração.
// Gera um arquivo válido, pequeno e legível em qualquer visualizador, sem
// dependência externa. O corpo sempre traz o aviso de documento fictício.

function escape(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Quebra o texto em linhas de até `width` caracteres. */
function wrap(text, width = 88) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if ((line + ' ' + word).trim().length > width) { lines.push(line); line = word; } else line = `${line} ${word}`.trim();
    }
    lines.push(line);
  }
  return lines;
}

export function demoPdf({ title, organization, body }) {
  const lines = [
    ['F2', 15, title],
    ['F1', 10, organization],
    ['F1', 10, ''],
    ...wrap(body).map((line) => ['F1', 10, line]),
    ['F1', 10, ''],
    ['F2', 9, 'DOCUMENTO FICTÍCIO — ambiente de demonstração do Arandu. Sem valor jurídico ou comercial.']
  ];
  let y = 790;
  const ops = ['BT'];
  for (const [font, size, text] of lines) {
    ops.push(`/${font} ${size} Tf 1 0 0 1 56 ${y} Tm (${escape(text)}) Tj`);
    y -= size + 6;
  }
  ops.push('ET');
  const stream = Buffer.from(ops.join('\n'), 'latin1');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    null
  ];
  const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const offsets = [];
  let length = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const part = object === null
      ? Buffer.concat([Buffer.from(`${index + 1} 0 obj\n<< /Length ${stream.length} >>\nstream\n`, 'latin1'), stream, Buffer.from('\nendstream\nendobj\n', 'latin1')])
      : Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, 'latin1');
    chunks.push(part);
    length += part.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)].join('');
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(chunks);
}
