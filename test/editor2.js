const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(__dirname + '/example.json', 'utf8'));
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 600, height: 1100 }, deviceScaleFactor: 1.5 });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type()==='error' && errs.push(m.text()));
  await page.goto('file://' + __dirname + '/harness.html');
  await page.evaluate((cfg) => {
    const ed = document.createElement('glow-floorplan-card-editor');
    ed.style.width = '520px'; ed.style.display = 'block';
    ed.setConfig(cfg); ed.hass = { states: { 'sun.sun': { state: 'above_horizon', attributes: {} }, 'light.kitchen': { state: 'on', attributes: { brightness: 255, rgb_color: [40,200,120] } } } };
    ed.addEventListener('config-changed', (e) => { window.__last = e.detail.config; ed.setConfig(e.detail.config); });
    document.getElementById('row').appendChild(ed);
  }, cfg);
  const ed = page.locator('glow-floorplan-card-editor');
  const svgBox = async () => ed.locator('.stage svg').boundingBox();
  const toPx = async (x, y) => { const bb = await svgBox(); return [bb.x + x / 850 * bb.width, bb.y + y / 1250 * bb.height]; };
  const drag = async (from, to, shot) => {
    const [fx, fy] = await toPx(...from); const [tx, ty] = await toPx(...to);
    await page.mouse.move(fx, fy); await page.mouse.down();
    await page.mouse.move((fx+tx)/2, (fy+ty)/2, { steps: 6 }); await page.mouse.move(tx, ty, { steps: 6 });
    await page.waitForTimeout(80);
    if (shot) await ed.screenshot({ path: __dirname + '/' + shot });
    await page.mouse.up(); await page.waitForTimeout(150);
  };
  // 1) Rooms mode: drag the Kitchen room 60 units right and 8 down (should snap back to y alignment).
  await ed.locator('[data-mode="rooms"]').click();
  const ki = cfg.rooms.findIndex(r => r.name === 'Kitchen');
  await drag([400, 1050], [462, 1058]);
  let last = await page.evaluate(() => window.__last);
  console.log('KITCHEN', JSON.stringify(last.rooms[ki].points), 'lamp', JSON.stringify(last.devices.find(d => d.entity === 'light.kitchen')));
  // 2) Corner drag: kitchen top-right corner near 560+60=620,938 -> move to (603, 931): expect x snaps to 597 (living wall) and y to 938 (neighbour)
  await drag([620, 938], [603, 931], 'shot-corner.png');
  last = await page.evaluate(() => window.__last);
  console.log('KITCHEN CORNER', JSON.stringify(last.rooms[ki].points));
  // 3) Openings: select first opening (horizontal at y=525) and drag its right end to (590, 531): expect y=525, x snap 597
  await ed.locator('[data-mode="openings"]').click();
  await drag([428, 525], [428, 525]); // click to select
  await drag([584, 525], [594, 532], 'shot-opening.png');
  last = await page.evaluate(() => window.__last);
  console.log('OPENING', JSON.stringify(last.openings[0]));
  // 4) Add opening and screenshot panel
  await ed.locator('[data-act="add-op"]').click(); await page.waitForTimeout(150);
  last = await page.evaluate(() => window.__last);
  console.log('OPENINGS N', last.openings.length, JSON.stringify(last.openings.at(-1)));
  await ed.screenshot({ path: __dirname + '/shot-openings.png' });
  console.log('ERRORS', JSON.stringify(errs));
  await b.close();
})();
