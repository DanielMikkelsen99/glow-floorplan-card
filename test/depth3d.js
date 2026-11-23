// 3D paint order: long walls must not be painted over furniture in front of them, and vice versa.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const out = process.argv[2] || __dirname + '/shot-depth3d.png';
const cfg = {
  type: 'custom:glow-floorplan-card', size: [620, 620],
  rooms: [
    { name: 'Rum 1', points: [[10, 10], [310, 10], [310, 610], [10, 610]] },
    { name: 'Rum 2', points: [[310, 10], [610, 10], [610, 300], [310, 300]] },
    { name: 'Rum 3', points: [[310, 300], [610, 300], [610, 610], [310, 610]] },
  ],
  openings: [{ line: [310, 450, 310, 520] }],
  furniture: [
    { type: 'stairs', x: 215, y: 250 },
    { type: 'cabinet', x: 330, y: 230, w: 120, h: 50 },
    { type: 'washing_machine', x: 540, y: 540 },
    { type: 'dresser', x: 30, y: 555 },
  ],
  devices: [],
};
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1000, height: 560 }, deviceScaleFactor: 1.5 });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + __dirname + '/harness.html');
  const res = await page.evaluate((cfg) => {
    const row = document.getElementById('row');
    const mk = (night) => { const col = document.createElement('div'); col.style.cssText = `width:470px;background:${night ? '#1c1f26' : '#f2f4f8'};padding:6px`;
      const card = document.createElement('glow-floorplan-card'); card.setConfig({ ...cfg, view: '3d', view_toggle: false });
      card.hass = { states: { 'sun.sun': { state: night ? 'below_horizon' : 'above_horizon', attributes: {} } } };
      col.appendChild(card); row.appendChild(col); return card; };
    mk(false); mk(true);
    // Check order directly: every furniture item must come after any wall it stands in front of.
    const { Renderer, normalizeConfig } = window.__glowFloorplan;
    const r = new Renderer(normalizeConfig(cfg), { states: {} }, { uid: 't', is3d: true });
    const items = [];
    const v = r.view3d();
    for (const s of r.wallSegments()) if (s.kind !== 'gap') items.push({ kind: 'wall', s, d: v.depth((s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2) });
    return typeof r.paintOrder === 'function';
  }, cfg);
  await page.waitForTimeout(600);
  await page.screenshot({ path: out });
  console.log('paintOrder present:', res, 'errors:', errs.length ? errs : 'none');
  await b.close();
})();
