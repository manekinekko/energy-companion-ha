import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../demo/model.js';
import { liveValue, scenarioValues, curveResult, dhwEstimate, automationResult } from '../custom_components/pac_energy/www/live.mjs';

test('live inputs normalize absolute temperatures and differences, never invent defaults', () => {
  const contract = { sources: { outside: 'sensor.example', curve_level: 'sensor.example' } };
  const hass = { states: { 'sensor.example': { state: '32', attributes: { unit_of_measurement: '°F' } } } };
  assert.equal(liveValue(hass, contract, 'outside'), 0);
  assert.equal(liveValue(hass, contract, 'curve_level'), 32 * 5 / 9);
  assert.equal(scenarioValues(hass, contract, {}).volume, null);
  assert.equal(scenarioValues(hass, contract, {}).dhwCop, null);
  assert.equal(scenarioValues(hass, contract, {}).curveRoom, null);
  for (const state of ['', 'unknown', 'unavailable', 'nan', 'Infinity']) {
    hass.states['sensor.example'].state = state;
    assert.equal(liveValue(hass, contract, 'outside'), null);
  }
  hass.states['sensor.example'] = { state: '273.15', attributes: { unit_of_measurement: 'K' } };
  assert.equal(liveValue(hass, contract, 'outside'), 0);
  assert.equal(liveValue(hass, contract, 'curve_level'), 273.15);
  contract.input_errors = { outside: 'invalid_domain' };
  assert.equal(liveValue(hass, contract, 'outside'), null);
});

test('unmodified fields follow HA; explicit local overrides survive updates and source loss', () => {
  const contract = { sources: { curve_slope: 'number.example' } };
  const hass = { states: { 'number.example': { state: '0.6', attributes: {} } } };
  const overrides = { slope: 1.2 };
  assert.equal(scenarioValues(hass, contract, {}).slope, 0.6);
  hass.states['number.example'].state = '0.7';
  assert.equal(scenarioValues(hass, contract, overrides).slope, 1.2);
  assert.equal(scenarioValues(hass, contract, {}).slope, 0.7);
  delete hass.states['number.example'];
  assert.equal(scenarioValues(hass, contract, {}).slope, null);
  assert.equal(scenarioValues(hass, contract, overrides).slope, 1.2);
});

test('curve needs all real or explicitly assumed inputs and explicit profile and bounds', () => {
  const values = { outside: 0, slope: 0.8, level: 0, curveRoom: 20 };
  const config = { profile: 'standard', minimum: 20, maximum: 55 };
  assert.equal(curveResult(globalThis.PacModel, values, config), 38);
  for (const key of Object.keys(values))
    assert.equal(curveResult(globalThis.PacModel, { ...values, [key]: null }, config), null);
  assert.equal(curveResult(globalThis.PacModel, values, { ...config, profile: 'unknown' }), null);
  assert.equal(curveResult(globalThis.PacModel, values, { ...config, minimum: null }), null);
  assert.equal(curveResult(globalThis.PacModel, { ...values, curveRoom: 40 }, config), null);
});

test('DHW uses actual baseline target and explicit assumptions, without demo losses or annual savings', () => {
  const values = { dhwTemperature: 50, coldWater: 10, volume: 100, dhwCop: 2 };
  const result = dhwEstimate(values, 55);
  assert.equal(result.thermal, 100 * 0.001163 * 40);
  assert.equal(result.electricity, result.thermal / 2);
  assert.ok(Math.abs(result.difference - (-100 * 0.001163 * 5 / 2)) < 1e-12);
  assert.equal(dhwEstimate(values, null).difference, null);
  for (const key of ['coldWater', 'volume', 'dhwTemperature', 'dhwCop'])
    assert.equal(dhwEstimate({ ...values, [key]: null }, 55).electricity, null);
  assert.equal(dhwEstimate({ ...values, coldWater: 60 }, 55).thermal, null);
});

test('automation uses selected context only, missing context never means absence', () => {
  const values = { presence: false, window: false, curveRoom: 22, setback: 1 };
  assert.deepEqual(automationResult(values), { state: 'absent', target: 21 });
  assert.equal(automationResult({ ...values, presence: null }).state, 'unavailable');
  assert.equal(automationResult({ ...values, window: null }).state, 'unavailable');
  assert.equal(automationResult({ ...values, setback: null }).state, 'unavailable');
  assert.equal(automationResult({ ...values, window: true }).state, 'window');
});
