const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(__dirname + '/example.json', 'utf8'));
cfg.doors = [
  { type: 'door', line: [100, 760, 100, 840], sensor: 'binary_sensor.front_door' },        // front door, open
  { type: 'door', line: [245, 700, 245, 780], swing: -1 },                                  // hall -> living, closed
  { type: 'window', line: [597, 600, 597, 690] },                                           // living window closed
  { type: 'window', line: [380, 110, 480, 110], leaves: 2, sensor: 'binary_sensor.bedroom_window' }, // bedroom window open
  { type: 'door', line: [480, 910, 560, 910], leaves: 2, sensor: 'binary_sensor.garden_door' },     // closed with sensor off
  { type: 'window', line: [100, 1060, 100, 1130], swing: 0 },                               // fixed WC window
];
const S = (night) => {
  const st = { 'sun.sun': { state: night ? 'below_horizon' : 'above_horizon', attributes: {} },
    'binary_sensor.front_door': { state: 'on', attributes: { friendly_name: 'Hoveddør' } },
    'binary_sensor.bedroom_window': { state: 'on', attributes: {} },
    'binary_sensor.garden_door': { state: 'off', attributes: {} },
    'vacuum.robot': { state: 'cleaning', attributes: {} },
    'lawn_mower.mower': { state: 'error', attributes: {} },
    'light.kitchen': { state: 'on', attributes: { brightness: 200, color_temp_kelvin: 2700 } } };
  return st;
};
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1350, height: 1000 }, deviceScaleFactor: 1.5 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + __dirname + '/harness.html');
  await page.evaluate(({ cfg, d, n }) => {
    const row = document.getElementById('row');
    for (const [st, bg] of [[d, '#f2f4f8'], [n, '#1c1f26']]) {
      const col = document.createElement('div'); col.className = 'col'; col.style.background = bg;
      const card = document.createElement('glow-floorplan-card'); card.setConfig(cfg); card.hass = { states: st };
      card.addEventListener('hass-action', (e) => (window.__act = e.detail));
      col.appendChild(card); row.appendChild(col);
    }
    const col = document.createElement('div'); col.className = 'col'; col.style.width = '480px';
    const ed = document.createElement('glow-floorplan-card-editor'); ed.setConfig(cfg); ed.hass = { states: d };
    ed.addEventListener('config-changed', (e) => { window.__last = e.detail.config; ed.setConfig(e.detail.config); });
    col.appendChild(ed); row.appendChild(col);
  }, { cfg, d: S(false), n: S(true) });
  await page.waitForTimeout(900);
  const ed = page.locator('glow-floorplan-card-editor');
  await ed.locator('[data-mode="doors"]').click();
  const bb = await ed.locator('.stage svg').boundingBox();
  const px = (x, y) => [bb.x + x / 850 * bb.width, bb.y + y / 1250 * bb.height];
  await page.mouse.click(...px(100, 800)); await page.waitForTimeout(200);
  await ed.locator('[data-act="flip-swing"]').click(); await page.waitForTimeout(200);
  const last = await page.evaluate(() => window.__last);
  console.log('FRONT DOOR AFTER FLIP', JSON.stringify(last.doors[0]));
  // tap the front door on the day card -> more-info of sensor
  const card = page.locator('glow-floorplan-card').first();
  const cb = await card.locator('svg.plan').boundingBox();
  await page.mouse.click(cb.x + 100 / 850 * cb.width, cb.y + 800 / 1250 * cb.height); await page.waitForTimeout(300);
  console.log('ACT', JSON.stringify(await page.evaluate(() => window.__act)));
  await page.screenshot({ path: __dirname + '/shot-doors.png' });
  console.log('ERRORS', JSON.stringify(errs));
  await b.close();
})();
