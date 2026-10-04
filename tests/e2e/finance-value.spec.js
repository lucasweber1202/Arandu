import { test, expect } from '@playwright/test';
import { presentValuePage, presentValueDetail } from '../../lib/finance/value-presenter.mjs';
// Mocks usam o apresentador real do servidor: o teste cobre a cópia que o usuário vê.
const ORG='00000000-0000-4000-8000-0000000000a1';
const ID='00000000-0000-4000-8000-0000000000b1';
async function setup(page,{role='admin',fail=false}={}) {
  const calls=[];
  const r={id:ID,title:'Custos documentados',kind:'NEGOTIATED_SAVINGS',currency:'BRL',value_amount:200,comparability:'comparable',status:'active',period_start:'2025-01-01',period_end:'2025-12-31',owner_id:'fixture-owner',created_at:'2026-01-05',contract_id:ID,contract_version:2,baseline:{source:'manual',reference:'BASELINE-TEST',as_of:'2024-12-01',amount:1000,dimensions:{indexer:'fixed'}},target_amount:800,target_dimensions:{indexer:'fixed'},target_snapshot:{terms:{currency:'BRL'},version:2},methodology_snapshot:{formula:'baseline_period_total - target_period_total',verification:'Custos declarados verificados pela empresa'},evidence_reference:'EVIDENCE-TEST',reason:'Redução documentada'};
  await page.route('**/api/finance/**', async(route)=>{
    const req=route.request(); const u=new URL(req.url()); const path=u.pathname.replace('/api/finance/','');
    calls.push({path,method:req.method(),query:Object.fromEntries(u.searchParams),body:req.postData()?JSON.parse(req.postData()):null});
    const json=(v,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(v)});
    if(path==='organizations')return json({ok:true,rows:[{id:ORG,kind:'BUYER',legal_name:'Value test group'}]});
    if(path==='overview')return json({ok:true,organization:{id:ORG,kind:'BUYER',legal_name:'Value test group'},providers:[],contracts:[{id:ID,title:'Contrato teste',status:'active'}],rfqs:[],tasks:[]});
    if(path==='members')return json({ok:true,rows:[{user_id:'u1',role,display_name:'Test actor'}],viewer_id:'u1'});
    if(path==='entities')return json({ok:true,rows:[],scope:'group',can_admin:role==='admin'});
    if(path==='value'&&req.method()==='GET')return fail?json({ok:false,error:'Falha controlada no teste'},503):json({ok:true,...presentValuePage({rows:[r],totals:[{kind:'NEGOTIATED_SAVINGS',currency:'BRL',records:1,comparable:1,value_amount:200},{kind:'COST_AVOIDANCE',currency:'USD',records:1,comparable:0,value_amount:null}],next:null,contracts:[{id:ID,title:'Contrato teste'}]})});
    if(path==='value/detail')return json({ok:true,...presentValueDetail({record:r,methodology:{version:1},observations:[]})});
    if(path==='value'||path==='value/observe'||path==='value/invalidate')return json({ok:true,id:ID},201);
    if(path.startsWith('graph'))return json({ok:true,rows:[],next_offset:null});
    return json({ok:true,rows:[]});
  });
  return calls;
}
test('valor separado por tipo e moeda, filtros no servidor, detalhe com baseline e metodologia',async({page})=>{
  const calls=await setup(page);await page.goto('/finance/value.html');
  await expect(page.getByRole('heading',{name:'Valor de procurement',exact:true})).toBeVisible();
  await expect.poll(async () => page.locator('svg.icon:visible use').first().evaluate((use) => use.ownerSVGElement.getBBox().width)).toBeGreaterThan(0);
  await expect(page.getByRole('heading',{name:'Economia negociada · BRL'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Custo evitado · USD'})).toBeVisible();
  await expect(page.getByText('Sem cálculo defensável')).toBeVisible();
  await page.getByLabel('Período inicial').fill('2025-01-01');await page.getByLabel('Período final').fill('2025-12-31');
  await page.getByLabel('Categoria',{exact:true}).selectOption('credit');
  await page.getByRole('button',{name:'Aplicar filtros'}).click();
  await expect.poll(()=>calls.filter(c=>c.path==='value').at(-1)?.query.start).toBe('2025-01-01');
  expect(calls.filter(c=>c.path==='value').at(-1)?.query.product).toBe('credit');
  await page.getByRole('button',{name:'Ver evidência'}).click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByText(/BASELINE-TEST/)).toBeVisible();
  await expect(dialog.getByText(/Metodologia v1/)).toBeVisible();
  await expect(dialog.getByRole('heading',{name:'Contrato de destino · versão 2'})).toBeVisible();
  await expect(dialog.getByText(/EVIDENCE-TEST/)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
});
test('viewer não recebe ações materiais',async({page})=>{
  await setup(page,{role:'viewer'});await page.goto('/finance/value.html');
  await expect(page.getByRole('button',{name:'Registrar estimativa'})).toHaveCount(0);
  await page.getByRole('button',{name:'Ver evidência'}).click();
  await expect(page.getByRole('button',{name:'Registrar realização verificada'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Invalidar com justificativa'})).toHaveCount(0);
});
test('estimativa incompleta não vira realização automática',async({page})=>{
  const calls=await setup(page);await page.goto('/finance/value.html');
  await page.getByRole('button',{name:'Registrar estimativa'}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel(/^Título/).fill('Economia declarada teste');
  await dialog.getByLabel('Contrato de destino').selectOption(ID);
  await dialog.getByLabel('Início do período').fill('2025-01-01');await dialog.getByLabel('Fim do período').fill('2025-12-31');
  await dialog.getByLabel('Referência do baseline').fill('BASELINE-TEST');await dialog.getByLabel('Data do baseline').fill('2024-12-01');
  await dialog.getByLabel('Custo do baseline').fill('1000');await dialog.getByLabel('Custo de destino').fill('800');
  await dialog.getByLabel('Referência da evidência').fill('EVIDENCE-TEST');await dialog.getByLabel('Justificativa e ajustes').fill('Comparação incompleta teste');
  await dialog.getByRole('button',{name:'Registrar',exact:true}).click();
  await expect.poll(()=>calls.find(c=>c.path==='value'&&c.method==='POST')?.body.comparability).toBe('incomplete');
  expect(calls.some(c=>c.path==='value/observe')).toBe(false);
});

test('indisponibilidade não exibe savings zero e oferece recuperação',async({page})=>{
  await setup(page,{fail:true});await page.goto('/finance/value.html');
  await expect(page.getByRole('button',{name:'Tentar novamente'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Economia negociada · BRL'})).toHaveCount(0);
});
