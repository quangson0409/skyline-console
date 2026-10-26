import { chromium } from 'playwright';
const B = 'http://127.0.0.1:' + (process.env.PORT || 3002);
const out = process.env.OUT;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const api = []; page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) api.push(r.status() + ' ' + r.request().method() + ' ' + r.url().replace(B, '').slice(0, 110)); });
await page.goto(B + '/auth/login'); await page.waitForTimeout(1500);
await page.locator('#domain').fill('mkst-domain');
const inputs = await page.locator('input:visible').count();
console.log('login inputs', inputs);
await page.locator('#username').fill('robin');
await page.locator('#password').fill('Robin@2o26');
await page.locator('button[type=submit]').first().click();
await page.waitForTimeout(4000);
console.log('after login url', page.url());
for (const p of (process.env.PAGES || '').split(',').filter(Boolean)) {
  await page.goto(B + p); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(2500);
  const name = p.replace(/[/?=&]/g, '_');
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
  console.log('shot', p, '->', page.url());
}
console.log('api errors:', [...new Set(api)].slice(0, 25).join('\n  '));
console.log('page errors:', errors.slice(0, 5));
const ls = await page.evaluate(() => ({ roles: localStorage.getItem('keystone_current_project'), endpoints: Object.keys(JSON.parse(localStorage.getItem('skyline_endpoints') || '{}')) }));
console.log(JSON.stringify(ls));
await browser.close();
