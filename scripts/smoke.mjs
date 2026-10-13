import { chromium } from 'playwright';
const paths = process.argv.slice(2);
const BASE = 'http://127.0.0.1:' + (process.env.SMOKE_PORT || 4173);
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
const sample = { id: 'abc-123', name: 'sample', status: 'available', size: 1, created_at: '2026-01-01T00:00:00' };
await page.route('**/api/**', (route) => {
  const url = route.request().url();
  if (route.request().method() !== 'GET') return route.fulfill({ status: 202, json: {} });
  // Generic: respond with every plural key a page may read, containing one sample item
  const keys = ['backups','volumes','snapshots','volume_types','qos_specs','pools','servers','flavors','images','keypairs','server_groups','aggregates','hypervisors','networks','subnets','ports','routers','floatingips','security_groups','policies','rbac_policies','projects','users','groups','roles','domains','role_assignments','containers','stacks','loadbalancers','listeners','pools','members','zones','recordsets','secrets','containers','firewall_groups','firewall_policies','firewall_rules','vpnservices','ikepolicies','ipsecpolicies','ipsec_site_connections','endpoint_groups','shares','share_networks','share_types','share_servers','share_groups','share_group_types','share_instances','clusters','clustertemplates','capsules','hosts','services','segments','notifications','queues','instances','configurations','datastores','nodes','resource_providers','limits','availabilityZoneInfo','availability_zones','metadefs','namespaces','extensions','trunks','qos_policies','bandwidth_limit_rules','dscp_marking_rules','minimum_bandwidth_rules','data','queues','subscriptions','events','resources','backend_pools','storage_pools'];
  const body = Object.fromEntries(keys.map((k) => [k, [sample]]));
  Object.assign(body, { backup: sample, volume: sample, server: sample, project: sample, user: sample, network: sample, router: sample, port: sample, stack: sample, loadbalancer: sample, zone: sample, share: sample, cluster: sample, instance: sample, quota_set: {}, quota: {} });
  return route.fulfill({ status: 200, json: body });
});
await page.goto(BASE + '/auth/login');
await page.evaluate(() => {
  localStorage.setItem('keystone_token', 'fake');
  localStorage.setItem('keystone_token_expires_at', new Date(Date.now() + 3600e3).toISOString());
});
let failed = 0;
for (const p of paths) {
  errors.length = 0;
  await page.goto(BASE + p);
  await page.waitForTimeout(1200);
  const h = await page.locator('h1.page-title').first().textContent({ timeout: 3000 }).catch(() => null);
  const rows = await page.locator('.ant-table-row').count();
  const placeholder = await page.getByText('OpenStack Service').count().catch(() => 0);
  const ok = h && !errors.length && !page.url().includes('/auth/login');
  if (!ok) failed++;
  console.log(ok ? 'OK  ' : 'FAIL', p, '|', h, '| rows', rows, errors.length ? '| ' + errors.join(' || ') : '');
}
await browser.close();
process.exit(failed ? 1 : 0);
