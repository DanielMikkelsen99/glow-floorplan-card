const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(__dirname + '/../daniel_live.json', 'utf8'));
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1300, height: 900 }, deviceScaleFactor: 1.4 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + __dirname + '/harness.html');
  await page.evaluate((cfg) => {
    const mk = (night, v) => { const st = { 'sun.sun': { state: night ? 'below_horizon' : 'above_horizon', attributes: {} },
      'light.kokken': { state: 'on', attributes: { brightness: 255, color_temp_kelvin: 2400 } }, 'light.stuebord': { state: 'on', attributes: { brightness: 220, color_temp_kelvin: 2700 } },
      'light.sovevaerelse_loft': { state: 'on', attributes: { brightness: 150, rgb_color: [255, 40, 40] } }, 'light.spisestuebord_1': { state: 'on', attributes: { brightness: 255, color_temp_kelvin: 2700 } },
      'binary_sensor.gangen_bevaegelse': { state: 'on', attributes: {} } };
      const col = document.createElement('div'); col.style.cssText = `width:400px;background:${night ? '#111' : '#f2f4f8'};padding:6px`;
      const card = document.createElement('glow-floorplan-card'); card.setConfig(cfg); card._view = v; card.hass = { states: st };
      col.appendChild(card); document.getElementById('row').appendChild(col); };
    mk(false, '2d'); mk(true, '2d'); mk(true, '3d');
  }, cfg);
  await page.waitForTimeout(600);
  await page.screenshot({ path: __dirname + '/shot-walls2d.png' });
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
