// Ctrl+C / Ctrl+V of a selected item, 90° turn of doors, door -> opening -> door.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const cfg = JSON.parse(require('fs').readFileSync(__dirname + '/example.json', 'utf8'));
cfg.doors = [{ type: 'door', line: [100, 760, 100, 840] }];
cfg.furniture = [{ type: 'sofa_3', x: 300, y: 600 }];
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 600, height: 1300 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + __dirname + '/harness.html');
  await page.evaluate((cfg) => {
    const ed = document.createElement('glow-floorplan-card-editor');
    ed.style.width = '520px'; ed.style.display = 'block';
    ed.setConfig(cfg); ed.hass = { states: {} };
    ed.addEventListener('config-changed', (e) => { window.__last = e.detail.config; ed.setConfig(e.detail.config); });
    document.getElementById('row').appendChild(ed);
    window.__ed = ed;
  }, cfg);
  const ed = page.locator('glow-floorplan-card-editor');
  const last = () => page.evaluate(() => window.__last);
  // Furniture: select, copy, paste twice.
  await ed.locator('[data-mode="furniture"]').click();
  await page.evaluate(() => { window.__ed._sel = { kind: 'furn', i: 0 }; window.__ed._render(); });
  await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v'); await page.keyboard.press('Control+v');
  console.log('FURN', JSON.stringify((await last()).furniture));
  // Door: copy and paste.
  await ed.locator('[data-mode="doors"]').click();
  await page.evaluate(() => { window.__ed._sel = { kind: 'door', i: 0 }; window.__ed._render(); });
  await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v');
  console.log('DOORS', JSON.stringify((await last()).doors));
  // Turn the pasted door 90°.
  await ed.locator('[data-act="rot-line"]').click();
  console.log('ROT', JSON.stringify((await last()).doors[1]));
  // Make it an opening, then back to a door.
  await ed.locator('[data-w="type"]').selectOption('opening');
  let l = await last(); console.log('AS OPENING', JSON.stringify(l.doors.length), JSON.stringify(l.openings.at(-1)));
  await ed.locator('[data-act="op-to-door"]').click();
  l = await last(); console.log('BACK TO DOOR', JSON.stringify(l.doors.at(-1)), 'openings', l.openings.length);
  // Typing Ctrl+V in a field must not paste an item.
  const before = (await last()).doors.length;
  await ed.locator('[data-w="sensor"]').click(); await page.keyboard.press('Control+v');
  console.log('IN FIELD unchanged', (await last()).doors.length === before);
  console.log('ERRORS', errs);
  await b.close();
})();
