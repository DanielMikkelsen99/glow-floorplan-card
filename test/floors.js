const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const base = JSON.parse(fs.readFileSync(__dirname + '/example.json', 'utf8'));
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1450, height: 950 }, deviceScaleFactor: 1.4 });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await page.goto('file://' + __dirname + '/harness.html');
  // 1) Editor: start from single-floor config, add a floor, rename it, add furniture there.
  await page.evaluate((cfg) => {
    try { localStorage.clear(); } catch (e) {}
    const ed = document.createElement('glow-floorplan-card-editor'); ed.style.cssText = 'width:520px;display:block';
    ed.setConfig(cfg); ed.hass = { states: {} };
    ed.addEventListener('config-changed', (e) => { window.__last = e.detail.config; ed.setConfig(e.detail.config); });
    document.getElementById('row').appendChild(ed);
  }, base);
  const ed = page.locator('glow-floorplan-card-editor');
  await ed.locator('[data-act="add-floor"]').click(); await page.waitForTimeout(150);
  await ed.locator('.floorname').fill('Kælder'); await ed.locator('.floorname').dispatchEvent('change'); await page.waitForTimeout(100);
  await ed.locator('[data-act="floor-left"]').click(); await page.waitForTimeout(100);
  await ed.locator('[data-mode="rooms"]').click(); await ed.locator('[data-act="add-room"]').click(); await page.waitForTimeout(100);
  await ed.locator('[data-mode="furniture"]').click();
  for (const t of ['washing_machine', 'dryer', 'stairs', 'desk']) { await ed.locator('.addfurn').selectOption(t); await page.waitForTimeout(80); }
  let last = await page.evaluate(() => window.__last);
  console.log('FLOORS', last.floors.map(f => `${f.name}:${(f.rooms||[]).length}r/${(f.furniture||[]).length}f`).join(' | '), 'default', last.default_floor, 'toplevel rooms?', 'rooms' in last);
  await ed.screenshot({ path: __dirname + '/shot-floors-editor.png' });
  // spread the furniture in the basement for the screenshot
  last.floors[0].furniture = [
    { type: 'washing_machine', x: 380, y: 480 }, { type: 'dryer', x: 440, y: 480 },
    { type: 'stairs', x: 300, y: 430 }, { type: 'desk', x: 470, y: 560, rotation: 0 } ];
  last.floors[0].rooms[0].points = [[280, 410], [600, 410], [600, 700], [280, 700]]; last.floors[0].rooms[0].name = 'Vaskerum';
  last.floors[1].furniture = [{ type: 'stairs', x: 140, y: 650, rotation: 0 }, { type: 'desk', x: 300, y: 130 }];
  last.floors[0].devices = [{ entity: 'switch.vask', x: 405, y: 640, icon: 'mdi:washing-machine' }];
  // 2) Card with floors: tabs, activity dot, 3D of basement
  await page.evaluate((cfg) => {
    const row = document.getElementById('row'); row.innerHTML = '';
    const st = { 'sun.sun': { state: 'above_horizon', attributes: {} }, 'switch.vask': { state: 'on', attributes: {} },
      'light.kitchen': { state: 'on', attributes: { brightness: 255, color_temp_kelvin: 2700 } } };
    for (const v of ['2d', '3d']) {
      const col = document.createElement('div'); col.className = 'col'; col.style.width = '470px';
      const card = document.createElement('glow-floorplan-card'); card.setConfig(cfg); card._view = v; card.hass = { states: st };
      col.appendChild(card); row.appendChild(col); window['__c' + v] = card;
    }
  }, last);
  await page.waitForTimeout(400);
  const c2 = page.locator('glow-floorplan-card').first();
  console.log('TABS', await c2.locator('.floorbar button').allInnerTexts(), 'DOTS', await c2.locator('.floorbar .dot').count());
  await page.screenshot({ path: __dirname + '/shot-floors-main.png' });
  await page.locator('glow-floorplan-card').nth(0).locator('.floorbar button').first().click();
  await page.locator('glow-floorplan-card').nth(1).locator('.floorbar button').first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: __dirname + '/shot-floors-basement.png' });
  console.log('ERRORS', JSON.stringify(errs));
  await b.close();
})();
