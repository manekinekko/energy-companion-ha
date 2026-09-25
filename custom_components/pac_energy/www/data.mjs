export const HOUR = 3600000;
export const ENERGY_KEYS = ['electricity', 'thermal', 'heating', 'dhw', 'backup'];
const UNITS = { Wh: 0.001, kWh: 1, MWh: 1000 };

export function energyValue(state) {
  if (!state || !Object.hasOwn(UNITS, state.attributes?.unit_of_measurement) ||
      state.attributes.device_class !== 'energy' ||
      !['total', 'total_increasing'].includes(state.attributes.state_class) ||
      typeof state.state !== 'string' ||
      !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(state.state.trim())) return null;
  const value = Number(state.state);
  const converted = value * UNITS[state.attributes.unit_of_measurement];
  return Number.isFinite(converted) && value >= 0 ? converted : null;
}

export function localDate(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const part = key => parts.find(p => p.type === key).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function midnight(date, timeZone) {
  const target = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 10) !== date)
    throw new Error('Date invalide.');
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const p = Object.fromEntries(format.formatToParts(guess).map(v => [v.type, v.value]));
    const wall = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    if (wall === target) {
      if (guess % HOUR) throw new Error('Statistiques horaires incompatibles avec ce fuseau non entier.');
      return guess;
    }
    guess += target - wall;
  }
  throw new Error('Minuit local ambigu ou inexistant dans ce fuseau.');
}

export function periodWindow({ days = 7, month, timeZone, now = Date.now() }) {
  const today = localDate(now, timeZone);
  let startDate, endDate, previousDate;
  if (month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month >= today.slice(0, 7))
      throw new Error('Choisir un mois terminé.');
    startDate = `${month}-01`;
    const next = new Date(`${startDate}T12:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    endDate = next.toISOString().slice(0, 10);
    const prior = new Date(`${startDate}T12:00:00Z`);
    prior.setUTCMonth(prior.getUTCMonth() - 1);
    previousDate = prior.toISOString().slice(0, 10);
  } else {
    if (![7, 30, 90].includes(days)) throw new Error('Période invalide.');
    endDate = today;
    startDate = shiftDate(today, -days);
    previousDate = shiftDate(startDate, -days);
  }
  return {
    start: midnight(startDate, timeZone), end: midnight(endDate, timeZone),
    previous: midnight(previousDate, timeZone), startDate, endDate, timeZone,
  };
}

export function periodTotal(rows, start, end) {
  if (!Array.isArray(rows) || start >= end || start % HOUR || end % HOUR) return null;
  const selected = rows.filter(r => r.start >= start - HOUR && r.start < end);
  const byStart = new Map(selected.map(r => [r.start, r]));
  if (selected.length !== byStart.size) return null;
  let prior, total = 0;
  for (let at = start - HOUR; at < end; at += HOUR) {
    const row = byStart.get(at);
    if (!row || row.end !== at + HOUR || !Number.isFinite(row.sum)) return null;
    if (prior !== undefined) {
      const change = row.sum - prior;
      if (!Number.isFinite(change) || change < -1e-8) return null;
      total += Math.max(0, change);
      if (!Number.isFinite(total)) return null;
    }
    prior = row.sum;
  }
  return total;
}

export function summarizePeriod(series, sources, window, { tariff, sameScope } = {}) {
  const values = Object.fromEntries(ENERGY_KEYS.map(key => [
    key, sources[key] ? periodTotal(series[sources[key]], window.start, window.end) : null,
  ]));
  const electricity = values.electricity;
  const previous = sources.electricity
    ? periodTotal(series[sources.electricity], window.previous, window.start) : null;
  return {
    ...values, previous,
    detailExceedsTotal: ['heating', 'dhw', 'backup'].filter(key =>
      electricity !== null && values[key] !== null && values[key] > electricity + 1e-8),
    // The selected total already includes its own scope. Never add the backup again.
    cost: electricity !== null && Number.isFinite(tariff) && tariff >= 0 ? electricity * tariff : null,
    cop: sameScope === true && electricity > 0 && values.thermal !== null
      ? values.thermal / electricity : null,
    change: electricity !== null && previous > 0 ? (electricity - previous) / previous * 100 : null,
    savings: null,
  };
}

export async function fetchStatistics(hass, sources, window) {
  const ids = [...new Set(ENERGY_KEYS.map(k => sources[k]).filter(id => id && hass.states[id]))];
  if (!ids.length) throw new Error('Aucune source énergétique accessible.');
  const metadata = await hass.callWS({ type: 'recorder/get_statistics_metadata', statistic_ids: ids });
  const valid = metadata.filter(m => {
    const unit = Object.hasOwn(m, 'statistics_unit_of_measurement')
      ? m.statistics_unit_of_measurement : m.unit_of_measurement;
    return ids.includes(m.statistic_id) && m.has_sum && Object.hasOwn(UNITS, unit);
  }).map(m => m.statistic_id);
  if (!valid.length) throw new Error('Statistiques cumulées indisponibles. Vérifier Recorder et les unités.');
  return hass.callWS({
    type: 'recorder/statistics_during_period',
    start_time: new Date(window.previous - HOUR).toISOString(),
    end_time: new Date(window.end).toISOString(),
    statistic_ids: valid, period: 'hour', units: { energy: 'kWh' }, types: ['sum'],
  });
}

export function dailyRows(series, sources, window) {
  const rows = [];
  for (let date = window.startDate; date < window.endDate; date = shiftDate(date, 1)) {
    const start = midnight(date, window.timeZone);
    const end = midnight(shiftDate(date, 1), window.timeZone);
    rows.push({
      date, ...Object.fromEntries(ENERGY_KEYS.map(key => [
        key, sources[key] ? periodTotal(series[sources[key]], start, end) : null,
      ])),
    });
  }
  return rows;
}
