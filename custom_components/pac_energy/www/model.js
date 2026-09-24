(function (root) {
  'use strict';
  const defaults = {
    version: 1, price: 0.2516, days: 30, category: 'total',
    smartClimate: true, emitter: 'floor', geofencing: true,
    lowerAway: true, stopLoop: true, absenceHours: 2,
    ihc: true, preheat: true, windowDetection: true,
    people: [{ name: 'Camille', home: true }, { name: 'Alex', home: false }],
    rooms: [
      { name: 'Séjour', temperature: 19.4, target: 20, windowUntil: 0 },
      { name: 'Bureau', temperature: 19.2, target: 20, windowUntil: 0 },
      { name: 'Chambre', temperature: 18.5, target: 19, windowUntil: 0 }
    ],
    clock: 360, arrival: 420, slope: 0.8, level: 0,
    curveVariant: 'standard', curveRoom: 20,
    dhwTemperature: 52, dhwHours: 8, volume: 120, dhwCop: 2.8,
    history: [], month: '2026-08'
  };
  function fresh() { return JSON.parse(JSON.stringify(defaults)); }
  function finite(value, min, max, name) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
      throw new Error(`${name} doit être compris entre ${min} et ${max}.`);
    return value;
  }
  function validate(input) {
    if (!input || typeof input !== 'object' || input.version !== 1)
      throw new Error('Format de scénario non reconnu.');
    const s = fresh();
    const ranges = {
      price: [0, 2], absenceHours: [0, 72], clock: [0, 1000000], arrival: [0, 1439],
      slope: [0.2, 1.6], level: [-5, 5], dhwTemperature: [50, 60],
      dhwHours: [1, 24], volume: [50, 300], dhwCop: [1, 5]
    };
    for (const [key, range] of Object.entries(ranges))
      s[key] = finite(input[key], ...range, key);
    if (![7, 30, 90].includes(input.days)) throw new Error('Période non reconnue.');
    s.days = input.days;
    for (const key of ['smartClimate', 'geofencing', 'lowerAway', 'stopLoop', 'ihc', 'preheat', 'windowDetection']) {
      if (typeof input[key] !== 'boolean') throw new Error(`Valeur invalide : ${key}.`);
      s[key] = input[key];
    }
    if (!['floor', 'radiator'].includes(input.emitter)) throw new Error('Émetteur non reconnu.');
    s.emitter = input.emitter;
    if (!['total', 'heating', 'dhw', 'rod'].includes(input.category)) throw new Error('Usage non reconnu.');
    s.category = input.category;
    const variant = input.curveVariant === undefined ? 'standard' : input.curveVariant;
    if (!['standard', 'legacy-pac-0'].includes(variant)) throw new Error('Variante de courbe non reconnue.');
    s.curveVariant = variant;
    s.curveRoom = input.curveRoom === undefined ? 20 : finite(input.curveRoom, 16, 23, 'Consigne de courbe');
    if (!/^2026-0[1-8]$/.test(input.month)) throw new Error('Mois de démonstration non reconnu.');
    s.month = input.month;
    if (!Array.isArray(input.people) || input.people.length !== 2) throw new Error('Deux profils fictifs requis.');
    s.people = input.people.map((p, i) => {
      if (typeof p.home !== 'boolean') throw new Error('Présence invalide.');
      return { name: defaults.people[i].name, home: p.home };
    });
    if (!Array.isArray(input.rooms) || input.rooms.length !== 3) throw new Error('Trois pièces requises.');
    s.rooms = input.rooms.map((r, i) => ({
      name: defaults.rooms[i].name,
      temperature: finite(r.temperature, 10, 30, 'Température'),
      target: finite(r.target, 16, 23, 'Consigne'),
      windowUntil: finite(r.windowUntil, 0, 1000000, 'Fin de fenêtre')
    }));
    if (!Array.isArray(input.history) || input.history.length > 100) throw new Error('Historique invalide.');
    s.history = input.history.map(h => {
      if (!h || typeof h.text !== 'string' || h.text.length > 180 || typeof h.at !== 'string' || h.at.length > 40)
        throw new Error('Entrée historique invalide.');
      return { text: h.text, at: h.at };
    });
    return s;
  }
  function demand(outside, day = 0) {
    const thermalHeating = Math.max(0, 19 - outside) * 3.4;
    const rod = thermalHeating * (outside < 3 ? 0.085 : 0.012);
    const copHeating = Math.max(2.3, Math.min(4.8, 3.3 + outside * 0.065));
    const heating = (thermalHeating - rod) / copHeating;
    const thermalDhw = 6.8 + Math.sin(day * 1.4) * 0.5;
    const dhw = thermalDhw / 2.8;
    return { heating, dhw, rod, total: heating + dhw + rod, thermal: thermalHeating + thermalDhw };
  }
  const data = Array.from({ length: 265 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10);
    const outside = 12 - 8 * Math.cos(2 * Math.PI * (i - 15) / 365) + 2 * Math.sin(i * 0.7);
    return { date, outside, ...demand(outside, i) };
  });
  function summarize(rows, price) {
    const out = { heating: 0, dhw: 0, rod: 0, total: 0, thermal: 0, outside: 0, count: rows.length };
    for (const row of rows) for (const key of ['heating', 'dhw', 'rod', 'total', 'thermal', 'outside']) out[key] += row[key];
    out.outside = rows.length ? out.outside / rows.length : null;
    out.cop = out.total > 0 ? out.thermal / out.total : null;
    out.cost = out.total * price;
    out.savings = null;
    return out;
  }
  function compare(current, baseline) { return baseline > 0 ? (current - baseline) / baseline * 100 : null; }
  function dhw(s) {
    const electrical = (temperature, hours) => (
      s.volume * 0.001163 * (temperature - 12) +
      1.8 * ((temperature - 20) / 35) * hours / 24
    ) / s.dhwCop;
    const before = electrical(55, 16.5) * 365;
    const after = electrical(s.dhwTemperature, s.dhwHours) * 365;
    return { before, after, saved: before - after, cost: after * s.price, savedCost: (before - after) * s.price };
  }
  function curve(outside, slope, level, options = {}) {
    const room = options.room === undefined ? 20 : options.room;
    const minimum = options.minimum === undefined ? 20 : options.minimum;
    const maximum = options.maximum === undefined ? 55 : options.maximum;
    const variant = options.variant === undefined ? 'standard' : options.variant;
    finite(outside, -60, 60, 'Température extérieure');
    finite(room, 5, 30, 'Consigne ambiante');
    finite(slope, 0, 4, 'Pente');
    finite(level, -20, 40, 'Niveau');
    finite(minimum, 0, 100, 'Départ minimal');
    finite(maximum, minimum, 100, 'Départ maximal');
    if (!['standard', 'legacy-pac-0'].includes(variant)) throw new Error('Variante de courbe non reconnue.');
    // Preserve the single-precision operations and rounding of the client chart.
    const f = Math.fround;
    const delta = f(f(outside) - f(room));
    const coefficient = variant === 'legacy-pac-0' ? 1.148987 : 1.4347;
    const quadratic = f(f(f(0.0002479) * delta) * delta);
    const polynomial = f(quadratic + f(f(f(0.021) * delta) + f(coefficient)));
    let temperature = f(f(f(room) + f(level)) - f(polynomial * f(f(slope) * delta)));
    if (variant === 'legacy-pac-0') temperature = f(temperature + f(5));
    return Math.max(f(minimum), Math.min(Math.round(temperature), f(maximum)));
  }
  function automation(s) {
    const away = s.people.every(p => !p.home);
    const minHours = s.emitter === 'floor' ? 6 : 4;
    const reduce = s.geofencing && s.lowerAway && away && s.absenceHours >= minHours;
    const loopOff = s.geofencing && s.stopLoop && away;
    const rooms = s.rooms.map(r => {
      const window = s.smartClimate && s.windowDetection && r.windowUntil > s.clock;
      const target = r.target - (reduce ? 1 : 0);
      const deficit = Math.max(0, target - r.temperature);
      const minutes = s.smartClimate && s.preheat && !window ?
        Math.round(deficit * (s.emitter === 'floor' ? 120 : 60)) : 0;
      const start = ((s.arrival - minutes) % 1440 + 1440) % 1440;
      const clock = s.clock % 1440;
      const untilArrival = (s.arrival - clock + 1440) % 1440;
      return { ...r, target, window, deficit, minutes, start,
        preheating: minutes > 0 && untilArrival > 0 && untilArrival <= minutes,
        demand: window ? 0 : Math.min(100, Math.round(deficit * 70)) };
    });
    const baseFlow = curve(8, s.slope, s.level, { room: s.curveRoom, variant: s.curveVariant });
    const optimized = s.smartClimate && s.ihc;
    const demandMax = Math.max(...rooms.map(r => r.demand));
    const supply = optimized ? Math.max(20, Math.min(baseFlow, 25 + demandMax * 0.15)) : baseFlow;
    return { away, minHours, reduce, loopOff, rooms, supply, baseFlow, optimized };
  }
  function forecast() {
    return [13, 12, 10, 9, 11, 14, 12].map((outside, i) => ({
      date: new Date(Date.UTC(2026, 8, 23 + i)).toISOString().slice(0, 10),
      outside, ...demand(outside, i)
    }));
  }
  function monthly(month) { return data.filter(d => d.date.startsWith(month)); }
  function csv(rows, price) {
    return '\uFEFFdate,chauffage_compresseur_kWh,ECS_kWh,appoint_kWh,total_kWh,chaleur_kWh,exterieur_C,cout_scenario_EUR\n' +
      rows.map(r => [r.date, ...['heating', 'dhw', 'rod', 'total', 'thermal', 'outside'].map(k => r[k].toFixed(3)), (r.total * price).toFixed(3)].join(',')).join('\n');
  }
  const api = { defaults, fresh, validate, data, demand, summarize, compare, dhw, curve, automation, forecast, monthly, csv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PacModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
