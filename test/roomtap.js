// Room tap switches every glowing device placed in the room.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const cfg = JSON.parse(require('fs').readFileSync(__dirname + '/example.json', 'utf8'));
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 900, height: 1200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + __dirname + '/harness.html');
  const res = await page.evaluate(async (cfg) => {
    for (const el of document.querySelectorAll('glow-floorplan-card')) el.remove();
    const calls = [];
    const states = {};
    cfg.devices.forEach((d) => (states[d.entity] = { state: 'off', attributes: {} }));
    const card = document.createElement('glow-floorplan-card');
    card.setConfig({ ...cfg, view: '2d', view_toggle: false });
    card.hass = { states, callService: (...a) => calls.push(a) };
    document.body.appendChild(card);
    await new Promise((r) => setTimeout(r, 300));
    const out = {};
    const hits = [...card.shadowRoot.querySelectorAll('.room-hit[data-room]')];
    for (const h of hits) {
      const room = cfg.rooms[Number(h.dataset.room)];
      calls.length = 0;
      const bb = h.getBoundingClientRect();
      const ev = (t) => h.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: bb.x + 5, clientY: bb.y + 5 }));
      ev('pointerdown'); ev('pointerup'); h.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
      out[room.name] = calls.map((c) => c[1] + ':' + c[2].entity_id.join(','));
    }
    return out;
  }, cfg);
  console.log(JSON.stringify(res, null, 1));
  console.log('ERRORS', errors);
  await b.close();
})();
