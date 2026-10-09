import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { RECOVERY_REFS } from './pilot-backup-preflight.mjs';

const names = ['database.dump.age', 'roles.sql.age', 'manifest.json'];
// Capability URLs are secrets. Approval is an owner's protected-Environment
// attestation, not discovery of a bucket or proof of its lifecycle policy.
export function approvedDestination(raw, projectRef, sha) {
  let d;
  try { d = JSON.parse(raw); } catch { throw new Error('Destino aprovado ausente.'); }
  if (!RECOVERY_REFS.includes(projectRef) || d.project_ref !== projectRef || d.reviewed_sha !== sha || !/^[a-f0-9]{40}$/.test(sha || '') ||
      d.approved !== true || d.private !== true || d.key_recovery_verified !== true ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(d.id || '') || !Number.isSafeInteger(d.retention_days) || d.retention_days < 1 ||
      !/^[a-zA-Z0-9/_-]{1,120}$/.test(d.approval_ref || '') || !/^[a-zA-Z0-9 _-]{1,80}$/.test(d.jurisdiction || '') || !d.prefix || !/^\/[a-zA-Z0-9/_-]+\/$/.test(d.prefix) ||
      !/^[a-z0-9.-]+\.s3\.[a-z0-9-]+\.amazonaws\.com$/.test(d.hostname || '')) throw new Error('Aprovação/identidade do destino inválida.');
  for (const name of names) for (const method of ['put', 'get']) {
    let u;
    try { u = new URL(d.objects?.[name]?.[method]); } catch { throw new Error('Capacidade de transferência ausente.'); }
    if (u.protocol !== 'https:' || u.hostname !== d.hostname || u.port || u.username || u.password || u.hash ||
        u.pathname !== d.prefix + name || u.searchParams.get('X-Amz-Algorithm') !== 'AWS4-HMAC-SHA256' ||
        !u.searchParams.get('X-Amz-Signature') || !u.searchParams.get('X-Amz-Credential') ||
        (method === 'put' && !u.searchParams.get('X-Amz-SignedHeaders')?.split(';').includes('if-none-match'))) throw new Error('Destino fora da aprovação ou PUT sem proteção de sobrescrita.');
    const stamp = u.searchParams.get('X-Amz-Date') || '';
    const match = stamp.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    const expires = Number(u.searchParams.get('X-Amz-Expires'));
    const issued = match ? Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`) : NaN;
    if (!Number.isFinite(issued) || issued > Date.now() + 300000 || !Number.isSafeInteger(expires) || expires < 1 || expires > 604800 ||
        issued + expires * 1000 < Date.now() + 2700000) throw new Error('URLs precisam de validade para toda a janela de execução.');
  }
  return d;
}

export async function digestFile(file) {
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of fs.createReadStream(file)) { hash.update(chunk); bytes += chunk.length; }
  return { bytes, sha256: hash.digest('hex') };
}

export async function transferRecovery({ directory, manifest, destination, request = fetch }) {
  const manifestPath = path.join(directory, 'manifest.json');
  const save = () => fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  manifest.transfer = 'failed';
  manifest.destination = { id: destination.id, retention_days: destination.retention_days,
    jurisdiction: destination.jurisdiction, approval_ref: destination.approval_ref };
  save();
  const send = async (name, expected) => {
    const file = path.join(directory, name);
    if (fs.lstatSync(file).isSymbolicLink() || (fs.statSync(file).mode & 0o077)) throw new Error('Arquivo inseguro.');
    const local = await digestFile(file);
    if (local.bytes !== expected.bytes || local.sha256 !== expected.sha256 || local.bytes > 5_000_000_000) throw new Error('Integridade/tamanho local inválido.');
    const body = fs.createReadStream(file);
    try {
      const response = await request(destination.objects[name].put, { method: 'PUT', body, duplex: 'half', redirect: 'error',
        signal: AbortSignal.timeout(600000), headers: { 'If-None-Match': '*', 'Content-Length': String(local.bytes) } });
      await response.body?.cancel();
      if (!response.ok) throw new Error('PUT falhou.');
    } finally { body.destroy(); }
    const response = await request(destination.objects[name].get, { redirect: 'error', signal: AbortSignal.timeout(600000) });
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('Readback falhou.'); }
    const hash = createHash('sha256'); let bytes = 0;
    try {
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > local.bytes) throw new Error('Readback excedeu tamanho.');
        hash.update(chunk);
      }
    } catch { throw new Error('Readback incompleto.'); }
    if (bytes !== local.bytes || hash.digest('hex') !== local.sha256) throw new Error('Hash remoto divergente.');
  };
  try {
    if (manifest.result !== 'exported_unverified' || manifest.files.length !== 2 ||
        manifest.files.some((f, i) => f.name !== names[i])) throw new Error('Export incompleto.');
    for (const file of manifest.files) await send(file.name, file);
    // Published last as the completion record. Recovery remains NOT RUN.
    manifest.transfer = 'ciphertext_readback_verified';
    manifest.transfer_completed_at = new Date().toISOString(); save();
    await send('manifest.json', await digestFile(manifestPath));
    return manifest;
  } catch {
    manifest.transfer = 'failed'; save();
    throw new Error('Transferência não validada; objetos órfãos devem ser reconciliados pelo operador.');
  }
}
