const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('./model.js');

test('historique déterministe, daté et bilan énergétique cohérent', () => {
  assert.equal(M.data.length, 265);
  assert.equal(M.data[0].date, '2026-01-01');
  assert.equal(M.data.at(-1).date, '2026-09-22');
  for (const r of M.data) {
    assert.ok(Math.abs(r.total - r.heating - r.dhw - r.rod) < 1e-9);
    assert.ok(r.thermal > 0 && r.total > 0);
  }
  const total = M.summarize(M.data, 0.25);
  assert.equal(total.cost, total.total * 0.25);
  assert.equal(total.cop, total.thermal / total.total);
  assert.equal(total.savings, null);
  assert.equal(Object.hasOwn(total, 'reference'), false);
});
test('référence nulle et données absentes ne produisent pas Infinity', () => {
  assert.equal(M.compare(10, 0), null);
  assert.equal(M.compare(0, 10), -100);
  assert.equal(M.summarize([], 0.25).cop, null);
  assert.equal(M.summarize([], 0.25).outside, null);
});
test('ECS : référence exacte, baisse simulée et surcoût', () => {
  const s = M.fresh();
  s.dhwTemperature = 55; s.dhwHours = 16.5;
  assert.equal(M.dhw(s).saved, 0);
  s.dhwTemperature = 50; s.dhwHours = 8;
  assert.ok(M.dhw(s).saved > 0);
  s.dhwTemperature = 60; s.dhwHours = 24;
  assert.ok(M.dhw(s).saved < 0);
  s.price = 0;
  assert.equal(M.dhw(s).cost, 0);
});
test('géofencing : tous absents, inertie, retour et bouclage distincts', () => {
  const s = M.fresh();
  s.people.forEach(p => p.home = false);
  let a = M.automation(s);
  assert.equal(a.reduce, false);
  assert.equal(a.loopOff, true);
  s.absenceHours = 6;
  assert.equal(M.automation(s).reduce, true);
  s.people[0].home = true;
  a = M.automation(s);
  assert.equal(a.reduce, false); assert.equal(a.loopOff, false);
  s.people[0].home = false; s.emitter = 'radiator'; s.absenceHours = 4;
  assert.equal(M.automation(s).reduce, true);
  s.geofencing = false;
  assert.equal(M.automation(s).reduce, false);
});
test('prérequis des capteurs de pièces et expiration de fenêtre', () => {
  const s = M.fresh();
  s.rooms[0].windowUntil = s.clock + 30;
  assert.equal(M.automation(s).rooms[0].demand, 0);
  s.clock += 30;
  assert.equal(M.automation(s).rooms[0].window, false);
  s.smartClimate = false;
  const a = M.automation(s);
  assert.equal(a.optimized, false);
  assert.ok(a.rooms.every(r => r.minutes === 0));
});
test('anticipation gère le passage de minuit', () => {
  const s = M.fresh();
  s.arrival = 30; s.clock = 1430;
  s.rooms[0].temperature = 19; s.rooms[0].target = 20;
  const r = M.automation(s).rooms[0];
  assert.equal(r.start, 1350);
  assert.equal(r.preheating, true);
});
test('validation stricte des imports et absence de données arbitraires', () => {
  assert.deepEqual(M.validate(M.fresh()), M.fresh());
  for (const [key, value] of [['price', NaN], ['price', -1], ['days', 12], ['dhwTemperature', 40], ['geofencing', 'yes'], ['month', '2026-09']]) {
    const s = M.fresh(); s[key] = value;
    assert.throws(() => M.validate(s));
  }
  const s = M.fresh(); s.people[0].name = '<script>unsafe</script>';
  assert.equal(M.validate(s).people[0].name, 'Camille');
  assert.throws(() => M.validate({ version: 1 }));
});
test('mois complets, prévision et export CSV', () => {
  assert.equal(M.monthly('2026-02').length, 28);
  assert.equal(M.monthly('2026-08').length, 31);
  assert.equal(M.forecast().length, 7);
  assert.equal(M.forecast()[0].date, '2026-09-23');
  const csv = M.csv(M.monthly('2026-08'), 0.25);
  assert.equal(csv.split('\n').length, 32);
  assert.equal(csv.split('\n')[1].split(',').length, 8);
});
test('tracé standard : résultats numériques, limites et pente', () => {
  for (const [outside, expected] of [[-10, 45], [0, 38], [10, 30], [20, 20]])
    assert.equal(M.curve(outside, 0.8, 0), expected);
  assert.ok(M.curve(0, 0.6, 0) < M.curve(0, 0.8, 0));
  assert.equal(M.curve(-30, 1.6, 5), 55);
  assert.equal(M.curve(30, 0.2, -5), 20);
  assert.equal(M.curve(20, 0, 0.5), 21);
  assert.equal(M.curve(20, 0, 0.5, { variant: 'legacy-pac-0' }), 26);
  assert.throws(() => M.curve(NaN, 0.8, 0));
  assert.throws(() => M.curve(0, 0.8, 0, { minimum: 50, maximum: 30 }));
  assert.throws(() => M.curve(0, 0.8, 0, { variant: 'unknown' }));
});
test('profil PAC ancienne génération : constante et décalage distincts', () => {
  for (const [outside, expected] of [[-10, 43], [0, 38], [10, 33], [20, 25]])
    assert.equal(M.curve(outside, 0.8, 0, { variant: 'legacy-pac-0' }), expected);
  assert.equal(M.curve(0, 0.8, 0, { room: 22 }), 41);
  assert.equal(M.curve(-30, 1.6, 5, { maximum: 35 }), 35);
});
test('compatibilité des scénarios précédents et propagation du profil', () => {
  const previous = M.fresh();
  delete previous.curveVariant; delete previous.curveRoom;
  assert.equal(M.validate(previous).curveVariant, 'standard');
  assert.equal(M.validate(previous).curveRoom, 20);
  const s = M.fresh();
  s.curveVariant = 'legacy-pac-0'; s.curveRoom = 22; s.ihc = false;
  assert.equal(M.automation(s).baseFlow, M.curve(8, s.slope, s.level, { variant: s.curveVariant, room: 22 }));
  assert.equal(M.automation(s).supply, M.automation(s).baseFlow);
  assert.throws(() => M.validate({ ...s, curveVariant: null }));
  assert.throws(() => M.validate({ ...s, curveRoom: 100 }));
});
