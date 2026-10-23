import {el, formatDate, formatDateTime} from '../core.js';
import {button, field, loading, errorState, toast, onSubmit} from '../ui.js';
import {TASK_EDITORS, taskChangeError} from './shared.js';

// A composition of existing tasks, not another obligation or audit store.
export function contractWork(ctx, contract) {
  const root=el('section',{class:'cc-section contract-work','aria-label':'Trabalho deste contrato'});
  const list=el('div');
  const notice=el('p',{role:'status','aria-live':'polite',class:'muted small'});
  const filter=el('select',{'aria-label':'Situação das tarefas do contrato',class:'input'});
  for(const [value,text] of [['open','Pendentes'],['done','Concluídas'],['cancelled','Canceladas']])filter.add(new Option(text,value));
  const edit=TASK_EDITORS.includes(ctx.viewer?.role);
  const endpoint=`tasks?organization_id=${encodeURIComponent(ctx.organization.id)}&contract_id=${encodeURIComponent(contract.id)}&limit=25`;
  let epoch=0, rows=[], cursor=null, busy=false;
  const more=button('Mais tarefas deste contrato',{size:'sm',onClick:()=>load(true)});
  const refresh=button('Atualizar tarefas do contrato',{size:'sm',iconName:'refresh',onClick:()=>load()});
  root.append(el('div',{class:'cc-head'},[el('h3',{text:'Trabalho deste contrato'}),refresh]),
    el('p',{class:'muted small',text:'Concluir uma tarefa registra o trabalho da equipe; não conclui um marco, aprova uma obrigação nem altera o contrato.'}),
    el('div',{class:'toolbar'},[
      el('a',{class:'btn btn-sm btn-secondary',href:ctx.href(`/finance/providers.html?provider_id=${encodeURIComponent(contract.provider_id)}`),text:`Relacionamento com ${contract.provider_name || 'a instituição'}`}),
      contract.source_rfq ? el('a',{class:'btn btn-sm btn-secondary',href:ctx.href(`/finance/rfq.html?id=${encodeURIComponent(contract.source_rfq.id)}`),text:`Solicitação de origem: ${contract.source_rfq.title}`}) : null
    ]),field({label:'Situação das tarefas do contrato',control:filter}),notice,list,more);
  filter.addEventListener('change',()=>load());
  function render() {
    list.replaceChildren(rows.length ? el('ul',{class:'milestone-list'},rows.map(task=>el('li',{class:'milestone-row'},[
      el('div',{class:'milestone-main'},[
        el('strong',{text:task.title}),
        el('span',{class:'muted small',text:`${task.due_on ? `Prazo ${formatDate(task.due_on)}` : 'Sem prazo'} · ${task.assignee_name || (task.assignee_id ? 'Responsável indisponível' : 'Sem responsável')}${task.created_at ? ` · criada ${formatDateTime(task.created_at)}` : ''}`}),
        el('span',{class:'small',text:{open:'Pendente',done:'Concluída',cancelled:'Cancelada'}[task.status] || 'Situação indisponível'})
      ]),
      el('a',{class:'btn btn-sm btn-secondary',href:ctx.href(`/finance/tasks.html#task-${task.id}`),text:'Abrir tarefa'}),
      edit && task.status !== 'cancelled' ? button(task.status==='open'?'Concluir tarefa':'Reabrir tarefa',{size:'sm',attrs:{'aria-label':`${task.status==='open'?'Concluir tarefa':'Reabrir tarefa'}: ${task.title}`},onClick:event=>change(task,event.currentTarget)}) : null
    ]))) : el('p',{class:'muted',text:'Nenhuma tarefa nesta situação para este contrato.'}));
    more.hidden=!cursor;
  }
  async function load(append=false) {
    if(append && (busy || !cursor))return;
    const mine=++epoch, previous=cursor;
    busy=true;more.disabled=true;root.setAttribute('aria-busy','true');
    if(!append){cursor=null;more.hidden=true;notice.textContent='Consultando o filtro atual…';list.replaceChildren(loading('Consultando tarefas do contrato…'));}
    try {
      const data=await ctx.api(`${endpoint}&status=${filter.value}${append?`&cursor=${encodeURIComponent(previous)}`:''}`);
      if(mine!==epoch)return;
      if(!Array.isArray(data.rows) || !data.page || data.page.limit!==25 || !data.page.has_more && data.page.next_cursor!==null || typeof data.page.has_more!=='boolean' || data.rows.length>25 || !data.rows.every(row=>row.related_type==='contract' && row.related_id===contract.id && row.status===filter.value) || data.page.has_more && (!data.page.next_cursor || append && data.page.next_cursor===previous || !data.rows.length))throw new Error('A continuação das tarefas não foi confirmada. Atualize a lista.');
      const known=new Map((append?rows:[]).map(row=>[row.id,row]));
      for(const row of data.rows)if(row.related_type==='contract' && row.related_id===contract.id && row.status===filter.value)known.set(row.id,row);
      rows=[...known.values()];cursor=data.page.has_more?data.page.next_cursor:null;
      notice.textContent=`${rows.length} ${rows.length===1?'tarefa carregada':'tarefas carregadas'}${cursor?' · há mais neste filtro':''}. Situação consultada no servidor; atualize para rever alterações.`;
      render();
    } catch(error) {
      if(mine===epoch){if(append)render();list.append(errorState({error,onRetry:()=>load(append)}));}
    } finally {if(mine===epoch){busy=false;more.disabled=false;root.removeAttribute('aria-busy');}}
  }
  async function change(task, control) {
    control.disabled=true;notice.textContent='Conferindo a alteração no servidor…';
    const wanted=task.status==='open'?'done':'open';
    try {
      await ctx.api('tasks',{method:'PATCH',body:JSON.stringify({organization_id:ctx.organization.id,task_id:task.id,status:wanted})});
      const result=await ctx.api(`tasks?organization_id=${encodeURIComponent(ctx.organization.id)}&task_id=${encodeURIComponent(task.id)}`);
      if(result.rows?.find(row=>row.id===task.id)?.status!==wanted)throw new Error('Não confirmamos a alteração. Atualize as tarefas antes de tentar novamente.');
      const message=wanted==='done'?'Tarefa concluída. Consulte Concluídas para acompanhar o registro.':'Tarefa reaberta.';
      await load();notice.textContent=message;toast(message);
    } catch(error){await load();notice.textContent=taskChangeError(error);}
    finally{control.disabled=false;}
  }
  if(edit) {
    const form=el('form',{class:'stack',novalidate:true});
    const title=el('input',{name:'title',maxlength:200,required:true});
    const due=el('input',{name:'due_on',type:'date'});
    const assignee=ctx.can('create_rfq')?el('select',{name:'assignee_id'}):null;
    if(assignee){assignee.add(new Option('Sem responsável',''));for(const member of ctx.members || [])if(TASK_EDITORS.includes(member.role))assignee.add(new Option(member.display_name || 'Membro da equipe',member.user_id));}
    const submit=button('Registrar tarefa neste contrato',{variant:'primary',type:'submit',iconName:'plus'});
    const feedback=el('p',{role:'status','aria-live':'polite',class:'muted small'});
    const retry=button('Conferir registro da tarefa',{size:'sm',onClick:()=>form.requestSubmit()});retry.hidden=true;
    form.append(el('h4',{text:'Próxima ação da equipe'}),field({label:'O que precisa ser feito',control:title,required:true}),
      el('div',{class:'field-grid'},[field({label:'Prazo da tarefa',control:due,optionalLabel:true}),assignee?field({label:'Responsável pela tarefa',control:assignee,optionalLabel:true}):null]),
      el('p',{class:'muted small',text:'O vínculo com este contrato é preservado. O responsável é escolhido manualmente; não é herdado da obrigação.'}),feedback,submit,retry);
    let pending=null, saving=false;
    onSubmit(form,async event=>{
      event.preventDefault();if(saving)return;
      if(!pending && title.value.trim().length<2){title.closest('.field').setError('Descreva a próxima ação.');title.focus();return;}
      pending ||= {key:crypto.randomUUID(),body:{organization_id:ctx.organization.id,related_type:'contract',related_id:contract.id,title:title.value.trim(),due_on:due.value || null,...(assignee?.value?{assignee_id:assignee.value}:{})}};
      saving=true;submit.disabled=true;retry.disabled=true;feedback.textContent='Conferindo o registro da tarefa…';
      for(const control of [title,due,assignee].filter(Boolean))control.disabled=true;
      try {
        const data=await ctx.api('tasks',{method:'POST',body:JSON.stringify({...pending.body,idempotency_key:pending.key})});
        if(!data.row?.id)throw new Error('Não confirmamos o registro da tarefa.');
        pending=null;title.value='';due.value='';if(assignee)assignee.value='';retry.hidden=true;
        feedback.textContent='Tarefa registrada neste contrato. Acompanhe-a na lista de pendentes.';filter.value='open';await load();
      }catch(error){
        const unknown=!error.status || error.status>=500 || error.code==='task_creation_unknown';
        if(unknown){feedback.textContent='Não confirmamos o registro. Confira a mesma tentativa antes de criar outra tarefa.';retry.hidden=false;}
        else{pending=null;feedback.textContent=error.message;retry.hidden=true;}
      }finally{
        saving=false;submit.disabled=Boolean(pending);retry.disabled=false;
        for(const control of [title,due,assignee].filter(Boolean))control.disabled=Boolean(pending);
      }
    });
    root.append(el('details', {class:'cc-history'}, [el('summary', {text:'Registrar próxima ação'}), form]));
  }
  load();
  return root;
}
