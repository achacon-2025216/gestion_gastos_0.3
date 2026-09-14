import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centavos, comprobarSaldo, fechaMovimiento } from './movimientoRules.js';

test('rechaza gastar 2000 con 1000 y acepta gastar el saldo exacto', () => {
  assert.throws(() => comprobarSaldo(centavos(1000), centavos(2000)), /Saldo insuficiente/);
  assert.doesNotThrow(() => comprobarSaldo(centavos(1000), centavos(1000)));
  assert.throws(() => comprobarSaldo(0, centavos(0.01)), /Saldo insuficiente/);
});

test('calcula centavos y rechaza montos inválidos', () => {
  assert.equal(centavos('10.29'), 1029);
  for (const value of [0, -1, NaN, Infinity, '', null, true, {}, '1.001', 100000000]) assert.throws(() => centavos(value));
});

test('permite hoy y el pasado, bloquea futuro y fechas inexistentes', () => {
  const now = new Date('2026-01-10T18:00:00Z');
  assert.doesNotThrow(() => fechaMovimiento('2026-01-04', now));
  assert.doesNotThrow(() => fechaMovimiento('2026-01-10', now));
  assert.throws(() => fechaMovimiento('2026-01-11', now), /futuras/);
  for (const value of ['2026-02-30', 'no-fecha', '', null]) assert.throws(() => fechaMovimiento(value, now));
});

test('usa el día de Guatemala cerca de medianoche', () => {
  const now = new Date('2026-01-11T02:00:00Z');
  assert.doesNotThrow(() => fechaMovimiento('2026-01-10', now));
  assert.throws(() => fechaMovimiento('2026-01-11', now), /futuras/);
  assert.doesNotThrow(() => fechaMovimiento(now.toISOString(), now));
  assert.equal(fechaMovimiento('2026-01-10', now).toISOString(), '2026-01-10T12:00:00.000Z');
});
