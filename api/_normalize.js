export function slugify(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `item-${Date.now()}`;
}

export async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function pick(data = {}, aliases = []) {
  for (const key of aliases) {
    if (data[key] !== undefined && data[key] !== null && String(data[key]).trim() !== '') return data[key];
  }
  return null;
}

export function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

export function toCents(value) {
  if (value === undefined || value === null || value === '') return null;
  if (Number.isInteger(value)) return value;
  const cleaned = String(value).replace(/R\$|\s/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

export function normalizeContactPayload(body = {}) {
  const data = body.data || body;
  return {
    name: pick(data, ['name', 'nome', 'nome_completo', 'fullName', 'full_name']),
    email: pick(data, ['email', 'e-mail']),
    whatsapp: pick(data, ['whatsapp', 'telefone', 'phone']),
    company: pick(data, ['company', 'empresa']),
    message: pick(data, ['message', 'mensagem']),
    source_page: body.page || body.source_page || data.source_page || null,
    payload: body
  };
}

export function hasContact(contact = {}) {
  return Boolean(contact.name || contact.email || contact.whatsapp);
}
