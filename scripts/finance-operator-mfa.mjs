#!/usr/bin/env node
// Cadastro do segundo fator (TOTP) de um operador da plataforma.
//
// O console operacional (/finance/ops.html) exige o papel de plataforma
// finance_ops e sessão `aal2`; o console pede o código TOTP, mas só depois de
// existir um fator verificado. Esta ferramenta cadastra esse fator uma vez, no
// terminal do próprio operador, com a chave pública (anon) do Supabase.
//
//   SUPABASE_URL=https://<projeto>.supabase.co SUPABASE_ANON_KEY=<anon> \
//     npm run finance:operator:mfa
//
// Pede e-mail e senha no terminal (nunca por argumento, para não ficar no
// histórico do shell), cadastra o fator, mostra o segredo para o aplicativo
// autenticador e confirma com o primeiro código de 6 dígitos. Não usa o
// service role e não grava nada em disco.
import crypto from 'node:crypto';
import readline from 'node:readline';

function authBase(url) {
  const base = String(url || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//.test(base)) throw new Error('SUPABASE_URL precisa ser https://.');
  return `${base}/auth/v1`;
}

async function auth(url, anonKey, path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${authBase(url)}/${path}`, {
    method,
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.msg || data.error_description || data.message || `Auth ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function passwordSession({ url, anonKey, email, password }) {
  return auth(url, anonKey, 'token?grant_type=password', { method: 'POST', body: { email, password } });
}

/** Cadastra um fator TOTP ainda não verificado e devolve id, segredo e URI. */
export async function enrollTotp({ url, anonKey, accessToken, friendlyName = 'Arandu operador' }) {
  const data = await auth(url, anonKey, 'factors', {
    method: 'POST', token: accessToken, body: { factor_type: 'totp', friendly_name: friendlyName }
  });
  return { factorId: data.id, secret: data.totp?.secret, uri: data.totp?.uri };
}

/** Desafia e verifica o fator; devolve a sessão `aal2` emitida pelo Supabase. */
export async function verifyTotp({ url, anonKey, accessToken, factorId, code }) {
  const challenge = await auth(url, anonKey, `factors/${encodeURIComponent(factorId)}/challenge`, { method: 'POST', token: accessToken, body: {} });
  return auth(url, anonKey, `factors/${encodeURIComponent(factorId)}/verify`, {
    method: 'POST', token: accessToken, body: { challenge_id: challenge.id, code: String(code).trim() }
  });
}

/** RFC 6238 (SHA-1, 30 s, 6 dígitos) — o mesmo que os aplicativos autenticadores usam. */
export function totpCode(base32Secret, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of String(base32Secret).replace(/=+$/, '').toUpperCase()) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error('Segredo TOTP inválido.');
    bits += value.toString(2).padStart(5, '0');
  }
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(binary).padStart(6, '0');
}

export function jwtAal(token) {
  try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')).aal || null; } catch { return null; }
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (text) => { if (text.includes(question)) rl.output.write(text); };
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer.trim()); });
  });
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error('Defina SUPABASE_URL e SUPABASE_ANON_KEY (chave pública). O service role não é usado aqui.');
    process.exit(1);
  }
  const email = await ask('E-mail do operador: ');
  const password = await ask('Senha: ', { hidden: true });
  const session = await passwordSession({ url, anonKey, email, password });
  const enrolled = await enrollTotp({ url, anonKey, accessToken: session.access_token });
  console.log('\nCadastre no aplicativo autenticador (Google Authenticator, 1Password, Authy…):');
  console.log(`  Segredo: ${enrolled.secret}`);
  console.log(`  URI:     ${enrolled.uri}`);
  console.log('Este segredo não será mostrado de novo. Não o envie por chat nem e-mail.\n');
  const code = await ask('Código de 6 dígitos mostrado pelo aplicativo: ');
  const verified = await verifyTotp({ url, anonKey, accessToken: session.access_token, factorId: enrolled.factorId, code });
  if (jwtAal(verified.access_token) !== 'aal2') throw new Error('O Supabase não confirmou o segundo fator.');
  console.log('Segundo fator confirmado (aal2). Entre no Arandu, abra /finance/ops.html e confirme o código do aplicativo.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(`Falhou: ${error.message}`); process.exit(1); });
}
