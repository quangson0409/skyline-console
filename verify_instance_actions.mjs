import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:3000/auth/login');
  
  // Inject real auth credentials directly into localStorage
  await page.evaluate(() => {
    localStorage.setItem('keystone_token', 'gAAAAABqzaFxlFjy0Be1qoAr3lSfMi7ricEgCUVirfwdnD9IKbJMx0zg7ras8R29Rztrfl9_DbEKW3ctcKX2UYoeTlt3KvhFU7pG7edpaXuFk7wCefgSOwhbxe77HR0JmhdEgEAAzDfyXluQddtZMnTvtmRnThhPCJqmWo95yO-WwDqEtl4xTwTTw8CLyQZw2Jh_jbpwVoyh');
    localStorage.setItem('keystone_username', 'admin');
    localStorage.setItem('keystone_domain', 'Default');
    localStorage.setItem('keystone_current_project', JSON.stringify({
      id: '99b1fbbf5b3a4b6486288d842a33781e',
      name: 'admin'
    }));
  });

  console.log('Navigating to http://127.0.0.1:3000/compute/instance ...');
  await page.goto('http://127.0.0.1:3000/compute/instance', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Take screenshot of table with real live OpenStack data
  await page.screenshot({ path: 'C:/Users/sonbq/.gemini/antigravity-ide/brain/263b9f46-ab36-4a56-9894-3d36b248871a/scratch/test_instance_live_table.png' });
  console.log('Saved test_instance_live_table.png');

  // Find More Actions button (...) in the first row
  const actionButton = page.locator('table tbody tr:first-child .ant-dropdown-trigger');
  if (await actionButton.count() > 0) {
    console.log('Clicking More Actions dropdown...');
    await actionButton.first().click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'C:/Users/sonbq/.gemini/antigravity-ide/brain/263b9f46-ab36-4a56-9894-3d36b248871a/scratch/test_dropdown_open.png' });
    console.log('Saved test_dropdown_open.png');
  }

  await browser.close();
  console.log('Browser test finished successfully.');
})();
