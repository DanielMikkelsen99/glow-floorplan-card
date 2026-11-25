// Renders images/preview-1.7.png for the README (2D and 3D, by day and at night).
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(__dirname + '/example.json', 'utf8'));
cfg.furniture = [
  { type: 'double_bed', x: 362, y: 125 }, { type: 'dresser', x: 300, y: 270 },
  { type: 'single_bed', x: 170, y: 82, w: 60, h: 130 }, { type: 'dining_table', x: 360, y: 360 },
  { type: 'sofa_corner', x: 395, y: 625, rotation: 180 }, { type: 'coffee_table', x: 420, y: 700 },
  { type: 'armchair', x: 280, y: 780, rotation: 90 }, { type: 'kitchen_counter', x: 270, y: 1085 },
  { type: 'kitchen_counter', x: 265, y: 950, w: 150, rotation: 180 }, { type: 'toilet', x: 175, y: 1110, rotation: 90 },
  { type: 'shower', x: 115, y: 1025 }, { type: 'sofa_3', x: 640, y: 520, rotation: 90 },
  { type: 'stairs_down', x: 290, y: 560, w: 80, h: 220 },
  { type: 'tv', x: 430, y: 845, rotation: 180, entity: 'sensor.tv_power' },
];
const FL = { Living: 'herringbone', Dining: 'wood', Kitchen: 'klinker', WC: 'tiles', Bedroom: 'carpet', Kids: 'laminate', Hall: 'klinker', Sunroom: 'tiles' };
cfg.rooms.forEach((r) => { if (FL[r.name]) r.floor = FL[r.name]; });
cfg.doors = [{ type: 'door', line: [100, 760, 100, 840], sensor: 'binary_sensor.front_door' },
  { type: 'window', line: [597, 600, 597, 690] }, { type: 'window', line: [380, 110, 480, 110], leaves: 2 }];
const S = (night) => ({ 'sun.sun': { state: night ? 'below_horizon' : 'above_horizon', attributes: {} },
  'binary_sensor.front_door': { state: 'on', attributes: {} }, 'sensor.tv_power': { state: '96', attributes: { unit_of_measurement: 'W' } }, 'vacuum.robot': { state: 'cleaning', attributes: {} },
  'light.kitchen': { state: 'on', attributes: { brightness: 230, color_temp_kelvin: 2700 } },
  'light.bedroom_ceiling': { state: 'on', attributes: { brightness: 180, rgb_color: [140, 90, 255] } },
  'light.corner_1': { state: 'on', attributes: { brightness: 120, rgb_color: [255, 80, 40] } },
  'light.dining_table_1': { state: 'on', attributes: { brightness: 255, color_temp_kelvin: 2700 } },
  'light.front_door': { state: night ? 'on' : 'off', attributes: { brightness: 255 } },
  'binary_sensor.living_room_motion': { state: 'on', attributes: {} } });
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1460, height: 800 }, deviceScaleFactor: 1.5 });
  await page.goto('file://' + __dirname + '/harness.html');
  await page.evaluate(({ cfg, d, n }) => {
    try { localStorage.clear(); } catch (e) {}
    // Simple line icons instead of the harness' emoji stand-ins (no MDI font offline).
    const ICON = {
      'mdi:ceiling-light': '<path d="M12 3v4M6 13a6 6 0 0 1 12 0zM9 16a3 3 0 0 0 6 0"/>',
      'mdi:lamp': '<path d="M8 3h8l3 8H5zM12 11v8M8 20h8"/>',
      'mdi:floor-lamp': '<path d="M9 3h6l2 6H7zM12 9v11M8 21h8"/>',
      'mdi:outdoor-lamp': '<path d="M8 6h8v9H8zM10 3h4v3M12 15v6"/>',
      'mdi:robot-vacuum': '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="9" r="2"/>',
      'mdi:robot-mower': '<path d="M4 15h16l-2-6H8zM7 18a1.5 1.5 0 1 0 0.1 0M17 18a1.5 1.5 0 1 0 0.1 0"/>',
      'mdi:string-lights': '<path d="M3 6q9 6 18 0M7 8v3M12 9v3M17 8v3"/>',
    };
    for (const el of document.querySelectorAll('glow-floorplan-card')) el.remove();
    window.__iconSvg = (name) => `<span style="display:inline-flex;width:26px;height:26px;border-radius:50%;background:currentColor;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICON[name] || '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.6 1 2.5h6c0-.9.2-1.7 1-2.5A6 6 0 0 0 12 3z"/>'}</svg></span>`;
    const Orig = customElements.get('ha-icon');
    Orig.prototype.render = function () { this.innerHTML = window.__iconSvg(this.getAttribute('icon')); };
    const row = document.getElementById('row');
    row.style.alignItems = 'stretch';
    const mk = (parent, st, view, night, width) => { const col = document.createElement('div');
      col.style.cssText = `width:${width}px`;
      const card = document.createElement('glow-floorplan-card'); card.setConfig({ ...cfg, view, view_toggle: false });
      if (night) card.style.setProperty('--ha-card-background', '#1f232c');
      card.hass = { states: st }; col.appendChild(card); parent.appendChild(col); };
    const left = document.createElement('div'); left.style.cssText = 'display:flex;flex-direction:column;gap:16px';
    row.appendChild(left);
    mk(left, d, '2d', false, 300); mk(left, n, '2d', true, 300);
    const stack = document.createElement('div'); stack.style.cssText = 'display:flex;flex-direction:column;gap:16px';
    row.appendChild(stack);
    mk(stack, d, '3d', false, 560); mk(stack, n, '3d', true, 560);
  }, { cfg, d: S(false), n: S(true) });
  await page.waitForTimeout(1200);
  const box = await page.evaluate(() => {
    const rs = [...document.querySelectorAll('glow-floorplan-card')].map((c) => c.getBoundingClientRect());
    const x = Math.min(...rs.map((r) => r.left)), y = Math.min(...rs.map((r) => r.top));
    return { x, y, width: Math.max(...rs.map((r) => r.right)) - x, height: Math.max(...rs.map((r) => r.bottom)) - y };
  });
  await page.setViewportSize({ width: 1460, height: Math.ceil(box.y + box.height + 40) });
  await page.screenshot({ path: (process.argv[2] || __dirname + '/../images/preview-1.7.png'), clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 } });
  await b.close();
})();
