'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  requireHttpsUrl,
  requireSid,
  requireE164,
  optionalAreaCode,
  requireHealthToken,
  optionalInstanceId,
  requireBooleanFlag,
} = require('../src/validate.js');

test('requireHttpsUrl accepts safe HTTPS URLs, strips one trailing slash', () => {
  assert.equal(requireHttpsUrl('X', 'https://a.twil.io'), 'https://a.twil.io');
  assert.equal(requireHttpsUrl('X', 'https://a.twil.io/'), 'https://a.twil.io');
});

test('requireHttpsUrl rejects malformed, credentialed, queried, and placeholder values', () => {
  for (const bad of [
    undefined, null, '', 'http://a.twil.io', 'ftp://x', 'x.twil.io', 42, {},
    'https://user:pass@a.twil.io', 'https://a.twil.io/?token=x',
    'https://emergency-line-xxxx.twil.io', 'https://example.com',
  ]) {
    assert.throws(() => requireHttpsUrl('X', bad), /X (?:is missing or invalid|still contains)/);
  }
});

test('SID and E.164 validators accept exact formats and reject examples', () => {
  assert.equal(requireSid('ACCOUNT', `AC${'a1'.repeat(16)}`, 'AC'), `AC${'a1'.repeat(16)}`);
  assert.equal(requireE164('PHONE', '+12025550123'), '+12025550123');
  for (const bad of ['AC1', `SK${'a'.repeat(32)}`, `AC${'x'.repeat(32)}`]) {
    assert.throws(() => requireSid('ACCOUNT', bad, 'AC'), /ACCOUNT/);
  }
  for (const bad of ['5551234567', '+1', '+01234567890', '+1555ABC1234', '+15551234567', '+1555123456789012']) {
    assert.throws(() => requireE164('PHONE', bad), /PHONE/);
  }
});

test('area code, health token, instance ID, and boolean flag validation is strict', () => {
  assert.equal(optionalAreaCode(415), '415');
  assert.equal(optionalAreaCode(''), undefined);
  for (const bad of ['12', '012', 'abc', '4155']) assert.throws(() => optionalAreaCode(bad), /AREA_CODE/);

  const token = '8fN!2qP$7vL@4zR#9mT%6kW&3cY*5hJ?';
  assert.equal(requireHealthToken('HEALTH_TOKEN', token), token);
  for (const bad of ['', 'a'.repeat(32), 'replace_with_long_random_token']) {
    assert.throws(() => requireHealthToken('HEALTH_TOKEN', bad), /HEALTH_TOKEN/);
  }

  assert.equal(optionalInstanceId('family-1'), 'family-1');
  assert.equal(optionalInstanceId(''), undefined);
  for (const bad of ['Family', '-home', 'home-', 'home space', 'x'.repeat(33)]) {
    assert.throws(() => optionalInstanceId(bad), /INSTANCE_ID/);
  }

  assert.equal(requireBooleanFlag('SMS_ENABLED', undefined), false);
  assert.equal(requireBooleanFlag('SMS_ENABLED', 'false'), false);
  assert.equal(requireBooleanFlag('SMS_ENABLED', 'true'), true);
  assert.throws(() => requireBooleanFlag('SMS_ENABLED', 'TRUE'), /SMS_ENABLED/);
});
