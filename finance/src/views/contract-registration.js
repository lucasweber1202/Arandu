import {el, percent, todayIso} from '../core.js';
import {button, field, onSubmit, toast, loading, errorState, linkButton} from '../ui.js';

export function contractForm(ctx, rfq, decision, chosen) {
  const today = todayIso();
  const months = Number(chosen?.terms?.term_months || chosen?.terms?.contract_months || 12);
  const end = new Date(Date.now() + months * 30.44 * 86400000).toISOString().slice(0, 10);
  const starts = el('input', { name: 'starts_on', type: 'date', value: today });
  const ends = el('input', { name: 'ends_on', type: 'date', value: end });
  const notice = el('input', { name: 'renewal_notice_days', type: 'number', min: '0', max: '3650', step: '1', value: '60' });
  const cost = el('textarea', { name: 'cost_summary', rows: '2', maxlength: '1000' });
  cost.value = chosen ? (rfq.product === 'credit'
    ? `${percent(chosen.terms?.interest_rate_month)} a.m.${chosen.terms?.cet_year ? ` · CET ${percent(chosen.terms.cet_year)} a.a.` : ''} · ${chosen.terms?.term_months || '—'} meses`
    : `MDR débito ${percent(chosen.terms?.mdr_debit)} · crédito ${percent(chosen.terms?.mdr_credit_cash)} · PIX ${percent(chosen.terms?.pix_fee)}`) : '';
  const conditions = el('textarea', { name: 'main_conditions', rows: '2', maxlength: '4000' });
  const reference = el('input', { name: 'document_reference', type: 'url', placeholder: 'https://…' });
  const feedback = el('div', {role:'status', 'aria-live':'polite'});
  const check = button('Conferir registro do contrato', {onClick:()=>recover()});
  check.hidden = true;
  const submit = button('Registrar contrato', { variant: 'primary', type: 'submit', iconName: 'briefcase' });
  const form = el('form', { class: 'card', id: 'contract-form', novalidate: true }, [
    el('div', { class: 'card-head' }, el('div', { class: 'card-head-text' }, [el('h3', { class: 'card-title', text: 'Registrar contrato' }),
      el('p', { class: 'card-subtitle', text: 'Com vigência e aviso prévio, o Arandu cria os marcos de 90, 60 e 30 dias e a data de aviso para a renovação.' })])),
    el('div', { class: 'card-body' }, [el('div', { class: 'field-grid' }, [
      field({ label: 'Início da vigência', control: starts, required: true }), field({ label: 'Fim da vigência', control: ends, required: true }),
      field({ label: 'Aviso prévio (dias)', control: notice, hint: 'Prazo contratual para avisar a não renovação.' }),
      field({ label: 'Referência do documento', control: reference, optionalLabel: true, hint: 'Link https para o contrato no seu repositório.' }),
      field({ label: 'Resumo do custo', control: cost, className: 'span-2' }), field({ label: 'Condições principais', control: conditions, optionalLabel: true, className: 'span-2' })
    ]), el('div', { class: 'form-actions' }, [submit, check]), feedback])
  ]);
  let uncertain = false, reading = false;
  async function recover() {
    if (reading) return;
    reading = true; check.disabled = true;
    feedback.replaceChildren(loading('Conferindo o registro no servidor…'));
    try {
      const result = await ctx.api(`decisions?organization_id=${encodeURIComponent(ctx.organization.id)}&rfq_id=${encodeURIComponent(rfq.id)}`);
      const found = result.rows?.find(row=>row.id===decision.id)?.contract;
      if (found?.id && found.decision_id===decision.id) {
        feedback.replaceChildren(el('p',{text:'Contrato localizado. O registro foi preservado sem novo envio.'}),linkButton('Abrir ciclo de vida do contrato',ctx.href(`/finance/contracts.html#contract-${found.id}`),{variant:'primary'}));
        check.hidden = true;
      } else feedback.replaceChildren(el('p',{text:'O contrato ainda não foi localizado. Os dados preenchidos foram preservados; confira novamente antes de iniciar outro registro.'}));
    } catch (error) { feedback.replaceChildren(errorState({error})); }
    finally { reading = false; check.disabled = false; }
  }
  onSubmit(form, async (event) => {
    event.preventDefault();
    if (uncertain || submit.disabled) return;
    if (!starts.value || !ends.value) {feedback.textContent='Informe início e fim da vigência.'; return;}
    if (ends.value < starts.value) { ends.closest('.field').setError('O fim não pode ser antes do início.'); ends.focus(); return; }
    if (reference.value && !/^https:\/\//.test(reference.value)) { reference.closest('.field').setError('Use um endereço https.'); reference.focus(); return; }
    submit.disabled = true;
    try {
      const result = await ctx.api('contracts', { method: 'POST', body: JSON.stringify({ decision_id: decision.id, ...Object.fromEntries(new FormData(form)), renewal_notice_days: Number(notice.value) }) });
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.id || '')) throw new Error('Não foi possível confirmar o registro do contrato.');
      toast('Contrato registrado. Os marcos de renovação já estão no calendário.');
      location.assign(ctx.href(`/finance/contracts.html#contract-${result.id}`));
    } catch (error) {
      if (!error.status || error.status >= 500 || error.status === 409) {
        uncertain = true;
        for (const control of form.querySelectorAll('input, textarea')) control.disabled = true;
        feedback.textContent = 'A resposta não confirmou o registro. Confira no servidor antes de enviar novamente; os dados preenchidos continuam nesta tela.';
        check.hidden = false;
      } else { feedback.replaceChildren(errorState({error})); submit.disabled = false; }
    }
  });
  return form;
}

