const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(__dirname + '/example.json', 'utf8'));
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 600, height: 1100 } });
  await page.goto('file://' + __dirname + '/harness.html');
  await page.evaluate((cfg) => {
    const ed = document.createElement('glow-floorplan-card-editor'); ed.style.cssText='width:520px;display:block';
    ed.setConfig(cfg); ed.hass = { states: {} };
    ed.addEventListener('config-changed', (e) => { window.__last = e.detail.config; ed.setConfig(e.detail.config); });
    document.getElementById('row').appendChild(ed);
  }, cfg);
  const ed = page.locator('glow-floorplan-card-editor');
  const toPx = async (x, y) => { const bb = await ed.locator('.stage svg').boundingBox(); return [bb.x + x/850*bb.width, bb.y + y/1250*bb.height]; };
  const drag = async (from, to, alt) => { const [fx,fy]=await toPx(...from); const [tx,ty]=await toPx(...to);
    if (alt) await page.keyboard.down('Alt');
    await page.mouse.move(fx,fy); await page.mouse.down(); await page.mouse.move(tx,ty,{steps:8}); await page.mouse.up();
    if (alt) await page.keyboard.up('Alt'); await page.waitForTimeout(100); };
  await ed.locator('[data-mode="rooms"]').click();
  const ki = cfg.rooms.findIndex(r => r.name === 'Kitchen');
  await drag([400,1050],[400,1050]); // select kitchen
  // top-right corner (560,938) -> (566,931): expect snaps to x=560 (neighbour bottom-right) y=938 (neighbour top-left)
  await drag([560,938],[566,931]);
  let last = await page.evaluate(() => window.__last); console.log('SNAP', JSON.stringify(last.rooms[ki].points[1]));
  // -> (591, 944): x near 597 (living wall, other room) -> 597? neighbour 560 too far; y 938
  await drag([560,938],[592,943]);
  last = await page.evaluate(() => window.__last); console.log('SNAP2', JSON.stringify(last.rooms[ki].points[1]));
  // Alt: free move
  await drag([597,938],[588,931], true);
  last = await page.evaluate(() => window.__last); console.log('ALT', JSON.stringify(last.rooms[ki].points[1]));
  await b.close();
})();
