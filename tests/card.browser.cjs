const { test } = require('node:test');
const assert = require('node:assert/strict');
const { firefox } = require('playwright');
const { mkdir, readFile } = require('node:fs/promises');

test('real-mode card, unavailable paths, local scenarios, themes and multiple instances', { timeout: 120000 }, async () => {
  const browser = await firefox.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:8767/')) external.push(request.url()); });
    await page.goto('http://127.0.0.1:8767/?scoutTheme=light');
    const card = page.locator('pac-energy-card');
    await card.getByText('168', { exact: false }).first().waitFor();
    assert.equal(await card.locator('h1').textContent(), 'Energy Assistant');
    assert.doesNotMatch(await card.locator('.body').textContent(), /PAC Energy/);
    assert.match(await card.locator('.body').textContent(), /DONNÉES HA/);
    assert.match(await card.locator('.kpis').textContent(), /168[\s\S]*42[\s\S]*3/);
    assert.equal(await card.locator('nav button').count(), 6);
    assert.equal(await page.evaluate(() => requests.length), 2);
    await card.getByRole('button', { name: 'Simulateurs', exact: true }).click();
    assert.equal(await card.locator('#curve-result').textContent(), 'Indisponible ');
    await page.evaluate(() => {
      hass.states['sensor.example_status'].attributes.curve = { profile: 'standard', minimum: 20, maximum: 55 };
      card.hass = hass;
    });
    assert.equal(await card.locator('#curve-result').textContent(), '38 °C');
    await card.locator('#slope').fill('1.2');
    await card.locator('#slope').dispatchEvent('change');
    assert.notEqual(await card.locator('#curve-result').textContent(), '38 °C');
    await card.getByRole('button', { name: 'Conserver le scénario de courbe' }).click();
    assert.match(await card.locator('.body').textContent(), /Courbe simulée : pente 1.2/);
    await card.getByRole('button', { name: 'Automatismes', exact: true }).click();
    await card.locator('[data-person="0"]').click();
    await card.locator('#absenceHours').fill('8');
    await card.locator('#absenceHours').dispatchEvent('change');
    assert.match(await card.locator('.body').textContent(), /Abaissement de 1 °C simulé/);
    await card.locator('[data-window="0"]').click();
    assert.match(await card.locator('.body').textContent(), /Pause simulée/);
    await card.getByRole('button', { name: 'Rapports mensuels' }).click();
    await card.getByRole('button', { name: 'Exporter CSV réel' }).waitFor();
    const download = page.waitForEvent('download');
    await card.getByRole('button', { name: 'Exporter CSV réel' }).click();
    const file = await download;
    assert.match(file.suggestedFilename(), /energy-assistant-live-/);
    const csv = await readFile(await file.path(), 'utf8');
    assert.match(csv, /electricity_kWh,thermal_kWh/);
    await page.evaluate(() => { window.statisticsGap = true; });
    await card.getByRole('button', { name: 'Actualiser les statistiques' }).click();
    await page.waitForFunction(() => !card.loading);
    assert.equal(await page.evaluate(() => card.result.electricity), null);
    await page.evaluate(() => { window.rejectStatistics = true; });
    await card.getByRole('button', { name: 'Actualiser les statistiques' }).click();
    await card.getByRole('alert').filter({ hasText: 'Recorder non disponible' }).waitFor();
    assert.match(await card.locator('.kpis').textContent(), /Indisponible/);
    await page.evaluate(() => {
      window.rejectStatistics = false; window.statisticsGap = false;
      hass.states['sensor.example_electricity'].state = 'unavailable';
      hass.states['sensor.example_status'].attributes.input_errors = { electricity: 'unavailable' };
      card.hass = hass;
    });
    await card.getByRole('alert').filter({ hasText: 'Source indisponible' }).waitFor();
    await page.evaluate(() => {
      hass.states['sensor.example_electricity'].state = '12345';
      hass.states['sensor.example_status'].attributes.input_errors = {};
      card.hass = hass;
    });
    await card.getByRole('button', { name: 'Vue d’ensemble', exact: true }).click();
    await page.waitForFunction(() => !card.loading);
    await mkdir('screenshots', { recursive: true });
    await page.screenshot({ path: 'screenshots/card-light.png', fullPage: true });
    await page.evaluate(() => { hass.themes.darkMode = true; document.documentElement.dataset.theme = 'dark'; card.hass = hass; });
    assert.equal(await card.getAttribute('dark'), '');
    await page.screenshot({ path: 'screenshots/card-dark.png', fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    for (const tab of ['Vue d’ensemble', 'Analyses', 'Simulateurs', 'Automatismes', 'Rapports mensuels', 'Home Assistant']) {
      await card.getByRole('button', { name: tab, exact: true }).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, tab);
      assert.equal(await card.locator('h1').textContent(), 'Energy Assistant');
    }
    await card.getByRole('button', { name: 'Vue d’ensemble', exact: true }).click();
    await page.screenshot({ path: 'screenshots/card-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 812, height: 375 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.evaluate(() => {
      card.style.setProperty('--primary-text-color', 'rgb(245, 245, 245)');
      card.style.setProperty('--primary-background-color', 'rgb(20, 20, 20)');
      card.hass = hass;
    });
    assert.equal(await card.locator('.body').evaluate(el => getComputedStyle(el).color), 'rgb(245, 245, 245)');
    await page.evaluate(() => {
      const second = document.createElement('pac-energy-card');
      second.setConfig({ entity: 'sensor.example_status' }); second.hass = hass; document.body.append(second);
      card.remove();
    });
    await page.waitForFunction(() => !document.querySelector('pac-energy-card').loading);
    assert.equal(await page.locator('pac-energy-card').count(), 1);
    await page.evaluate(() => {
      delete hass.states['sensor.example_status'];
      document.querySelector('pac-energy-card').hass = hass;
    });
    await page.getByRole('alert').filter({ hasText: 'Entité État Energy Assistant absente' }).waitFor();
    assert.doesNotMatch(await page.locator('pac-energy-card .body').textContent(), /12345|168 kWh/);
    assert.ok(await page.evaluate(() => requests.every(r => ['recorder/get_statistics_metadata', 'recorder/statistics_during_period'].includes(r.type))));
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
