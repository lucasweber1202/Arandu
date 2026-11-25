// Guardas puros do executor de migrations hospedadas (scripts/release-migrations.mjs).
// Sem I/O: testáveis com mocks e contra PostgreSQL descartável.

export const DEMO_REF = 'offgpyysgdhfemjlchod';
export const LEGACY_REF = 'igacnfjeuqhxcmfyepgj';
export const RELEASE_LOCK_KEY = 'arandu-release-migrations';
const MARKER = /^financial-[a-z0-9-]+$/;

// Último marcador schema_version gravado por um arquivo SQL.
export function finalMarker(sql) {
  const markers = [...String(sql || '').matchAll(/\(\s*'schema_version'\s*,\s*'([^']+)'\s*\)/g)];
  return markers.at(-1)?.[1] || null;
}

// Sufixo contíguo após o arquivo cujo marcador final é afterSchema.
// Desconhecido/ambíguo/nada pendente => erro explícito.
export function selectPendingSections(sections, afterSchema) {
  if (!MARKER.test(String(afterSchema || ''))) throw new Error('Marcador --after-schema inválido.');
  const matches = sections.flatMap((section, index) => (finalMarker(section.content) === afterSchema ? [index] : []));
  if (matches.length !== 1) throw new Error('Marcador --after-schema desconhecido ou ambíguo: nenhuma migration selecionada.');
  const pending = sections.slice(matches[0] + 1);
  if (pending.length === 0) throw new Error('Nenhuma migration pendente: não executar release novamente.');
  let expected = afterSchema;
  return pending.map((section) => {
    const target = finalMarker(section.content);
    if (!target || !MARKER.test(target)) throw new Error(`Migration pendente sem marcador final verificável: ${section.file}.`);
    const planned = { ...section, expectedBefore: expected, expectedAfter: target };
    expected = target;
    return planned;
  });
}

// Prefixo executado DENTRO da transação única de cada arquivo (psql -1):
// serializa execuções concorrentes e confirma o marcador real antes de qualquer
// DDL. Uma segunda execução simultânea espera o lock e falha ao reler o marcador.
export function guardPrefix(expectedBefore) {
  if (!MARKER.test(String(expectedBefore || ''))) throw new Error('Marcador esperado inválido para o guard.');
  return [
    `select pg_advisory_xact_lock(hashtext('${RELEASE_LOCK_KEY}'));`,
    'do $arandu_release_guard$',
    'begin',
    "  if to_regclass('public.fin_settings') is null",
    `     or coalesce((select value from public.fin_settings where key = 'schema_version'), '') <> '${expectedBefore}' then`,
    "    raise exception 'arandu-release-guard: marcador divergente; nada aplicado';",
    '  end if;',
    'end',
    '$arandu_release_guard$;'
  ].join('\n');
}

// Arquivos com BEGIN/COMMIT próprios só são aceitos se a transação englobar
// o arquivo inteiro: nenhum statement depois do COMMIT final e um único par.
export function assertSingleTransaction(sql, file) {
  const text = String(sql || '').replace(/--[^\n]*/g, '');
  const begins = (text.match(/^\s*begin\s*;/gim) || []).length;
  const commits = (text.match(/^\s*commit\s*;/gim) || []).length;
  if (begins !== commits || begins > 1) throw new Error(`Limite transacional ambíguo em ${file}.`);
  if (commits === 1 && !/commit\s*;\s*$/i.test(text.trim())) throw new Error(`Statements após COMMIT em ${file}.`);
  if (/\b(?:concurrently|vacuum)\b/i.test(text)) throw new Error(`Comando não transacional em ${file}.`);
}

// Uma única camada dona da transação (Arandu 12.1 / P1-A): o executor abre a
// transação (psql -1) e o arquivo entra sem o próprio par BEGIN/COMMIT. Antes,
// o BEGIN interno gerava "there is already a transaction in progress", o COMMIT
// interno encerrava a transação do executor e o COMMIT final de psql -1 avisava
// "there is no transaction in progress"; num bundle com vários arquivos, cada
// COMMIT interno fechava a transação e o restante rodava fora dela.
// Só remove o par já validado por assertSingleTransaction; o texto do arquivo
// (e seu sha256 no relatório) não muda.
export function transactionBody(sql, file) {
  assertSingleTransaction(sql, file);
  const lines = String(sql || '').split('\n');
  const isBegin = (line) => /^\s*begin\s*;\s*(--.*)?$/i.test(line);
  const isCommit = (line) => /^\s*commit\s*;\s*(--.*)?$/i.test(line);
  const begin = lines.findIndex(isBegin);
  if (begin === -1) return lines.join('\n');
  let commit = lines.length - 1;
  while (commit > begin && !isCommit(lines[commit])) commit -= 1;
  if (commit <= begin) throw new Error(`Limite transacional ambíguo em ${file}.`);
  const body = [...lines.slice(0, begin), `-- (BEGIN de ${file}: transação aberta pelo executor)`, ...lines.slice(begin + 1, commit), ...lines.slice(commit + 1)].join('\n');
  if (/^\s*(begin|commit|start\s+transaction)\s*;/im.test(body.replace(/--[^\n]*/g, ''))) throw new Error(`Controle transacional residual em ${file}.`);
  return body;
}

// Validação estrita da URL da Demo: libpq honra ?host=/hostaddr=/service= e
// variáveis PG* que o parser WHATWG não enxerga; tudo isso é recusado.
export function demoConnectionProblems(connectionString) {
  let parsed;
  try { parsed = new URL(String(connectionString || '')); } catch { return ['URL PostgreSQL inválida.']; }
  const problems = [];
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) problems.push('Protocolo não PostgreSQL.');
  const host = parsed.hostname.toLowerCase();
  const user = decodeURIComponent(parsed.username).toLowerCase();
  const port = parsed.port || '5432';
  const direct = host === `db.${DEMO_REF}.supabase.co` && user === 'postgres' && port === '5432';
  const pooler = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)
    && user === `postgres.${DEMO_REF}` && ['5432', '6543'].includes(port);
  if (!direct && !pooler) problems.push('Host/usuário/porta não correspondem ao Supabase Demo.');
  if (parsed.pathname !== '/postgres') problems.push('Banco deve ser /postgres.');
  for (const key of parsed.searchParams.keys()) {
    if (key !== 'sslmode') problems.push(`Parâmetro de conexão não permitido: ${key}.`);
  }
  const sslmode = parsed.searchParams.get('sslmode');
  if (sslmode && !['require', 'verify-ca', 'verify-full'].includes(sslmode)) problems.push('sslmode inseguro.');
  if (String(connectionString).toLowerCase().includes(LEGACY_REF)) problems.push('Projeto legado é proibido.');
  return problems;
}

// Ambiente do processo filho sem PG*: impede PGHOST/PGSERVICE/PGOPTIONS etc.
// de alterarem silenciosamente o destino efetivo.
export function sanitizedChildEnv(env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !/^PG/i.test(key)));
}
