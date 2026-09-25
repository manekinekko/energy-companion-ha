import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOUR, energyValue, periodWindow, midnight, periodTotal, summarizePeriod, fetchStatistics, dailyRows } from '../custom_components/pac_energy/www/data.mjs';

const attrs = { device_class: 'energy', state_class: 'total_increasing', unit_of_measurement: 'Wh' };
const rows = (start, end, rate = 1) => Array.from({ length: (end - start) / HOUR + 1 }, (_, i) => ({
  start: start - HOUR + i * HOUR, end: start + i * HOUR, sum: 200 + i * rate,
}));
test('live units and invalid values never become zeros', () => {
  assert.equal(energyValue({ state: '1000', attributes: attrs }), 1);
  for (const state of ['', ' ', 'unknown', 'unavailable', 'NaN', '-1', 'Infinity', '0x10'])
    assert.equal(energyValue({ state, attributes: attrs }), null);
  assert.equal(energyValue({ state: '1e308', attributes: { ...attrs, unit_of_measurement: 'MWh' } }), null);
  assert.equal(energyValue({ state: '10', attributes: { ...attrs, unit_of_measurement: 'W' } }), null);
  assert.equal(energyValue(null), null);
});
test('period bounds are HA-local complete days, including 23h and 25h DST days', () => {
  const march = periodWindow({ month: '2026-03', timeZone: 'Europe/Paris', now: Date.parse('2026-11-02') });
  assert.equal(march.start, Date.parse('2026-02-28T23:00:00Z'));
  assert.equal(march.end, Date.parse('2026-03-31T22:00:00Z'));
  assert.equal((march.end - march.start) / HOUR, 743);
  const october = periodWindow({ month: '2026-10', timeZone: 'Europe/Paris', now: Date.parse('2026-11-02') });
  assert.equal((october.end - october.start) / HOUR, 745);
  const window = periodWindow({ days: 7, timeZone: 'Europe/Paris', now: Date.parse('2026-09-22T23:30:00Z') });
  assert.equal(window.endDate, '2026-09-23');
  assert.equal(window.end, Date.parse('2026-09-22T22:00:00Z'));
  assert.throws(() => midnight('2026-02-30', 'UTC'));
  assert.throws(() => midnight('2026-09-01', 'Asia/Kolkata'), /non entier/);
  assert.throws(() => periodWindow({ month: '2026-09', timeZone: 'UTC', now: Date.parse('2026-09-23') }));
});
test('normalized recorder sums survive raw-counter resets; boundaries and gaps are mandatory', () => {
  const start = Date.parse('2026-09-01'), end = start + 24 * HOUR;
  const data = rows(start, end);
  data[10].state = 0;
  assert.equal(periodTotal(data, start, end), 24);
  for (const broken of [
    data.slice(1), data.slice(0, -1), data.filter((_, i) => i !== 10),
    [...data, data[0]], data.map((r, i) => i === 5 ? { ...r, sum: null } : r),
    data.map((r, i) => i === 5 ? { ...r, sum: 0 } : r),
    data.map((r, i) => i === 5 ? { ...r, end: r.end + 1 } : r),
  ]) assert.equal(periodTotal(broken, start, end), null);
});
test('COP only on matched windows and confirmed scopes; never double-count backup', () => {
  const start = Date.parse('2026-09-01'), end = start + 24 * HOUR;
  const sources = { electricity: 'sensor.e', thermal: 'sensor.t', backup: 'sensor.b' };
  const window = { start, end, previous: start - 24 * HOUR };
  const series = { 'sensor.e': rows(window.previous, end), 'sensor.t': rows(start, end, 3), 'sensor.b': rows(start, end, 0.2) };
  const r = summarizePeriod(series, sources, window, { tariff: 0.25, sameScope: true });
  assert.equal(r.electricity, 24); assert.equal(r.cop, 3); assert.equal(r.cost, 6);
  assert.equal(r.change, 0); assert.equal(r.savings, null);
  assert.equal(summarizePeriod(series, sources, window).cop, null);
  assert.equal(summarizePeriod(series, sources, window).cost, null);
  series['sensor.t'].pop();
  assert.equal(summarizePeriod(series, sources, window, { sameScope: true }).cop, null);
  series['sensor.e'] = rows(window.previous, end, 0);
  assert.equal(summarizePeriod(series, sources, window, { sameScope: true }).cop, null);
});
test('daily exports preserve missing as null and DST day duration', () => {
  const window = periodWindow({ month: '2026-03', timeZone: 'Europe/Paris', now: Date.parse('2026-05-01') });
  const series = { 'sensor.e': rows(window.start, window.end) };
  const daily = dailyRows(series, { electricity: 'sensor.e' }, window);
  assert.equal(daily.length, 31);
  assert.equal(daily.find(r => r.date === '2026-03-29').electricity, 23);
  assert.equal(daily[0].thermal, null);
  series['sensor.e'].splice(50, 1);
  assert.ok(dailyRows(series, { electricity: 'sensor.e' }, window).some(r => r.electricity === null));
});
test('an inconsistent breakdown is flagged without altering the measured total', () => {
  const start = Date.parse('2026-09-01'), end = start + 24 * HOUR;
  const sources = { electricity: 'sensor.e', dhw: 'sensor.d' };
  const series = { 'sensor.e': rows(start, end), 'sensor.d': rows(start, end, 2) };
  const window = { start, end, previous: start - 24 * HOUR };
  const result = summarizePeriod(series, sources, window);
  assert.deepEqual(result.detailExceedsTotal, ['dhw']);
  assert.equal(result.electricity, 24);
  assert.equal(result.dhw, 48);
  series['sensor.d'].pop();
  assert.deepEqual(summarizePeriod(series, sources, window).detailExceedsTotal, []);
});
test('Recorder requests use session, kWh conversion, one preceding boundary and only selected accessible sources', async () => {
  const requests = [];
  const hass = {
    states: { 'sensor.e': {} },
    callWS: async message => {
      requests.push(message);
      return message.type.endsWith('get_statistics_metadata')
        ? [{ statistic_id: 'sensor.e', has_sum: true, unit_of_measurement: 'Wh' }] : {};
    },
  };
  const window = { previous: Date.parse('2026-08-01'), end: Date.parse('2026-09-01') };
  await fetchStatistics(hass, { electricity: 'sensor.e', thermal: 'sensor.secret' }, window);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].statistic_ids, ['sensor.e']);
  assert.deepEqual(requests[1].units, { energy: 'kWh' });
  assert.equal(requests[1].start_time, '2026-07-31T23:00:00.000Z');
  assert.equal(requests[1].end_time, '2026-09-01T00:00:00.000Z');
  assert.ok(requests.every(r => !r.type.includes('service')));
});
test('Recorder metadata accepts current statistics units and rejects missing or incompatible units', async () => {
  const window = { previous: Date.parse('2026-08-01'), end: Date.parse('2026-09-01') };
  for (const [metadata, accepted] of [
    [{ statistics_unit_of_measurement: 'kWh', display_unit_of_measurement: 'MWh' }, true],
    [{ statistics_unit_of_measurement: 'Wh' }, true],
    [{ statistics_unit_of_measurement: 'MWh' }, true],
    [{ unit_of_measurement: 'kWh' }, true],
    [{ statistics_unit_of_measurement: 'W', unit_of_measurement: 'kWh' }, false],
    [{ statistics_unit_of_measurement: null, unit_of_measurement: 'kWh' }, false],
    [{ display_unit_of_measurement: 'kWh' }, false],
    [{ statistics_unit_of_measurement: 'kWh', has_sum: false }, false],
  ]) {
    const requests = [];
    const hass = {
      states: { 'sensor.e': {} },
      callWS: async message => {
        requests.push(message);
        return message.type.endsWith('get_statistics_metadata')
          ? [{ statistic_id: 'sensor.e', has_sum: true, ...metadata }] : {};
      },
    };
    if (accepted) {
      await fetchStatistics(hass, { electricity: 'sensor.e' }, window);
      assert.deepEqual(requests[1].statistic_ids, ['sensor.e']);
      assert.deepEqual(requests[1].units, { energy: 'kWh' });
    } else {
      await assert.rejects(fetchStatistics(hass, { electricity: 'sensor.e' }, window), /Statistiques cumulées indisponibles/);
      assert.equal(requests.length, 1);
    }
  }
});
