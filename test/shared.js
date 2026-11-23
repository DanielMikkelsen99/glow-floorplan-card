const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(__dirname + '/example.json', 'utf8'));
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + __dirname + '/harness.html');
  const res = await p.evaluate(async (cfg) => {
    const lovelace = { views: [{ sections: [{ cards: [{ type: 'heading' }, cfg] }] }] };
    let asked = null;
    const card = document.createElement('glow-floorplan-card');
    card.setConfig({ type: 'custom:glow-floorplan-card', layout_from: 'dashboard-home', title: 'Tablet' });
    card.hass = { states: { 'sun.sun': { state: 'above_horizon', attributes: {} } }, callWS: async (m) => { asked = m; return lovelace; } };
    document.body.appendChild(card);
    await new Promise(r => setTimeout(r, 300));
    return { asked, rooms: card.shadowRoot.querySelectorAll('svg.plan polygon').length, devs: card.shadowRoot.querySelectorAll('.dev').length, title: card.shadowRoot.querySelector('.card-header')?.textContent, warn: card.shadowRoot.querySelector('.warn')?.textContent };
  }, cfg);
  console.log(JSON.stringify(res), 'ERRORS', JSON.stringify(errs));
  await b.close();
})();
