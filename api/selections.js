function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return send(res, 200, { ok: true, mode: 'demo', selections: [], message: 'Endpoint preparado. A persistência real será ligada ao Supabase na próxima etapa.' });
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    return send(res, 202, { ok: true, mode: 'demo', stored: false, selection: body, message: 'Seleção recebida pela API em modo demonstração.' });
  }

  return send(res, 405, { ok: false, error: 'Method not allowed.' });
}
