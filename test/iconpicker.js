const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(__dirname + '/example.json', 'utf8'));
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 600, height: 1300 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + __dirname + '/harness.html');
  await page.evaluate((cfg) => {
    // Simulate HA lazily defining ha-icon-picker when the entities editor loads.
    window.loadCardHelpers = async () => ({ createCardElement: async () => ({ constructor: { getConfigElement: async () => {
      if (!customElements.get('ha-icon-picker')) customElements.define('ha-icon-picker', class extends HTMLElement {
        connectedCallback() { this.innerHTML = `<input class="stub" placeholder="${this.placeholder}" value="${this.value}">`;
          this.querySelector('input').addEventListener('change', (e) => this.dispatchEvent(new CustomEvent('value-changed', { detail: { value: e.target.value }, bubbles: true, composed: true }))); }
      });
    } } }) });
    const ed = document.createElement('glow-floorplan-card-editor'); ed.style.cssText = 'width:520px;display:block';
    ed.setConfig(cfg); ed.hass = { states: { 'light.kitchen': { state: 'on', attributes: {} } } };
    ed.addEventListener('config-changed', (e) => { window.__last = e.detail.config; ed.setConfig(e.detail.config); });
    document.getElementById('row').appendChild(ed);
  }, cfg);
  const ed = page.locator('glow-floorplan-card-editor');
  const i = cfg.devices.findIndex(d => d.entity === 'light.kitchen');
  const dev = ed.locator(`.stage .dev[data-dev="${i}"]`); const bb = await dev.boundingBox();
  await page.mouse.click(bb.x + bb.width/2, bb.y + bb.height/2); await page.waitForTimeout(400);
  const has = await ed.locator('ha-icon-picker').count();
  console.log('PICKER MOUNTED', has);
  await ed.locator('ha-icon-picker input.stub').fill('mdi:chef-hat'); await ed.locator('ha-icon-picker input.stub').press('Enter');
  await ed.locator('ha-icon-picker input.stub').dispatchEvent('change'); await page.waitForTimeout(200);
  const last = await page.evaluate(() => window.__last);
  console.log('ICON', last && last.devices[i].icon, 'ERRORS', JSON.stringify(errs));
  await b.close();
})();
