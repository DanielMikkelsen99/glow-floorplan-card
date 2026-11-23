const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(__dirname + '/example.json', 'utf8'));

function states(night) {
  const S = {};
  const add = (id, state, attributes = {}) => (S[id] = { entity_id: id, state, attributes: { friendly_name: id, ...attributes } });
  add('sun.sun', night ? 'below_horizon' : 'above_horizon');
  add('light.bedroom_ceiling', 'on', { brightness: 200, rgb_color: [120, 80, 255] });
  add('light.dining_table_1', 'on', { brightness: 255, color_temp_kelvin: 2700 });
  add('light.dining_table_2', 'on', { brightness: 120, color_temp_kelvin: 2700 });
  add('light.dining_window', 'off');
  add('light.living_table', 'off');
  add('light.corner_1', 'on', { brightness: 90, rgb_color: [255, 60, 40] });
  add('light.corner_2', 'off');
  add('light.garden_door', 'off');
  add('light.kids_ceiling', 'off');
  add('switch.kids_lamp', 'on');
  add('light.front_door', night ? 'on' : 'off', { brightness: 255, color_temp_kelvin: 3000 });
  add('vacuum.robot', 'cleaning');
  add('sensor.living_room_temperature', '20.1', { unit_of_measurement: '°C' });
  add('sensor.hallway_temperature', '19.4', { unit_of_measurement: '°C' });
  add('light.kitchen', 'on', { brightness: 255, rgb_color: [40, 200, 120] });
  add('lawn_mower.mower', 'error');
  add('switch.christmas_lights', night ? 'on' : 'off');
  add('binary_sensor.living_room_motion', 'on');
  add('binary_sensor.hallway_motion', 'off');
  add('binary_sensor.kitchen_motion', 'off');
  add('binary_sensor.kids_motion', 'off');
  add('binary_sensor.dining_motion', 'off');
  add('light.living_room', 'on'); add('light.dining_room', 'on'); add('light.kids_room', 'on');
  return S;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 }, deviceScaleFactor: 1.5 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + __dirname + '/harness.html');
  await page.evaluate(({ cfg, day, night }) => {
    const row = document.getElementById('row');
    const actions = (window.__actions = []);
    for (const [S, bg] of [[day, '#f2f4f8'], [night, '#1c1f26']]) {
      const col = document.createElement('div'); col.className = 'col'; col.style.background = bg; col.style.padding = '8px';
      const card = document.createElement('glow-floorplan-card');
      card.setConfig(cfg);
      card.hass = { states: S, callWS: async () => ({}) };
      card.addEventListener('hass-action', (e) => actions.push(e.detail));
      col.appendChild(card); row.appendChild(col);
    }
    const col = document.createElement('div'); col.className = 'col'; col.style.width = '420px';
    const ed = document.createElement('glow-floorplan-card-editor');
    ed.setConfig(cfg); ed.hass = { states: day };
    ed.addEventListener('config-changed', (e) => (window.__last = e.detail.config));
    col.appendChild(ed); row.appendChild(col);
  }, { cfg, day: states(false), night: states(true) });
  await page.waitForTimeout(1100);
  await page.screenshot({ path: __dirname + '/shot-cards.png', fullPage: true });

  // Tap test: click the kitchen lamp on the day card.
  const card = page.locator('glow-floorplan-card').first();
  const idx = cfg.devices.findIndex((d) => d.entity === 'light.kitchen');
  await card.locator(`.dev[data-dev="${idx}"]`).click();
  await page.waitForTimeout(400);
  const acts = await page.evaluate(() => window.__actions);
  console.log('ACTIONS', JSON.stringify(acts));

  // Drag test in editor: move the airplane 60 units left.
  const ed = page.locator('glow-floorplan-card-editor');
  const ai = cfg.devices.findIndex((d) => d.entity === 'switch.kids_lamp');
  const dev = ed.locator(`.stage .dev[data-dev="${ai}"]`);
  const box = await dev.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 15, box.y + box.height / 2 + 10, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2 - 30, box.y + box.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const last = await page.evaluate(() => window.__last);
  console.log('AFTER DRAG', last && JSON.stringify(last.devices.find((d) => d.entity === 'switch.kids_lamp')));

  // Room mode: select Stue and screenshot editor.
  await ed.locator('[data-mode="rooms"]').click();
  await page.waitForTimeout(200);
  const stueIdx = cfg.rooms.findIndex((r) => r.name === 'Living');
  await ed.locator(`.room-pick[data-pick="${stueIdx}"]`).click({ force: true });
  await page.waitForTimeout(300);
  await ed.screenshot({ path: __dirname + '/shot-editor.png' });
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})();
