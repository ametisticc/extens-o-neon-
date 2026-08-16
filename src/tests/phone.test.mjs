// ============================================================
// Runner de testes unitários (sem dependências npm)
// Roda com: npm test  (usa node --test nativo)
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from '../lib/phone.js';

test('normalizePhone: remove caracteres e aplica DDI 55', () => {
  assert.equal(normalizePhone('5511999999999'), '5511999999999');
  assert.equal(normalizePhone('+55 11 99999-9999'), '5511999999999');
  assert.equal(normalizePhone('(11) 99999-9999'), '5511999999999');
  assert.equal(normalizePhone('005511999999999'), '5511999999999');
  assert.equal(normalizePhone('11999999999'), '5511999999999');
});

test('normalizePhone: retorna null para números inválidos', () => {
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone('123'), null);
  assert.equal(normalizePhone('abc'), null);
  assert.equal(normalizePhone(undefined), null);
  assert.equal(normalizePhone(null), null);
});
