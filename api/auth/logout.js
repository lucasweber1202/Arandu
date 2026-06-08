import { clearSessionCookie } from '../_supabase.js';

export default function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.end(JSON.stringify({ ok: true, message: 'Sessão encerrada.' }));
}
