const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(__dirname + '/example.json', 'utf8'));
cfg.furniture = [
  { type: 'double_bed', x: 362, y: 125 },
  { type: 'dresser', x: 300, y: 270, rotation: 0 },
  { type: 'single_bed', x: 170, y: 82, w: 60, h: 130 },
  { type: 'dining_table', x: 360, y: 360 },
  { type: 'sofa_corner', x: 395, y: 625, rotation: 180 },
  { type: 'coffee_table', x: 420, y: 700 },
  { type: 'armchair', x: 280, y: 780, rotation: 90 },
  { type: 'kitchen_counter', x: 270, y: 1085 },
  { type: 'kitchen_counter', x: 265, y: 950, w: 150, rotation: 180 },
  { type: 'toilet', x: 175, y: 1110, rotation: 90 },
  { type: 'shower', x: 115, y: 1025 },
  { type: 'cabinet', x: 112, y: 640, w: 60, h: 45, rotation: 270 },
  { type: 'sofa_3', x: 640, y: 520, rotation: 90 },
];
cfg.doors = [
  { type: 'door', line: [100, 760, 100, 840], sensor: 'binary_sensor.front_door' },
  { type: 'window', line: [597, 600, 597, 690] },
  { type: 'window', line: [380, 110, 480, 110], leaves: 2 },
];
const S = (night) => ({ 'sun.sun': { state: night ? 'below_horizon' : 'above_horizon', attributes: {} },
  'binary_sensor.front_door': { state: 'on', attributes: {} }, 'vacuum.robot': { state: 'cleaning', attributes: {} },
  'light.kitchen': { state: 'on', attributes: { brightness: 230, color_temp_kelvin: 2700 } },
  'light.bedroom_ceiling': { state: 'on', attributes: { brightness: 180, rgb_color: [140, 90, 255] } },
  'light.corner_1': { state: 'on', attributes: { brightness: 120, rgb_color: [255, 80, 40] } },
  'binary_sensor.living_room_motion': { state: 'on', attributes: {} } });
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.5 });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await page.goto('file://' + __dirname + '/harness.html');
  await page.evaluate(({ cfg, d, n }) => {
    try { localStorage.clear(); } catch (e) {}
    const row = document.getElementById('row'); row.style.flexWrap = 'wrap';
    const mk = (st, bg, view) => { const col = document.createElement('div'); col.className = 'col'; col.style.cssText = `width:470px;background:${bg};padding:6px`;
      const card = document.createElement('glow-floorplan-card'); card.setConfig({ ...cfg, view, view_toggle: true }); card.hass = { states: st };
      card._view = view; card._render(true); col.appendChild(card); row.appendChild(col); return card; };
    mk(d, '#f2f4f8', '2d'); mk(d, '#f2f4f8', '3d'); mk(n, '#1c1f26', '3d');
  }, { cfg, d: S(false), n: S(true) });
  await page.waitForTimeout(900);
  await page.screenshot({ path: __dirname + '/shot-3d.png', fullPage: true });
  // Toggle test on first card
  const c0 = page.locator('glow-floorplan-card').first();
  await c0.locator('.viewbtn').click(); await page.waitForTimeout(200);
  console.log('TOGGLED TO', await c0.evaluate((el) => el._view), 'ICONS', await c0.locator('.dev').count());
  // Editor furniture tab
  await page.evaluate((cfg) => { document.getElementById('row').innerHTML = '';
    const ed = document.createElement('glow-floorplan-card-editor'); ed.style.cssText = 'width:520px;display:block';
    ed.setConfig(cfg); ed.hass = { states: {} }; ed.addEventListener('config-changed', (e) => { window.__last = e.detail.config; ed.setConfig(e.detail.config); });
    document.getElementById('row').appendChild(ed); }, cfg);
  const ed = page.locator('glow-floorplan-card-editor');
  await ed.locator('[data-mode="furniture"]').click();
  await ed.locator('.addfurn').selectOption('sofa_2'); await page.waitForTimeout(200);
  let last = await page.evaluate(() => window.__last); const fi = last.furniture.length - 1;
  console.log('ADDED', JSON.stringify(last.furniture[fi]));
  const bb = await ed.locator('.stage svg').boundingBox(); const px = (x, y) => [bb.x + x / 850 * bb.width, bb.y + y / 1250 * bb.height];
  const f = last.furniture[fi];
  // drag sofa so its top edge is near the living-room top wall (y=525 -> inner face 537)
  await page.mouse.move(...px(f.x + 70, f.y + 37)); await page.mouse.down();
  await page.mouse.move(...px(430, 580), { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(150);
  last = await page.evaluate(() => window.__last); console.log('SNAPPED SOFA', JSON.stringify(last.furniture[fi]));
  await ed.locator('[data-act="rot-right"]').click(); await page.waitForTimeout(150);
  last = await page.evaluate(() => window.__last); console.log('ROTATED', JSON.stringify(last.furniture[fi]));
  await ed.screenshot({ path: __dirname + '/shot-furn-editor.png' });
  console.log('ERRORS', JSON.stringify(errs));
  await b.close();
})();
