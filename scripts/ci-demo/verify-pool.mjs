import { assertLocalEnv } from './assert-local.mjs';
import { DEMO_POOL_READINESS_PATH, demoPoolTotal, demoPoolStatus } from '../../lib/finance/demo-entry-readiness.mjs';
import { readBoundedResponse } from '../../lib/bounded-response.mjs';

assertLocalEnv(process.env, 'visitor-pool');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key || !process.env.SUPABASE_URL) process.exit(2);
try {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${DEMO_POOL_READINESS_PATH}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' }, signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('pool_read_failed');
  const rows = JSON.parse((await readBoundedResponse(response, 4 * 1024 * 1024)).toString('utf8'));
  const total = demoPoolTotal(response.headers.get('content-range'));
  if (total !== 4 || !Array.isArray(rows) || rows.some(row => row.status !== 'ready') || demoPoolStatus(rows, { total }) !== 'ok') throw new Error('pool_incomplete');
  console.log('VISITOR_POOL_VALIDATED ready=4; canonical personas, unique accounts/organizations, exact count');
} catch {
  console.error('VISITOR_POOL_FAILED: verify synthetic provisioning and pool metadata; no credentials or row contents reported.');
  process.exitCode = 1;
}
