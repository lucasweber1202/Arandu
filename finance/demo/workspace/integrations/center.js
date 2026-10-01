// Central de integrações (/finance/integrations.html) — tudo simulado.
//
//   Comunicação · ERP/Financeiro · Identidade · Arquivos · Open Finance · Analytics
//
// Cada conector mostra: o que faz, o que seria compartilhado, estado, última
// sincronização e o que muda no produto quando conectado. O consentimento diz
// com todas as letras: nenhuma credencial é pedida, nenhum serviço real é
// chamado, nenhum dado sai deste navegador.

import { el, icon, timeAgo, formatDateTime, money } from '../../../src/core.js';
import { button, card, confirmDialog, emptyState, toast, drawer } from '../../../src/ui.js';
import { readOS, updateOS, subscribeOS } from '../platform/os-store.js';
import { emit } from '../platform/bus.js';
import { flag, track } from '../platform/telemetry.js';
import { ADAPTERS, CATEGORIES, CONNECTORS, connected } from './registry.js';
import { DIRECTORY, APP_ROLES, RBAC, ERP_SUPPLIERS, ERP_COST_CENTERS, OPEN_FINANCE_FIELDS, OPEN_FINANCE_INSTITUTIONS } from './fixtures.js';

const SIMULATED = 'Simulação: nenhuma credencial é pedida, nenhum serviço externo é chamado e nenhum dado sai deste navegador.';
const actor = (ctx) => ({ id: ctx.viewer?.id, name: ctx.viewer?.name });

function statusPill(adapter) {
  const on = adapter.status() === 'connected';
  return el('span', { class: `int-status${on ? ' is-on' : ''}`, dataset: { status: adapter.status() } }, [el('span', { class: 'int-dot', 'aria-hidden': 'true' }),
    el('span', { text: on ? `Conectado · sincronizado ${timeAgo(adapter.lastSync())}` : 'Não conectado' })]);
}

async function connectFlow(ctx, adapter, extra = null) {
  const body = el('div', { class: 'int-consent' }, [
    el('p', { class: 'int-sim', role: 'note' }, [icon('shield', { size: 15 }), el('span', { text: SIMULATED })]),
    el('p', { text: `Conta de demonstração: ${adapter.account}` }),
    el('h3', { class: 'int-h', text: 'O que o Arandu passaria a fazer' }),
    el('ul', { class: 'int-scopes' }, adapter.scopes.map((scope) => el('li', {}, [icon('check', { size: 13 }), el('span', { text: scope })]))),
    extra
  ].filter(Boolean));
  const ok = await confirmDialog({ title: `Conectar ${adapter.name}`, body, confirmLabel: 'Autorizar (simulado)' });
  if (!ok) return false;
  toast(`Conectando ${adapter.name}…`, 'info');
  await adapter.connect(ctx, extra?.options?.() || {});
  track('integration_connected', { id: adapter.id });
  toast(`${adapter.name} conectado (simulado).`);
  return true;
}

// ------------------------------------------------------------ comunicação
function pendingApproval(ctx) {
  const request = (ctx.demoApprovals || []).find((row) => row.status === 'pending');
  const rfq = request && (ctx.data.rfqs || []).find((row) => row.id === request.rfq_id);
  const step = request && [...(request.steps || [])].filter((item) => item.status === 'pending').sort((a, b) => a.position - b.position)[0];
  const who = step && (ctx.members || []).find((member) => member.user_id === step.approver_id)?.display_name;
  return rfq ? { request, rfq, step, who } : null;
}
export function messagePreview(ctx, adapter) {
  const item = pendingApproval(ctx);
  if (!item) return el('p', { class: 'muted', text: 'Sem aprovação pendente para pré-visualizar.' });
  const teams = adapter.id === 'teams';
  const open = button('Abrir no Arandu', { size: 'sm', variant: 'primary', attrs: { id: `${adapter.id}-open` }, onClick: () => {
    emit('approval.opened', { object: { type: 'approval', id: item.request.id, title: item.rfq.title, rfq_id: item.rfq.id }, actor: { id: item.step?.approver_id, name: item.who }, origin: teams ? 'teams' : 'slack', detail: { via: adapter.name } });
    location.assign(ctx.href(`/finance/approvals.html#request-${item.request.id}`));
  } });
  return el('figure', { class: `msg-preview is-${adapter.id}`, 'aria-label': `Prévia da mensagem no ${adapter.name}` }, [
    el('figcaption', { class: 'msg-channel', text: teams ? 'Finanças › Aprovações' : '#financeiro' }),
    el('div', { class: 'msg' }, [
      el('span', { class: 'msg-app', 'aria-hidden': 'true', text: 'A' }),
      el('div', { class: 'msg-body' }, [
        el('p', { class: 'msg-head' }, [el('strong', { text: 'Arandu' }), el('span', { class: 'msg-tag', text: 'APP' }), el('span', { class: 'muted', text: ' agora' })]),
        el('p', { text: `${item.who || 'Aprovador'}, a decisão de “${item.rfq.title}” aguarda você (etapa ${item.step?.position || 1} de ${(item.request.steps || []).length}).` }),
        el('p', { class: 'muted', text: `${money(item.rfq.demand?.amount)} · ${(item.rfq.proposals || []).length} propostas · prazo e condições no Arandu.` }),
        el('div', { class: 'msg-actions' }, [open])
      ])
    ]),
    el('p', { class: 'msg-note' }, [icon('lock', { size: 13 }), el('span', { text: ' Aprovar, rejeitar e pedir alterações acontecem só no Arandu, com o contexto completo. A mensagem só avisa e leva até lá.' })])
  ]);
}

// ------------------------------------------------------------- identidade
function identityPanel(ctx, adapter, redraw) {
  const directory = readOS().directory;
  const admin = ctx.can('admin');
  const idp = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Provedor de identidade' }, DIRECTORY.idps.map(([value, label]) => el('button', { type: 'button', role: 'radio', class: 'seg-item', 'aria-checked': String(directory.provider === value), disabled: !admin,
    onclick: () => { updateOS((draft) => { draft.directory.provider = value; }); emit('integration.synced', { object: { type: 'integration', id: 'workos', title: `SSO via ${label}` }, actor: actor(ctx), origin: 'directory' }); redraw(); }, text: label })));
  const mapping = el('table', { class: 'int-table', id: 'group-mapping' }, [
    el('caption', { class: 'sr-only', text: 'Mapeamento de grupos para papéis' }),
    el('thead', {}, el('tr', {}, [el('th', { scope: 'col', text: 'Grupo do diretório' }), el('th', { scope: 'col', text: 'Pessoas' }), el('th', { scope: 'col', text: 'Papel no Arandu' })])),
    el('tbody', {}, DIRECTORY.groups.map((group) => {
      const select = el('select', { class: 'input', 'aria-label': `Papel para ${group.name}`, disabled: !admin }, Object.entries(APP_ROLES).map(([key, [, label]]) => el('option', { value: key, text: label, selected: (directory.mappings[group.name] || 'none') === key })));
      select.addEventListener('change', () => { updateOS((draft) => { draft.directory.mappings[group.name] = select.value; }); toast(`${group.name} → ${APP_ROLES[select.value][1]}.`); });
      return el('tr', {}, [el('th', { scope: 'row', text: group.name }), el('td', { class: 'num', text: String(group.members) }), el('td', {}, select)]);
    }))
  ]);
  const imported = directory.connected;
  const importButton = admin ? button(imported ? 'Sincronizar diretório' : 'Importar diretório', { variant: imported ? 'secondary' : 'primary', iconName: 'users', attrs: { id: 'directory-import', disabled: directory.provider ? null : 'true' }, onClick: async () => {
    await adapter.sync(ctx);
    updateOS((draft) => { draft.directory.connected = true; draft.directory.users = DIRECTORY.sample.map(([name, group]) => ({ name, group })); draft.directory.groups = DIRECTORY.groups.map((group) => group.name); });
    emit('directory.imported', { object: { type: 'integration', id: 'workos', title: 'Diretório corporativo' }, actor: actor(ctx), origin: 'directory', detail: { users: DIRECTORY.total, groups: DIRECTORY.groups.length } });
    toast(`${DIRECTORY.total} usuários e ${DIRECTORY.groups.length} grupos importados (simulado).`);
  } }) : null;
  const rolesForMapping = (role) => DIRECTORY.groups.filter((group) => APP_ROLES[directory.mappings[group.name] || 'none'][0] === role).map((group) => group.name);
  const rbac = el('table', { class: 'int-table rbac', id: 'rbac-matrix' }, [
    el('caption', { class: 'int-caption', text: 'O que este papel pode fazer? (espelha as permissões do produto; não as altera)' }),
    el('thead', {}, el('tr', {}, [el('th', { scope: 'col', text: 'Capacidade' }), ...['admin', 'finance_manager', 'viewer'].map((role) => el('th', { scope: 'col' }, [el('span', { text: { admin: 'Administrador', finance_manager: 'Comprador', viewer: 'Aprovador' }[role] }),
      el('span', { class: 'rbac-groups', text: rolesForMapping(role).join(', ') || '—' })]))])),
    el('tbody', {}, RBAC.map(([label, roles]) => el('tr', {}, [el('th', { scope: 'row', text: label }), ...['admin', 'finance_manager', 'viewer'].map((role) => el('td', { class: roles.includes(role) ? 'is-yes' : 'is-no' },
      roles.includes(role) ? [icon('check', { size: 14 }), el('span', { class: 'sr-only', text: 'Sim' })] : [el('span', { 'aria-hidden': 'true', text: '—' }), el('span', { class: 'sr-only', text: 'Não' })]))])))
  ]);
  return el('div', { class: 'int-detail', id: 'identidade-detalhe' }, [
    el('h4', { class: 'int-h', text: 'Login único (SSO)' }), idp,
    el('p', { class: 'muted', text: directory.provider ? `SSO ativo via ${DIRECTORY.idps.find(([value]) => value === directory.provider)[1]} (simulado). Senhas locais seguem valendo na demo.` : 'Escolha o provedor de identidade.' }),
    el('h4', { class: 'int-h', text: 'Diretório (SCIM)' }),
    imported ? el('p', { class: 'int-figure', id: 'directory-summary' }, [el('strong', { class: 'num', text: `${DIRECTORY.total} usuários` }), ' · ', el('strong', { class: 'num', text: `${DIRECTORY.groups.length} grupos` }), el('span', { class: 'muted', text: ` · importado ${timeAgo(adapter.lastSync())}` })]) : null,
    importButton, mapping,
    imported ? el('details', { class: 'int-sample' }, [el('summary', { text: 'Amostra de pessoas importadas' }), el('ul', {}, readOS().directory.users.map((user) => el('li', { text: `${user.name} · ${user.group} → ${APP_ROLES[directory.mappings[user.group] || 'none'][1]}` })))]) : null,
    rbac
  ].filter(Boolean));
}

// -------------------------------------------------------------------- ERP
function erpPanel(ctx, adapter) {
  const erp = readOS().erp;
  const imported = erp.imported && erp.provider === adapter.id ? erp.imported : null;
  const importButton = ctx.can('admin') || ctx.can('create_rfq') ? button(imported ? 'Importar de novo' : 'Importar fornecedores e centros de custo', { variant: imported ? 'secondary' : 'primary', iconName: 'download', attrs: { id: `erp-import-${adapter.id}` }, onClick: async () => {
    await adapter.sync(ctx);
    updateOS((draft) => { draft.erp = { provider: adapter.id, imported: { at: new Date().toISOString(), suppliers: ERP_SUPPLIERS.length, cost_centers: ERP_COST_CENTERS.length } }; });
    emit('erp.imported', { object: { type: 'integration', id: adapter.id, title: adapter.name }, actor: actor(ctx), origin: 'erp', detail: { suppliers: ERP_SUPPLIERS.length, cost_centers: ERP_COST_CENTERS.length } });
    toast(`${ERP_SUPPLIERS.length} fornecedores e ${ERP_COST_CENTERS.length} centros de custo importados (simulado).`);
  } }) : null;
  const providers = new Set((ctx.data.providers || []).map((row) => row.name));
  return el('div', { class: 'int-detail' }, [
    importButton,
    imported ? el('p', { class: 'muted', text: `Importado ${timeAgo(imported.at)} de ${adapter.name}.` }) : null,
    imported ? el('table', { class: 'int-table', id: 'erp-recognition' }, [
      el('caption', { class: 'int-caption', text: 'Reconhecimento ERP → Arandu (por CNPJ fictício)' }),
      el('thead', {}, el('tr', {}, [el('th', { scope: 'col', text: 'Fornecedor no ERP' }), el('th', { scope: 'col', text: 'No Arandu' })])),
      el('tbody', {}, ERP_SUPPLIERS.map((row) => el('tr', {}, [el('th', { scope: 'row' }, [el('span', { text: row.name }), el('span', { class: 'int-sub num', text: `${row.code} · ${row.tax_id}` })]),
        el('td', {}, row.match && providers.has(row.match) ? el('span', { class: 'tag tag-success', text: `Reconhecido: ${row.match}` }) : el('span', { class: 'tag tag-neutral', text: 'Não é instituição financeira — ignorado' }))])))
    ]) : null,
    imported ? el('p', { class: 'int-cc' }, [el('strong', { text: 'Centros de custo: ' }), ERP_COST_CENTERS.map((row) => `${row.code} ${row.name}`).join(' · ')]) : null
  ].filter(Boolean));
}
/** Prévia do registro de um contrato no ERP — nada é enviado. */
export function erpRecordPreview(ctx, contract) {
  const adapter = connected('erp')[0];
  if (!adapter) return null;
  const supplier = ERP_SUPPLIERS.find((row) => row.match === contract.provider_name);
  const cost = contract.product === 'acquiring' ? ERP_COST_CENTERS[4] : ERP_COST_CENTERS[0];
  const rows = [['Sistema', `${adapter.name} (simulado)`], ['Fornecedor', supplier ? `${supplier.code} · ${supplier.name}` : `${contract.provider_name} (cadastrar no ERP)`], ['Centro de custo', `${cost.code} · ${cost.name}`],
    ['Objeto', contract.title || contract.product], ['Vigência', `${contract.starts_on || '—'} a ${contract.ends_on || '—'}`], ['Referência Arandu', contract.id.slice(-8)]];
  return el('div', { class: 'erp-preview', id: 'erp-preview' }, [
    el('dl', { class: 'erp-fields' }, rows.flatMap(([label, value]) => [el('dt', { text: label }), el('dd', { text: value })])),
    el('p', { class: 'int-sim' }, [icon('shield', { size: 14 }), el('span', { text: ' Prévia: nada foi enviado ao ERP. Em produção, o lançamento seria revisado por quem registra antes de subir.' })])
  ]);
}
export function openErpPreview(ctx, contract) {
  const body = erpRecordPreview(ctx, contract);
  if (!body) { toast('Conecte um ERP em Integrações para preparar o registro.', 'info'); return; }
  emit('contract.erp_prepared', { object: { type: 'contract', id: contract.id, title: contract.title || contract.provider_name }, actor: actor(ctx), origin: 'web' });
  drawer({ title: 'Preparar registro no ERP', subtitle: contract.provider_name, body, className: 'erp-drawer' });
}

// ------------------------------------------------------------ Open Finance
function openFinanceConsent() {
  const cats = ['Contas', 'Saldos', 'Transações', 'Empréstimos'];
  const boxes = cats.map((label) => el('input', { type: 'checkbox', checked: true, value: label }));
  const node = el('div', { class: 'of-consent' }, [
    el('p', { class: 'of-banner', role: 'note' }, [icon('alert', { size: 16 }), el('span', {}, [el('strong', { text: 'Dados simulados. ' }), 'Nenhum banco real será acessado.'])]),
    el('fieldset', { class: 'of-cats' }, [el('legend', { text: 'Categorias compartilhadas por 12 meses (revogável):' }), ...cats.map((label, index) => el('label', {}, [boxes[index], el('span', { text: ` ${label}` })]))]),
    el('p', { class: 'muted', text: `Instituições: ${OPEN_FINANCE_INSTITUTIONS.join(' e ')}.` })
  ]);
  node.options = () => ({ categories: boxes.filter((box) => box.checked).map((box) => box.value) });
  return node;
}
export function provenanceRows(ctx) {
  const of = readOS().profile.openFinance;
  const declared = new Map((ctx.data.profile || []).map((row) => [row.field_key, row]));
  return OPEN_FINANCE_FIELDS.map(([key, label, value, category]) => {
    const auto = of && value && of.categories.includes(category);
    const row = declared.get(key);
    return { key, label, value: auto ? value : row?.field_value || null, source: auto ? `Open Finance · ${of.provider}` : row ? 'Declarado pela empresa' : null,
      updated: auto ? of.at : row?.updated_at || null, owner: auto ? of.by : row ? 'Marina Costa' : null, auto: Boolean(auto) };
  });
}
function openFinancePanel(ctx, adapter) {
  const of = readOS().profile.openFinance;
  if (!of || of.provider !== adapter.name) return el('p', { class: 'muted', text: 'Depois do consentimento, os campos do perfil financeiro são preenchidos com a procedência de cada dado.' });
  const rows = provenanceRows(ctx);
  const auto = rows.filter((row) => row.auto).length;
  return el('div', { class: 'int-detail' }, [
    el('p', { class: 'int-figure', id: 'of-filled' }, [el('strong', { class: 'num', text: `${auto} de ${rows.length} campos` }), ' preenchidos automaticamente']),
    el('p', { class: 'muted', text: 'Os demais continuam declarados pela empresa. Revise no perfil financeiro.' }),
    el('a', { class: 'btn btn-secondary btn-sm', href: ctx.href('/finance/settings.html#perfil'), text: 'Ver procedência no perfil financeiro' })
  ]);
}
export function provenanceTable(ctx) {
  const rows = provenanceRows(ctx);
  return el('table', { class: 'int-table provenance', id: 'provenance-table' }, [
    el('caption', { class: 'int-caption', text: `${rows.filter((row) => row.auto).length} de ${rows.length} campos preenchidos automaticamente · dados simulados` }),
    el('thead', {}, el('tr', {}, ['Campo', 'Valor', 'Fonte', 'Atualizado', 'Responsável'].map((label) => el('th', { scope: 'col', text: label })))),
    el('tbody', {}, rows.map((row) => el('tr', { class: row.value ? '' : 'is-missing' }, [el('th', { scope: 'row', text: row.label }), el('td', { text: row.value || 'Não informado' }),
      el('td', {}, row.source ? el('span', { class: `tag ${row.auto ? 'tag-info' : 'tag-neutral'}`, text: row.source }) : '—'), el('td', { text: row.updated ? formatDateTime(row.updated) : '—' }), el('td', { text: row.owner || '—' })])))
  ]);
}

// -------------------------------------------------------------- arquivos
function filesPanel(adapter) {
  return el('ul', { class: 'int-files', 'aria-label': `Arquivos em ${adapter.name}` }, [['Balanço 2025 (auditado).pdf', '2,1 MB'], ['DRE 1º semestre 2026.xlsx', '380 KB'], ['Contrato Cadência — assinado.pdf', '1,4 MB']]
    .map(([name, size]) => el('li', {}, [icon('file', { size: 14 }), el('span', { text: name }), el('span', { class: 'muted num', text: size })])));
}
function analyticsPanel() {
  const events = readOS().analytics.slice(-4).reverse();
  return el('div', { class: 'int-detail' }, [
    el('p', { class: 'muted', text: 'Eventos que seriam enviados (sem valores, nomes ou documentos). Na demo, ficam neste navegador — veja em Uso da demonstração.' }),
    el('pre', { class: 'int-payload' }, JSON.stringify(events.map((event) => ({ event: event.name, at: event.at })), null, 2))
  ]);
}

// --------------------------------------------------------------- página
export async function integrationCenter(ctx) {
  ctx.header({ title: 'Integrações', subtitle: 'Conecte o Arandu ao que a empresa já usa. Na demonstração, todos os conectores são simulados.' });
  if (!flag('integrations')) return emptyState({ title: 'Central de integrações desligada', text: 'Ative em Uso da demonstração → Feature flags.', iconName: 'plug' });
  if (!ctx.demoApprovals) ctx.demoApprovals = await ctx.loadApprovals().catch(() => []);
  const admin = ctx.can('admin');
  const root = el('div', { class: 'int-center' });
  const draw = () => {
    const nav = el('nav', { class: 'int-nav', 'aria-label': 'Categorias de integração' }, el('ul', { role: 'list' }, CATEGORIES.map(([key, label, anchor]) => el('li', {}, el('a', { href: `#${anchor}` }, [
      el('span', { text: label }), connected(key).length ? el('span', { class: 'int-count num', 'aria-label': `${connected(key).length} conectados`, text: String(connected(key).length) }) : null])))));
    const sections = CATEGORIES.map(([key, label, anchor, text]) => el('section', { class: 'int-section', id: anchor, 'aria-labelledby': `${anchor}-h` }, [
      el('h2', { class: 'int-section-title', id: `${anchor}-h`, text: label }), el('p', { class: 'muted', text }),
      el('ul', { class: 'int-grid', role: 'list' }, CONNECTORS.filter((def) => def.category === key).map((def) => {
        const adapter = ADAPTERS[def.id];
        const on = adapter.status() === 'connected';
        const extra = key === 'open_finance' ? openFinanceConsent() : null;
        const actions = admin ? [
          on ? button('Sincronizar', { size: 'sm', iconName: 'refresh', attrs: { 'aria-label': `Sincronizar ${def.name}` }, onClick: async () => { await adapter.sync(ctx); toast(`${def.name} sincronizado (simulado).`); } }) : null,
          on ? button('Desconectar', { size: 'sm', variant: 'ghost', attrs: { 'aria-label': `Desconectar ${def.name}` }, onClick: async () => {
            if (!await confirmDialog({ title: `Desconectar ${def.name}?`, description: 'O Arandu para de enviar e receber dados deste conector. O que já foi importado continua visível na demo.', confirmLabel: 'Desconectar', tone: 'danger' })) return;
            await adapter.disconnect(ctx); if (key === 'open_finance') updateOS((draft) => { draft.profile.openFinance = null; }); toast(`${def.name} desconectado.`);
          } }) : button('Conectar', { size: 'sm', iconName: 'plug', attrs: { id: `connect-${def.id}`, 'aria-label': `Conectar ${def.name}` }, onClick: async () => {
            const done = await connectFlow(ctx, adapter, extra);
            if (done && key === 'open_finance') {
              const options = extra.options();
              updateOS((draft) => { draft.profile.openFinance = { provider: def.name, at: new Date().toISOString(), by: ctx.viewer?.name || 'Administração', categories: options.categories }; });
              emit('financial_profile.updated', { object: { type: 'profile', id: 'financial-profile', title: 'Perfil financeiro' }, actor: actor(ctx), origin: 'open_finance', detail: { categories: options.categories } });
            }
          } })
        ].filter(Boolean) : [el('span', { class: 'muted int-readonly', text: 'Só a administração conecta.' })];
        const detail = !on ? null : key === 'communication' ? messagePreview(ctx, adapter) : key === 'identity' ? identityPanel(ctx, adapter, draw) : key === 'erp' ? erpPanel(ctx, adapter)
          : key === 'open_finance' ? openFinancePanel(ctx, adapter) : key === 'files' ? filesPanel(adapter) : analyticsPanel();
        return el('li', { class: `int-card${on ? ' is-on' : ''}`, id: `int-${def.id}`, dataset: { connector: def.id } }, [
          el('div', { class: 'int-card-head' }, [el('span', { class: 'int-logo', 'aria-hidden': 'true', text: def.name.slice(0, 1) }), el('h3', { class: 'int-name', text: def.name }), statusPill(adapter)]),
          el('p', { class: 'int-account muted', text: on ? `${def.account} · conectado por ${adapter.record()?.connected_by || '—'}` : def.scopes.join(' · ') }),
          el('div', { class: 'int-actions' }, actions), detail
        ].filter(Boolean));
      }))
    ]));
    root.replaceChildren(el('p', { class: 'int-sim int-sim-page', role: 'note' }, [icon('shield', { size: 15 }), el('span', { text: SIMULATED })]), el('div', { class: 'int-layout' }, [nav, el('div', { class: 'int-sections' }, sections)]));
  };
  const off = subscribeOS(() => { if (root.dataset.mounted && !root.isConnected) { off(); return; } if (root.isConnected) root.dataset.mounted = '1';
    // Não redesenha enquanto a pessoa usa um controle da página (evita perder o foco).
    if (root.contains(document.activeElement) && document.activeElement.matches('select, input')) return; draw(); });
  draw();
  if (location.hash) requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView({ block: 'start' }));
  return root;
}
