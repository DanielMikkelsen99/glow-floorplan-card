const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const base = JSON.parse(fs.readFileSync(__dirname + '/example.json', 'utf8'));
(async () => {
  const b = await chromium.launch(); const page = await b.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + __dirname + '/harness.html');
  await page.evaluate((cfg) => {
    const ed = document.createElement('glow-floorplan-card-editor'); ed.setConfig(cfg); ed.hass = { states: {} };
    ed.addEventListener('config-changed', (e) => { window.__last = e.detail.config; ed.setConfig(e.detail.config); });
    document.body.appendChild(ed);
  }, base);
  const ed = page.locator('glow-floorplan-card-editor');
  await ed.locator('[data-act="add-floor"]').click();
  await ed.locator('[data-act="default-floor"]').click();
  let last = await page.evaluate(() => window.__last);
  console.log('DEFAULT', last.default_floor);
  const opened = await page.evaluate((cfg) => { const c = document.createElement('glow-floorplan-card'); c.setConfig(cfg); c.hass = { states: {} }; document.body.appendChild(c); return c._currentFloor(); }, last);
  console.log('CARD OPENS ON INDEX', opened, 'ERRORS', JSON.stringify(errs));
  await b.close();
})();
