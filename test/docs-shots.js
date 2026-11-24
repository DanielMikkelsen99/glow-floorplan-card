// Renders the README images: images/editor.png (editor, door panel) and images/depth.png (3D close-up).
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
];
cfg.doors = [{ type: 'door', line: [100, 760, 100, 840], sensor: 'binary_sensor.front_door' },
  { type: 'window', line: [597, 600, 597, 690] }, { type: 'window', line: [380, 110, 480, 110], leaves: 2 },
  { type: 'door', line: [470, 938, 400, 938] }];
const states = { 'sun.sun': { state: 'above_horizon', attributes: {} }, 'binary_sensor.front_door': { state: 'off', attributes: {} },
  'light.kitchen': { state: 'on', attributes: { brightness: 230, color_temp_kelvin: 2700 } },
  'light.dining_table_1': { state: 'on', attributes: { brightness: 255, color_temp_kelvin: 2700 } },
  'light.corner_1': { state: 'on', attributes: { brightness: 140, rgb_color: [255, 120, 60] } } };
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 1.5 });
  await page.goto('file://' + __dirname + '/harness.html');
  // Editor with the new door turned into an active selection.
  await page.evaluate(({ cfg, states }) => {
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
    for (const el of document.querySelectorAll('glow-floorplan-card')) el.remove();
    const ed = document.createElement('glow-floorplan-card-editor');
    ed.id = 'ed'; ed.style.cssText = 'width:560px;display:block;background:#fff;padding:12px;border-radius:16px';
    ed.setConfig(cfg); ed.hass = { states };
    ed.addEventListener('config-changed', (e) => ed.setConfig(e.detail.config));
    document.getElementById('row').appendChild(ed);
    ed._mode = 'doors'; ed._sel = { kind: 'door', i: 3 }; ed._render();
  }, { cfg, states });
  await page.waitForTimeout(800);
  await page.locator('#ed').screenshot({ path: __dirname + '/../images/editor.png' });
  // 3D close-up: living room with the stairwell, lit lamps, shadows.
  await page.evaluate(({ cfg, states }) => {
    document.getElementById('ed').remove();
    const card = document.createElement('glow-floorplan-card');
    card.id = 'c3'; card.style.cssText = 'width:1100px;display:block';
    card.setConfig({ ...cfg, view: '3d', view_toggle: false, show_names: false });
    card.hass = { states };
    document.getElementById('row').appendChild(card);
  }, { cfg, states });
  await page.waitForTimeout(1000);
  const bb = await page.locator('#c3').boundingBox();
  await page.screenshot({ path: __dirname + '/../images/depth.png', clip: { x: bb.x + bb.width * 0.25, y: bb.y + bb.height * 0.22, width: bb.width * 0.5, height: bb.height * 0.5 } });
  await b.close();
})();
