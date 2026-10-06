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
