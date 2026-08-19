import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convert, dimensionOf, supportedUnits } from '../src/units.ts';

test('length: km to m', () => {
  const result = convert(1, 'km', 'm');
  assert.equal(result.value, 1000);
  assert.equal(result.dimension, 'length');
});

test('length: mi to ft', () => {
  const result = convert(1, 'mi', 'ft');
  assert.ok(Math.abs(result.value - 5280) < 1e-6);
});

test('mass: kg to lb', () => {
  const result = convert(1, 'kg', 'lb');
  assert.ok(Math.abs(result.value - 2.20462262) < 1e-6);
});

test('time: h to s', () => {
  const result = convert(2, 'h', 's');
  assert.equal(result.value, 7200);
});

test('same unit is a no-op', () => {
  const result = convert(42, 'm', 'm');
  assert.equal(result.value, 42);
});

test('temperature: C to F', () => {
  assert.equal(convert(100, 'C', 'F').value, 212);
  assert.equal(convert(0, 'C', 'F').value, 32);
});

test('temperature: F to C', () => {
  const result = convert(32, 'F', 'C');
  assert.ok(Math.abs(result.value - 0) < 1e-9);
});

test('temperature: C to K', () => {
  const result = convert(0, 'C', 'K');
  assert.ok(Math.abs(result.value - 273.15) < 1e-9);
});

test('temperature: K to F round trip', () => {
  const kelvin = convert(98.6, 'F', 'K').value;
  const back = convert(kelvin, 'K', 'F').value;
  assert.ok(Math.abs(back - 98.6) < 1e-9);
});

test('temperature result carries dimension "temperature"', () => {
  assert.equal(convert(0, 'C', 'F').dimension, 'temperature');
});

test('dimension mismatch throws', () => {
  assert.throws(() => convert(1, 'km', 'kg'), /量纲不匹配/);
});

test('unknown from-unit throws', () => {
  assert.throws(() => convert(1, 'parsec', 'm'), /未知单位/);
});

test('unknown to-unit throws', () => {
  assert.throws(() => convert(1, 'm', 'parsec'), /未知单位/);
});

test('non-finite value throws', () => {
  assert.throws(() => convert(NaN, 'm', 'km'), /value/);
  assert.throws(() => convert(Infinity, 'm', 'km'), /value/);
});

test('dimensionOf resolves known units', () => {
  assert.equal(dimensionOf('kg'), 'mass');
  assert.equal(dimensionOf('ms'), 'time');
});

test('dimensionOf returns null for unknown units', () => {
  assert.equal(dimensionOf('parsec'), null);
});

test('supportedUnits lists every unit exactly once, including temperature', () => {
  const units = supportedUnits();
  assert.equal(new Set(units).size, units.length);
  for (const u of ['m', 'km', 'kg', 'lb', 's', 'h', 'C', 'F', 'K']) {
    assert.ok(units.includes(u), `expected ${u} in supportedUnits()`);
  }
});
