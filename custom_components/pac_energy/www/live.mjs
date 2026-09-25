export const fields = {
  outside: { role: 'outside', label: 'Température extérieure (°C)', min: -60, max: 60, step: 0.1 },
  slope: { role: 'curve_slope', label: 'Pente', min: 0, max: 4, step: 0.1 },
  level: { role: 'curve_level', label: 'Décalage (K)', min: -20, max: 40, step: 0.1 },
  curveRoom: { role: 'room_target', label: 'Consigne de chauffage (°C)', min: 5, max: 30, step: 0.1 },
  dhwTemperature: { role: 'dhw_target', label: 'Consigne ECS (°C)', min: 0, max: 100, step: 0.1 },
  coldWater: { role: 'cold_water', label: 'Eau froide (°C)', min: 0, max: 40, step: 0.1 },
  volume: { label: 'Volume journalier supposé (L)', min: 1, max: 2000, step: 1 },
  dhwCop: { label: 'COP ECS constant supposé', min: 0.1, max: 20, step: 0.1 },
  setback: { label: 'Abaissement hypothétique (K)', min: 0, max: 10, step: 0.1 },
};

export function liveValue(hass, contract, role) {
  const state = hass?.states?.[contract?.sources?.[role]];
  if (!state || contract.input_errors?.[role] ||
      ['unknown', 'unavailable'].includes(state.state)) return null;
  if (role === 'presence') return state.state === 'home' || state.state === 'on';
  if (role === 'window') return ['on', 'off'].includes(state.state) ? state.state === 'on' : null;
  if (typeof state.state !== 'string' || !state.state.trim()) return null;
  let value = Number(state.state);
  if (!Number.isFinite(value)) return null;
  const unit = state.attributes?.unit_of_measurement;
  if (['curve_slope', 'dhw_performance'].includes(role))
    return [undefined, null, '', '1'].includes(unit) && value >= 0 &&
      value <= (role === 'curve_slope' ? 4 : 20) ? value : null;
  if (!['°C', '°F', 'K'].includes(unit)) return null;
  if (role === 'curve_level') return unit === '°F' ? value * 5 / 9 : value;
  if (unit === '°F') value = (value - 32) * 5 / 9;
  if (unit === 'K') value -= 273.15;
  return value;
}

export function scenarioValues(hass, contract, overrides) {
  const values = Object.fromEntries(Object.entries(fields).map(([key, field]) => [
    key, Object.hasOwn(overrides, key) ? overrides[key] :
      field.role ? liveValue(hass, contract, field.role) : null,
  ]));
  for (const key of ['presence', 'window'])
    values[key] = Object.hasOwn(overrides, key) ? overrides[key] : liveValue(hass, contract, key);
  return values;
}

export function curveResult(model, values, config) {
  if (!config || !['standard', 'legacy-pac-0'].includes(config.profile) ||
      !Number.isFinite(config.minimum) || !Number.isFinite(config.maximum) ||
      config.minimum < 0 || config.maximum > 100 || config.minimum > config.maximum) return null;
  for (const key of ['outside', 'slope', 'level', 'curveRoom']) {
    const value = values[key], field = fields[key];
    if (!Number.isFinite(value) || value < field.min || value > field.max) return null;
  }
  return model.curve(values.outside, values.slope, values.level, {
    variant: config.profile, minimum: config.minimum, maximum: config.maximum, room: values.curveRoom,
  });
}

export function dhwEstimate(values, baselineTarget) {
  const { volume, coldWater, dhwTemperature, dhwCop } = values;
  const heat = target => Number.isFinite(volume) && volume > 0 &&
    Number.isFinite(coldWater) && Number.isFinite(target) && target >= coldWater
    ? volume * 0.001163 * (target - coldWater) : null;
  const thermal = heat(dhwTemperature), baseline = heat(baselineTarget);
  const electric = amount => amount !== null && Number.isFinite(dhwCop) && dhwCop > 0 ? amount / dhwCop : null;
  return { thermal, electricity: electric(thermal),
    difference: thermal !== null && baseline !== null ? electric(thermal - baseline) : null };
}

export function automationResult(values) {
  if (values.window === true) return { state: 'window', target: null };
  if (values.presence === null || values.window === null) return { state: 'unavailable', target: null };
  if (values.presence) return { state: 'present', target: values.curveRoom };
  if (!Number.isFinite(values.curveRoom) || !Number.isFinite(values.setback))
    return { state: 'unavailable', target: null };
  return { state: 'absent', target: values.curveRoom - values.setback };
}
