const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(__dirname + '/../daniel_live.json', 'utf8'));
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1.5 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + __dirname + '/harness.html');
  await page.evaluate((cfg) => {
    const st = { 'sun.sun': { state: 'below_horizon', attributes: {} }, 'light.kokken': { state: 'on', attributes: { brightness: 255, color_temp_kelvin: 2400 } },
      'light.stuebord': { state: 'on', attributes: { brightness: 200, color_temp_kelvin: 2700 } }, 'light.sovevaerelse_loft': { state: 'on', attributes: { brightness: 90, rgb_color: [255, 30, 30] } } };
    const col = document.createElement('div'); col.style.cssText = 'width:820px;background:#111;padding:6px';
    const card = document.createElement('glow-floorplan-card'); card.setConfig({ ...cfg, view: '3d' }); card._view = '3d'; card.hass = { states: st };
    col.appendChild(card); document.getElementById('row').appendChild(col);
  }, cfg);
  await page.waitForTimeout(600);
  await page.locator('glow-floorplan-card').screenshot({ path: __dirname + '/shot-live3d.png' });
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
