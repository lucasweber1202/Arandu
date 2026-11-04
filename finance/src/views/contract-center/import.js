// Assistente de registro de contrato existente. Carregado só ao acionar o registro.
// Extraído de views/contract-center.js (v7.0).

import { el, icon, formatDate, PROVIDER_KINDS, textSpan } from '../../core.js';
import { button, field, drawer, toast, loading, confirmDialog, onSubmit, mutedText, toastError } from '../../ui.js';
import { CONTRACT_CATEGORIES } from '../../../../lib/finance/contract-terms.mjs';
import { entityTree } from '../../../../lib/finance/entities.mjs';
import { selectedEntity } from '../entities.js';
import { termsEditor } from './terms.js';

const NEW_PROVIDER = '__nova__';

const addDays = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

export function openImportContract(ctx, entities, { providerId: presetProvider = null } = {}) {
  const form = el('form', { class: 'stack', id: 'contract-import-form', novalidate: true });
  const category = el('select', { name: 'product' });
  for (const [value, text] of Object.entries(CONTRACT_CATEGORIES)) category.add(new Option(text, value));
  // Instituição: escolhe uma cadastrada ou cadastra ali mesmo, sem sair do registro.
  const providers = [...(ctx.data.providers || [])];
  const provider = el('select', { name: 'provider_id', required: true });
  const fillProviders = (selected = '') => {
    provider.replaceChildren(new Option(providers.length ? 'Escolha a instituição' : 'Nenhuma instituição cadastrada', ''),
      ...providers.map((row) => new Option(row.name, row.id)), new Option('+ Cadastrar nova instituição', NEW_PROVIDER));
    provider.value = selected;
  };
  fillProviders(presetProvider && providers.some((row) => row.id === presetProvider) ? presetProvider : providers.length === 1 ? providers[0].id : '');
  const providerName = el('input', { name: 'provider_name', maxlength: '200', autocomplete: 'organization' });
  const providerKind = el('select', { name: 'provider_kind' });
  for (const [value, text] of Object.entries(PROVIDER_KINDS)) providerKind.add(new Option(text, value));
  const providerNameField = field({ label: 'Nome da instituição', control: providerName, required: true });
  const newProvider = el('fieldset', { class: 'stack inline-create', hidden: true }, [el('legend', { class: 'small', text: 'Nova instituição' }), providerNameField,
    field({ label: 'Tipo', control: providerKind }), mutedText('Cadastrada junto com o contrato. Contato, site e evidências ficam em Provedores.')]);
  const title = el('input', { name: 'title', maxlength: '200', required: true, placeholder: 'Ex.: Capital de giro 2026' });
  const starts = el('input', { name: 'starts_on', type: 'date', required: true });
  const ends = el('input', { name: 'ends_on', type: 'date', required: true });
  // Sem valor presumido: aviso prévio é declaração de quem registra (contrato ou marco interno).
  const notice = el('input', { name: 'renewal_notice_days', type: 'number', min: '0', max: '3650', step: '1', inputmode: 'numeric', placeholder: 'Ex.: 60' });
  const autoRenew = el('input', { name: 'auto_renew', type: 'checkbox' });
  const entity = el('select', { name: 'legal_entity_id' });
  if (entities.scope === 'group') entity.add(new Option('Nível de grupo', ''));
  for (const row of entityTree(entities.rows)) if (row.status === 'active') entity.add(new Option(`${row.depth ? '— ' : ''}${row.short_name || row.legal_name}`, row.id));
  // A entidade em foco na tela vira o padrão do registro (a pessoa ainda pode trocar).
  const focused = selectedEntity();
  if (focused && [...entity.options].some((option) => option.value === focused)) entity.value = focused;
  // Contrato principal: só do mesmo provedor (o banco recusa o resto).
  const parent = el('select', { name: 'parent_contract_id' });
  const parentField = field({ label: 'Contrato principal', control: parent, optionalLabel: true, hint: 'Para aditivo comercial ou pacote vinculado a um contrato já registrado com a mesma instituição.' });
  const fillParents = () => {
    const options = (ctx.data.contracts || []).filter((row) => row.provider_id && row.provider_id === provider.value);
    parent.replaceChildren(new Option('Nenhum (contrato independente)', ''), ...options.map((row) => new Option(`${row.title || CONTRACT_CATEGORIES[row.product] || 'Contrato'} · até ${formatDate(row.ends_on)}`, row.id)));
    parentField.hidden = !options.length;
  };
  fillParents();
  let editor = termsEditor(category.value);
  const editorSlot = el('div', {}, editor);
  category.addEventListener('change', () => { editor = termsEditor(category.value); editorSlot.replaceChildren(editor); });
  // Responsável pelo contrato (não pela tarefa de renovação nem por aprovação).
  // A lista é só conveniência: quem decide a elegibilidade é o servidor.
  const OWNER_ROLES = ['admin', 'finance_manager', 'analyst'];
  const candidates = (ctx.members || []).filter((member) => member.user_id && OWNER_ROLES.includes(member.role));
  const owner = el('select', { name: 'owner_id' });
  owner.add(new Option('Eu, quem está registrando', ''));
  for (const member of candidates) if (member.user_id !== ctx.viewer?.id) owner.add(new Option(member.display_name || 'Membro da equipe', member.user_id));
  const ownerField = candidates.length ? field({ label: 'Responsável pelo contrato', control: owner, optionalLabel: true, hint: 'Quem responde pelo relacionamento deste contrato. A tarefa de renovação tem responsável próprio, escolhido depois; aprovações seguem a regra da empresa.' }) : null;
  const providerField = field({ label: 'Instituição financeira', control: provider, required: true });
  const titleField = field({ label: 'Título', control: title, required: true, hint: 'Como a equipe reconhece o contrato.' });
  const startsField = field({ label: 'Início', control: starts, required: true });
  const endsField = field({ label: 'Fim', control: ends, required: true });
  const noticeField = field({ label: 'Aviso prévio (dias)', control: notice, required: true, hint: 'Copie do contrato. Se ele não define, informe o marco interno que a empresa adota; o Arandu não presume um valor.' });
  // Próxima ação calculada com a mesma regra do banco: fim − aviso prévio.
  const preview = el('p', { class: 'callout compact', id: 'contract-import-preview', role: 'status', 'aria-live': 'polite', hidden: true });
  const today = new Date().toISOString().slice(0, 10);
  const updatePreview = () => {
    const days = notice.value === '' ? NaN : Number(notice.value);
    if (!starts.value || !ends.value || ends.value < starts.value) { preview.hidden = true; return; }
    if (!Number.isInteger(days) || days < 0) {
      // Sem aviso prévio declarado, o prazo de decisão não é presumido.
      preview.replaceChildren(icon('info', { size: 14 }), textSpan('Sem aviso prévio informado, o prazo para decidir a renovação não pode ser determinado.'));
      preview.className = 'callout compact callout-info'; preview.hidden = false; return;
    }
    const review = addDays(ends.value, -days);
    preview.replaceChildren(icon(ends.value < today ? 'clock' : 'calendar', { size: 14 }), textSpan(ends.value < today
      ? `Contrato encerrado em ${formatDate(ends.value)}: fica na memória da carteira, sem tarefa de renovação.`
      : review <= today
        ? `O prazo do aviso prévio já começou (${formatDate(review)}). O contrato entra em renovação e a tarefa “Revisar renovação” vence hoje.`
        : `Próxima ação: tarefa “Revisar renovação” para ${formatDate(review)}, ${days} dias antes do fim.`));
    preview.className = `callout compact ${ends.value >= today && review <= today ? 'callout-warning' : 'callout-info'}`;
    preview.hidden = false;
  };
  for (const control of [starts, ends, notice]) control.addEventListener('input', updatePreview);
  const review = el('section', { class: 'stack import-review', id: 'contract-import-review', 'aria-labelledby': 'contract-import-review-title', tabindex: '-1', hidden: true });
  const outcome = el('div', { class: 'stack', role: 'status', 'aria-live': 'polite' });
  provider.addEventListener('change', () => {
    // An explicit selection starts another counterparty context. Never carry
    // a previously confirmed ID into a later '+ new institution' choice.
    providerId = null; providerIntent = null;
    newProvider.hidden = provider.value !== NEW_PROVIDER;
    providerField.setError('');
    fillParents();
    if (!newProvider.hidden) providerName.focus();
  });
  form.append(
    field({ label: 'Categoria', control: category }),
    providerField, newProvider, titleField,
    ...(entities.rows.length ? [field({ label: 'Entidade', control: entity, hint: 'Empresa do grupo que assinou o contrato.' })] : []),
    el('div', { class: 'field-grid' }, [startsField, endsField, noticeField, el('label', { class: 'check-row' }, [autoRenew, textSpan('Renovação automática')])]),
    preview, parentField, ownerField,
    el('details', { class: 'terms-details' }, [el('summary', { text: 'Termos estruturados (opcional agora, versão 1)' }), editorSlot]),
    el('p', { class: 'callout callout-info compact' }, [icon('info', { size: 14 }), textSpan('Registre o que está no contrato assinado. O Arandu não calcula nem infere termos; correções futuras viram nova versão com justificativa.')])
,
    review, outcome
  );
  // Campos ocultos por regra (nova instituição, contrato principal) voltam ocultos ao sair da revisão.
  const rememberHidden = () => { for (const child of form.children) if (child !== review && child !== outcome) child.dataset.hidden = String(child.hidden); };
  // Revisão antes da gravação material: o envio só acontece depois de a pessoa
  // conferir o resumo; a confirmação na tela só vem com o id devolvido pelo servidor.
  const save = button('Revisar registro', { variant: 'primary', type: 'submit', iconName: 'check', attrs: { form: 'contract-import-form' } });
  let reviewing = false, uncertain = false;
  const back = button('Voltar e editar', { variant: 'ghost', onClick: () => setReviewing(false) });
  back.hidden = true;
  const setReviewing = (on) => {
    reviewing = on;
    for (const child of form.children) if (child !== review && child !== outcome) child.hidden = on ? true : child.dataset.hidden === 'true';
    review.hidden = !on; back.hidden = !on || uncertain;
    save.textContent = on ? 'Confirmar registro' : 'Revisar registro';
    if (on) review.focus(); else { outcome.replaceChildren(); title.focus(); }
  };
  // Formulário longo num painel: clique fora, Esc ou Cancelar com dados
  // preenchidos pedem confirmação em vez de descartar o que foi digitado.
  let dirty = false;
  form.addEventListener('input', () => { dirty = true; });
  form.addEventListener('change', () => { dirty = true; });
  const confirmClose = () => !dirty || confirmDialog({ title: 'Descartar o registro do contrato?', description: 'O que você preencheu ainda não foi gravado e será perdido.', confirmLabel: 'Descartar', tone: 'danger' });
  const dialog = drawer({ title: 'Registrar contrato existente', subtitle: 'Carteira atual da empresa, fora de uma concorrência no Arandu.', body: form, confirmClose,
    footer: [button('Cancelar', { variant: 'ghost', onClick: () => dialog.dismiss() }), back, save] });

  const validate = () => {
    const errors = [];
    const check = (wrap, control, message) => { wrap.setError(message || ''); if (message) errors.push(control); };
    check(providerField, provider, provider.value ? null : 'Escolha a instituição ou cadastre uma nova.');
    if (provider.value === NEW_PROVIDER) check(providerNameField, providerName, providerName.value.trim().length >= 2 ? null : 'Informe o nome da instituição.');
    else providerNameField.setError('');
    check(titleField, title, title.value.trim().length < 2 ? 'Dê um título com pelo menos 2 caracteres.' : /[<>]/.test(title.value) ? 'Use texto simples, sem < ou >.' : null);
    check(startsField, starts, starts.value ? null : 'Informe a data de início.');
    check(endsField, ends, !ends.value ? 'Informe a data de fim.' : starts.value && ends.value < starts.value ? 'O fim não pode anteceder o início.' : null);
    const days = notice.value === '' ? NaN : Number(notice.value);
    check(noticeField, notice, notice.value === '' ? 'Informe o aviso prévio: do contrato ou o marco interno adotado pela empresa.' : Number.isInteger(days) && days >= 0 && days <= 3650 ? null : 'Use um número inteiro de 0 a 3650 dias.');
    if (errors.length) errors[0].focus();
    return !errors.length;
  };
  const summary = () => {
    const providerLabel = provider.value === NEW_PROVIDER ? `${providerName.value.trim()} (nova instituição, cadastrada junto)` : provider.selectedOptions[0]?.text || 'Não informada';
    const days = Number(notice.value);
    const reviewOn = addDays(ends.value, -days);
    const deadline = ends.value < today ? 'Contrato encerrado: fica na memória da carteira, sem tarefa de renovação.'
      : reviewOn <= today ? `O aviso prévio já começou (${formatDate(reviewOn)}): a revisão da renovação vence hoje.`
      : `Revisar a renovação até ${formatDate(reviewOn)} (${days} dias antes do fim).`;
    const filled = Object.keys(editor.read() || {}).length;
    const rows = [
      ['Instituição', providerLabel], ['Categoria', CONTRACT_CATEGORIES[category.value] || 'Não informada'], ['Título', title.value.trim()],
      entities.rows.length ? ['Entidade', entity.selectedOptions[0]?.text.replace(/^— /, '') || 'Nível de grupo'] : null,
      ['Vigência', `${formatDate(starts.value)} → ${formatDate(ends.value)}`], ['Aviso prévio', `${days} dias${autoRenew.checked ? ' · renovação automática' : ''}`],
      ['Próximo prazo', deadline], parent.value ? ['Contrato principal', parent.selectedOptions[0]?.text] : null,
      ['Termos estruturados', filled ? `${filled} ${filled === 1 ? 'campo preenchido' : 'campos preenchidos'} (versão 1)` : 'Nenhum agora; podem ser estruturados depois'],
      ['Origem', 'Carteira existente, declarada pela empresa. Sem concorrência, proposta ou aprovação no Arandu.'],
      ['Responsável pelo contrato', owner.value ? owner.selectedOptions[0]?.text : 'Você, quem está registrando'],
      ['Tarefa de renovação', 'Criada sem responsável automático: atribua na próxima ação do contrato.']
    ].filter(Boolean);
    review.replaceChildren(el('h3', { class: 'card-title', id: 'contract-import-review-title', text: 'Confira antes de gravar' }),
      el('dl', { class: 'deflist' }, rows.map(([label, value]) => el('div', { class: 'deflist-row' }, [el('dt', { text: label }), el('dd', { text: value })]))),
      mutedText('Nada foi gravado ainda. Confirme para registrar ou volte para corrigir.'));
  };
  // Intenção persistente (#276): uma request_key por intenção material, reenviada
  // igual em cada tentativa legítima. O recibo do servidor é a única prova de
  // gravação; a carteira carregada (um recorte) nunca é usada para concluir.
  let intent = null;
  let providerIntent = null;
  const intentOrganization = ctx.organization.id;
  const notice_ = (tone, text) => el('p', { class: `callout callout-${tone} compact`, text });
  const openSaved = (id) => {
    dirty = false; dialog.close();
    const target = ctx.href(`/finance/contracts.html?abrir=contrato#contract-${id}`);
    if (location.pathname.endsWith('/contracts.html')) { history.replaceState(null, '', target); ctx.reload(); } else location.assign(target);
  };
  // Depois de um resultado incerto, editar exige a transição explícita para um registro novo.
  const unlock = () => { uncertain = false; save.disabled = false; back.hidden = true; save.textContent = 'Enviar de novo (mesma intenção)'; };
  const fresh = button('Começar um registro novo', { variant: 'ghost', onClick: async () => {
    const ok = await confirmDialog({ title: 'Começar um registro novo?', description: 'A tentativa anterior pode ter sido gravada. Um registro novo é outra intenção: se a anterior existir, a carteira terá dois contratos. Prefira conferir antes.', confirmLabel: 'Começar registro novo', tone: 'danger' });
    if (!ok) return;
    intent = null; uncertain = false; save.disabled = false; save.textContent = 'Revisar registro'; outcome.replaceChildren(); setReviewing(false);
  } });
  const check = button('Conferir registro', { variant: 'primary', iconName: 'refresh', onClick: async () => {
    if (!intent) return;
    check.disabled = true;
    outcome.replaceChildren(loading('Conferindo o recibo deste registro no servidor…'));
    try {
      const query = new URLSearchParams({ organization_id: ctx.organization.id, request_key: intent.key });
      if (intent.entity) query.set('legal_entity_id', intent.entity);
      const receipt = await ctx.api(`contract-import-result?${query}`);
      if (receipt.state === 'confirmed' && receipt.id) {
        outcome.replaceChildren(notice_('success', 'O contrato foi gravado. Nada foi enviado de novo.'),
          button('Abrir o contrato registrado', { variant: 'primary', iconName: 'arrowRight', onClick: () => openSaved(receipt.id) }));
        return;
      }
      if (receipt.state === 'pending') { outcome.replaceChildren(notice_('info', 'O registro ainda está sendo processado no servidor. Nada foi reenviado; confira de novo em instantes.'), check); return; }
      if (receipt.state === 'unconfirmed') {
        // Sem recibo visível não é prova de rejeição: reenviar a MESMA intenção é seguro (o servidor deduplica pela chave).
        unlock();
        outcome.replaceChildren(notice_('warning', 'O servidor não tem confirmação deste registro agora. Isso não prova que ele foi recusado. Enviar de novo usa a mesma intenção e não duplica o contrato.'), check, fresh);
        return;
      }
      throw new Error('O servidor não informou a situação do registro. Confira de novo.');
    } catch (error) {
      const message = error.status === 401 ? 'Sua sessão expirou. Entre de novo em outra aba e confira aqui; o preenchimento continua nesta tela.'
        : error.status === 403 ? 'Seu acesso a esta organização ou entidade não permite conferir este registro.'
          : error.status === 409 ? 'A situação deste registro mudou. Recarregue a carteira antes de continuar; nada foi reenviado.'
            : error.message || 'Não foi possível conferir agora. Tente de novo.';
      outcome.replaceChildren(notice_('warning', message), check);
    } finally { check.disabled = false; }
  } });
  // Only an authorized receipt proves identity. Never infer it from a name.
  const providerCheck = button('Conferir instituição', { variant: 'primary', iconName: 'refresh', onClick: async () => {
    if (!providerIntent || ctx.organization.id !== intentOrganization) return;
    providerCheck.disabled = true;
    outcome.replaceChildren(loading('Conferindo o recibo da instituição no servidor…'));
    try {
      const q = new URLSearchParams({ organization_id: intentOrganization, request_key: providerIntent.key });
      const receipt = await ctx.api(`provider-creation-result?${q}`);
      if (receipt.state === 'pending') { outcome.replaceChildren(notice_('info', 'O cadastro ainda está sendo processado. Confira de novo em instantes.'), providerCheck); return; }
      if (receipt.state === 'confirmed' && receipt.id && receipt.row?.id === receipt.id) {
        providerId = receipt.id;
        providers.push({ id: receipt.id, name: receipt.row.name }); fillProviders(receipt.id); newProvider.hidden = true; fillParents();
        uncertain = false; save.disabled = false; back.hidden = false; summary();
        outcome.replaceChildren(notice_('success', 'A instituição foi confirmada pelo recibo. O contrato ainda não foi enviado; confira e confirme o registro.'));
        return;
      }
      if (receipt.state === 'unconfirmed') {
        uncertain = false; save.disabled = false; back.hidden = true;
        save.textContent = 'Enviar de novo (mesma intenção)';
        outcome.replaceChildren(notice_('warning', 'O cadastro ainda não tem confirmação. Isso não prova recusa; enviar de novo reutiliza a mesma intenção e não duplica a instituição.'), providerCheck);
        return;
      }
      throw new Error('O servidor não confirmou a situação do cadastro. Confira de novo.');
    } catch (error) {
      const message = error.status === 401 ? 'Sua sessão expirou. Entre de novo em outra aba e confira aqui; os dados continuam nesta tela.'
        : error.status === 403 ? 'Seu acesso não permite conferir este cadastro. Nada foi reenviado.' : 'Não foi possível conferir agora. Os dados continuam nesta tela; tente de novo.';
      outcome.replaceChildren(notice_('warning', message), providerCheck);
    } finally { providerCheck.disabled = false; }
  } });
  let providerId = null;
  onSubmit(form, async (event) => {
    event.preventDefault();
    if (ctx.organization.id !== intentOrganization) { outcome.replaceChildren(notice_('warning', 'A organização mudou. Feche este formulário e abra um cadastro na organização correta.')); save.disabled = true; return; }
    if (uncertain || save.disabled) return;
    if (!reviewing) {
      if (!validate()) return;
      rememberHidden(); summary(); setReviewing(true); return;
    }
    save.disabled = true; back.disabled = true;
    outcome.replaceChildren(loading('Gravando o contrato…'));
    try {
      if (provider.value === NEW_PROVIDER && !providerId) {
        const material = { organization_id: intentOrganization, name: providerName.value.trim(), kind: providerKind.value };
        const fingerprint = JSON.stringify(material);
        if (providerIntent && providerIntent.fingerprint !== fingerprint) throw Object.assign(new Error('Os dados desta intenção mudaram. Confira o recibo antes de iniciar outro cadastro.'), { status: 409, code: 'provider_creation_conflict' });
        if (!providerIntent) providerIntent = { key: crypto.randomUUID(), fingerprint };
        const created = await ctx.send('providers', { ...material, request_key: providerIntent.key });
        providerId = created.row?.id;
        if (!providerId) throw new Error('O servidor não confirmou o cadastro da instituição. Confira o recibo.');
        // Um novo envio depois de falha no contrato reaproveita a instituição criada.
        providers.push({ id: providerId, name: providerName.value.trim() });
        fillProviders(providerId);
        newProvider.hidden = true;
        fillParents();
      }
      const material = {
        organization_id: ctx.organization.id, product: category.value, provider_id: provider.value,
        title: title.value.trim(), starts_on: starts.value, ends_on: ends.value, renewal_notice_days: Number(notice.value),
        auto_renew: autoRenew.checked, legal_entity_id: entity.value || null, parent_contract_id: parent.value || null, terms: editor.read(),
        ...(owner.value ? { owner_id: owner.value } : {})
      };
      const fingerprint = JSON.stringify(material);
      // A mesma chave só acompanha o mesmo conteúdo material; conteúdo novo é intenção nova.
      if (!intent || intent.fingerprint !== fingerprint) intent = { key: crypto.randomUUID(), fingerprint, entity: material.legal_entity_id };
      const result = await ctx.send('contract-import', { ...material, request_key: intent.key });
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result?.id || '')) { const unconfirmed = new Error('O servidor não confirmou o registro.'); unconfirmed.status = 502; throw unconfirmed; }
      const task = result.next_task;
      toast(result.replayed ? 'Este registro já estava gravado. Nada foi duplicado.' : task ? `Contrato registrado. Próxima ação: revisar a renovação até ${formatDate(task.due_on)} (em Tarefas).` : 'Contrato registrado na carteira, sem renovação pendente.');
      // A confirmação veio do servidor (id retornado): abre o contrato gravado
      // já com o trabalho dele (próxima ação, responsável, marcos).
      openSaved(result.id);
    } catch (error) {
      back.disabled = false;
      // Offline antes do envio (sem código) não chegou ao servidor; queda/timeout depois do envio é incerto.
      if (error.status === 0 && !error.code) { outcome.replaceChildren(el('p', { class: 'callout callout-warning compact', text: error.message })); save.disabled = false; return; }
      if (!error.status || error.status >= 500 || ['network_error', 'timeout'].includes(error.code)) {
        uncertain = true; back.hidden = true;
        if (!intent) { outcome.replaceChildren(notice_('warning', 'O cadastro da nova instituição não foi confirmado e o contrato ainda não foi enviado. Confira a instituição antes de continuar.'), providerCheck); return; }
        outcome.replaceChildren(notice_('warning', 'A resposta não confirmou o registro. Os dados continuam nesta tela; confira o recibo antes de enviar de novo.'), check);
        return;
      }
      outcome.replaceChildren();
      // Recusa definitiva: nada foi gravado com esta chave; corrigir gera intenção nova.
      intent = null;
      if (error.code === 'provider_creation_conflict') { uncertain = true; back.hidden = true; outcome.replaceChildren(notice_('warning', error.message), providerCheck); return; }
      if (error.code === 'contract_import_conflict') outcome.replaceChildren(notice_('warning', 'Este registro conflita com uma tentativa anterior de conteúdo diferente. Recarregue a carteira e confira antes de registrar.'));
      else if (error.code === 'contract_owner_unavailable') { setReviewing(false); ownerField?.setError('Esta pessoa não pode ser responsável por este contrato (papel, acesso à entidade ou conta). Escolha outra ou deixe você mesmo.'); owner.focus(); }
      else if (error.code === 'contract_duplicate') outcome.replaceChildren(notice_('warning', error.message));
      else if (error.status === 401) outcome.replaceChildren(el('p', { class: 'callout callout-warning compact', text: 'Sua sessão expirou. Nada foi gravado; entre de novo em outra aba e confirme aqui sem perder o preenchimento.' }));
      else if (error.status === 403) outcome.replaceChildren(el('p', { class: 'callout callout-warning compact', text: 'Seu papel não permite registrar contratos nesta organização ou entidade. Nada foi gravado.' }));
      else {
        setReviewing(false);
        if (error.code === 'invalid_parent_contract') parentField.setError(error.message);
        else if (error.code === 'invalid_period' || error.code === 'invalid_date') endsField.setError(error.message);
        toastError(error);
      }
      save.disabled = false;
    }
  });
  (providers.length ? title : provider).focus();
}

/** Painel do contrato: termos, versões, aditivos, marcos e contratos filhos. */
