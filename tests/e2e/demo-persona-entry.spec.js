import {test,expect} from '@playwright/test';
test('persona entry is server-driven and names render as text',async({page})=>{
 const name='<img src=x onerror="window.personaXss=1">';
 await page.route('**/api/auth/demo-personas',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,personas:[{key:'juliana',name,title:'Tesouraria'}]})}));
 await page.route('**/api/auth/demo-login',async r=>{
  expect(r.request().postDataJSON()).toEqual({persona:'juliana'});
  await r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Demonstração indisponível.'})});
 });
 await page.goto('/login.html');
 const panel=page.getByRole('region',{name:'Entrar na demonstração'});
 await expect(panel.getByRole('button')).toHaveText(`${name} · Tesouraria`);
 await expect(panel.locator('img')).toHaveCount(0);
 await panel.getByRole('button').click();
 await expect(panel.getByRole('status')).toHaveText('Demonstração indisponível.');
 expect(await page.evaluate(()=>window.personaXss)).toBeUndefined();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
});
test('no persona capability keeps standard account login',async({page})=>{
 await page.route('**/api/auth/demo-personas',r=>r.fulfill({status:404,body:'{}'}));
 await page.goto('/login.html');
 await expect(page.getByRole('heading',{name:'Entrar na conta'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Entrar na demonstração'})).toHaveCount(0);
});
