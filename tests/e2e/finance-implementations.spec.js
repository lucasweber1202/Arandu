import { test, expect } from '@playwright/test';
import { presentImplementationPage, presentImplementationDetail } from '../../lib/finance/implementation-presenter.mjs';
const ORG='00000000-0000-4000-8000-000000000001', ID='00000000-0000-4000-8000-000000000002';
const plan={id:ID,organization_id:ORG,contract_id:ID,title:'Implantação de crédito',status:'ready_for_acceptance',starts_on:'2026-01-01',target_go_live:'2026-10-10',version:4,owner_id:'u1',template_version:'credit:v1',source_reference:'Contrato testado'};
const ctx={milestones:[{id:'m1',plan_id:ID,position:1,kind:'go_live',status:'completed',due_on:'2026-10-10',evidence_reference:'Comprovante',owner_id:'u1'}],dependencies:[],issues:[],acceptances:[],members:[{user_id:'u1',role:'admin',display_name:'Tesouraria'}],today:'2026-10-05'};
async function setup(page,role='admin') {
 const calls=[];
 await page.route('**/api/finance/**',async route=>{
 const req=route.request(),path=new URL(req.url()).pathname.replace('/api/finance/','');calls.push({path,body:req.postData()?JSON.parse(req.postData()):null});
 const json=v=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,...v})});
 if(path==='organizations')return json({rows:[{id:ORG,kind:'BUYER',legal_name:'Teste'}]});
 if(path==='overview')return json({organization:{id:ORG,kind:'BUYER',legal_name:'Teste'},providers:[],contracts:[],rfqs:[],tasks:[]});
 if(path==='members')return json({rows:[{user_id:'u1',role}],viewer_id:'u1'});
 if(path==='entities')return json({rows:[],scope:'group',can_admin:role==='admin'});
 if(path==='implementations')return json(presentImplementationPage({...ctx,rows:[plan],contracts:[{id:ID,title:'Contrato testado'}],next:null}));
 if(path==='implementations/detail')return json(presentImplementationDetail({...ctx,plan}));
 return json({id:ID,rows:[]});
 });return calls;
}
test('aceite exige confirmação humana e envia versão do plano',async({page})=>{
 const calls=await setup(page);await page.goto(`/finance/implementations.html?id=${ID}`);
 await page.getByRole('dialog').getByRole('button',{name:'Registrar aceite de go-live'}).click();
 const form=page.getByRole('dialog').last();await form.getByLabel('Go-live efetivo').fill('2026-10-05');await form.getByLabel('Referência do aceite').fill('Evidência testada');await form.getByLabel('Confirmação humana').selectOption('true');await form.getByRole('button',{name:/Salvar|Enviar|Registrar|Confirmar/}).click();
 await expect.poll(()=>calls.find(c=>c.path==='implementations/accept')?.body).toMatchObject({plan_id:ID,expected_version:4,confirm:'true'});
});
test('viewer consulta estado e evidência sem poder aceitar',async({page})=>{
 await setup(page,'viewer');await page.goto(`/finance/implementations.html?id=${ID}`);
 await expect(page.getByRole('dialog').getByText(/Pronta para aceite/)).toBeVisible();await expect(page.getByRole('button',{name:'Registrar aceite de go-live'})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
});
test('detalhe composto no servidor não mostra identificador nem instante ISO: contrato pelo nome, data legível, pessoa sem nome neutra',async({page})=>{
 const DEC='00000000-0000-4000-8000-0000000000d7',GHOST='00000000-0000-4000-8000-0000000000e9';
 const real={...plan,decision_id:DEC,updated_at:'2026-10-15T14:32:10.123+00:00',owner_id:GHOST};
 await page.route('**/api/finance/**',async route=>{
  const path=new URL(route.request().url()).pathname.replace('/api/finance/','');
  const json=v=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,...v})});
  if(path==='organizations')return json({rows:[{id:ORG,kind:'BUYER',legal_name:'Teste'}]});
  if(path==='overview')return json({organization:{id:ORG,kind:'BUYER',legal_name:'Teste'},providers:[],contracts:[{id:ID,title:'Adquirência Lumina',product:'acquiring',status:'active'}],rfqs:[],tasks:[]});
  if(path==='members')return json({rows:[{user_id:'u1',role:'admin',display_name:'Tesouraria'}],viewer_id:'u1'});
  if(path==='entities')return json({rows:[],scope:'group',can_admin:true});
  if(path==='implementations')return json(presentImplementationPage({...ctx,rows:[real],contracts:[{id:ID,title:'Adquirência Lumina'}],next:null}));
  // Resposta com texto técnico (formato anterior à #211 ou presenter futuro sem tratamento): a interface protege a tela.
  if(path==='implementations/detail')return json({title:real.title,lines:[`Responsável: ${GHOST}`,`Origem: contrato ${ID} · decisão ${DEC} · Contrato testado · template credit:v1`,`Versão 4 · atualizado ${real.updated_at} · data de referência 2026-10-05`],sections:[{title:'Marcos e dependências',items:[`1. Go-live · Concluído · responsável ${GHOST}`],empty:'Nenhum marco.'}],actions:[]});
  return json({rows:[]});
 });
 await page.goto(`/finance/implementations.html?id=${ID}`);
 const dialog=page.getByRole('dialog');
 await expect(dialog).toContainText('contrato Adquirência Lumina');
 await expect(dialog).toContainText('decisão registrada');
 await expect(dialog).toContainText('Responsável: pessoa não identificada');
 const text=await dialog.innerText();
 expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
 expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
 expect(text).not.toMatch(/template [a-z_]+:v\d/);
 await expect(page.locator('table')).not.toContainText(GHOST);
});
test('detalhe com muitas ações: nenhum botão do rodapé fica fora da tela (celular e desktop)',async({page})=>{
 await setup(page);
 const kinds=['commercial_setup','credentials','integration','merchants','homologation','pricing_activation','settlement_validation','go_live'];
 const milestones=kinds.map((kind,i)=>({id:`m${i}`,plan_id:ID,position:i+1,kind,title:`Marco com nome longo de implantação ${i+1}`,status:'planned',due_on:'2026-11-06',owner_id:'u1',version:1}));
 await page.route('**/api/finance/implementations/detail**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,...presentImplementationDetail({...ctx,plan:{...plan,status:'blocked'},milestones,issues:[{id:'i1',plan_id:ID,title:'Atraso na remessa de terminais (lojas do Nordeste)',status:'open',due_on:'2026-11-01'}]})})}));
 await page.goto(`/finance/implementations.html?id=${ID}`);
 const buttons=page.getByRole('dialog').locator('.drawer-foot button');
 await expect(buttons.first()).toBeVisible();
 const width=await page.evaluate(()=>innerWidth);
 for(const box of await buttons.evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return{l:r.left,r:r.right};}))){expect(box.l).toBeGreaterThanOrEqual(0);expect(box.r).toBeLessThanOrEqual(width+1);}
});
test('registro sem resposta do servidor: o formulário não deixa repetir às cegas e leva a conferir a lista',async({page})=>{
 const calls=await setup(page);
 await page.route('**/api/finance/implementations/accept',route=>{calls.push({path:'implementations/accept'});return route.abort('failed');});
 await page.goto(`/finance/implementations.html?id=${ID}`);
 await page.getByRole('dialog').getByRole('button',{name:'Registrar aceite de go-live'}).click();
 const form=page.getByRole('dialog').last();
 await form.getByLabel('Go-live efetivo').fill('2026-10-05');await form.getByLabel('Referência do aceite').fill('Evidência testada');await form.getByLabel('Confirmação humana').selectOption('true');
 await form.getByRole('button',{name:'Registrar'}).click();
 await expect(form.getByRole('alert')).toContainText('não foi possível confirmar se a operação foi registrada');
 const save=form.getByRole('button',{name:'Confira antes de repetir'});
 await expect(save).toBeDisabled();
 await expect(form.getByLabel('Referência do aceite')).toHaveValue('Evidência testada');
 expect(calls.filter(c=>c.path==='implementations/accept')).toHaveLength(1);
 const lists=calls.filter(c=>c.path==='implementations').length;
 await form.getByRole('button',{name:'Fechar e conferir a lista'}).click();
 await expect.poll(()=>calls.filter(c=>c.path==='implementations').length).toBeGreaterThan(lists);
 expect(calls.filter(c=>c.path==='implementations/accept')).toHaveLength(1);
});
test('registro recusado pelo servidor (4xx) continua editável para corrigir',async({page})=>{
 await setup(page);
 await page.route('**/api/finance/implementations/accept',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({ok:false,error:'Informe a data efetiva do go-live.'})}));
 await page.goto(`/finance/implementations.html?id=${ID}`);
 await page.getByRole('dialog').getByRole('button',{name:'Registrar aceite de go-live'}).click();
 const form=page.getByRole('dialog').last();
 await form.getByLabel('Go-live efetivo').fill('2026-10-05');await form.getByLabel('Referência do aceite').fill('Evidência testada');await form.getByLabel('Confirmação humana').selectOption('true');
 await form.getByRole('button',{name:'Registrar'}).click();
 await expect(form.getByRole('alert')).toContainText('Informe a data efetiva do go-live.');
 await expect(form.getByRole('button',{name:'Registrar'})).toBeEnabled();
});
