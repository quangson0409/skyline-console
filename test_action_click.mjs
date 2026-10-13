import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:3000/auth/login');
  await page.evaluate(() => {
    localStorage.setItem('keystone_token', 'gAAAAABqzaFxlFjy0Be1qoAr3lSfMi7ricEgCUVirfwdnD9IKbJMx0zg7ras8R29Rztrfl9_DbEKW3ctcKX2UYoeTlt3KvhFU7pG7edpaXuFk7wCefgSOwhbxe77HR0JmhdEgEAAzDfyXluQddtZMnTvtmRnThhPCJqmWo95yO-WwDqEtl4xTwTTw8CLyQZw2Jh_jbpwVoyh');
    localStorage.setItem('keystone_username', 'admin');
    localStorage.setItem('keystone_domain', 'Default');
    localStorage.setItem('keystone_current_project', JSON.stringify({
      id: '99b1fbbf5b3a4b6486288d842a33781e',
      name: 'admin'
    }));
  });

  await page.goto('http://127.0.0.1:3000/compute/instance', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Click More Actions dropdown in row 1
  const actionButton = page.locator('table tbody tr:first-child .ant-dropdown-trigger');
  await actionButton.first().click();
  await page.waitForTimeout(600);

  // Click 'Attach Volume'
  console.log('Clicking Attach Volume...');
  const attachVolumeItem = page.locator('.ant-dropdown-menu-item:has-text("Attach Volume")');
  if (await attachVolumeItem.count() > 0) {
    await attachVolumeItem.first().click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'C:/Users/sonbq/.gemini/antigravity-ide/brain/263b9f46-ab36-4a56-9894-3d36b248871a/scratch/test_attach_volume_modal.png' });
    console.log('Saved test_attach_volume_modal.png');
  }

  await browser.close();
  console.log('Action modal test done.');
})();
