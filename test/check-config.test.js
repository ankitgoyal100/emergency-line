'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateConfig } = require('../monitor/check-config.js');

test('healthy config passes', () => {
  const r = evaluateConfig({
    active: { phoneNumber: '+1A', voiceUrl: 'https://x.twil.io/forward', smsUrl: 'https://x.twil.io/sms' },
    test: { phoneNumber: '+1T', voiceUrl: 'https://x.twil.io/forward', smsUrl: 'https://x.twil.io/sms' },
    functionUrl: 'https://x.twil.io', accountStatus: 'active', balance: 10, minBalance: 5,
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
});

test('healthy config accepts a FUNCTION_URL with a trailing slash', () => {
  const r = evaluateConfig({
    active: { phoneNumber: '+1A', voiceUrl: 'https://x.twil.io/forward', smsUrl: 'https://x.twil.io/sms' },
    test: { phoneNumber: '+1T', voiceUrl: 'https://x.twil.io/forward', smsUrl: 'https://x.twil.io/sms' },
    functionUrl: 'https://x.twil.io/', accountStatus: 'active', balance: 10, minBalance: 5,
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
});

test('invalid FUNCTION_URL is flagged without exposing its value', () => {
  const r = evaluateConfig({
    active: { phoneNumber: '+1A', voiceUrl: 'https://x.twil.io/forward', smsUrl: 'https://x.twil.io/sms' },
    test: { phoneNumber: '+1T', voiceUrl: 'https://x.twil.io/forward', smsUrl: 'https://x.twil.io/sms' },
    functionUrl: 'not-a-private-url', accountStatus: 'active', balance: 10, minBalance: 5,
  });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /FUNCTION_URL is missing or invalid/.test(p)));
  assert.ok(r.problems.every((p) => !p.includes('not-a-private-url')));
});

test('unknown account status (Standard-key scope) is not flagged', () => {
  const r = evaluateConfig({
    active: { phoneNumber: '+1A', voiceUrl: 'https://x.twil.io/forward', smsUrl: 'https://x.twil.io/sms' },
    test: { phoneNumber: '+1T', voiceUrl: 'https://x.twil.io/forward', smsUrl: 'https://x.twil.io/sms' },
    functionUrl: 'https://x.twil.io', accountStatus: 'unknown', balance: 10, minBalance: 5,
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
});

test('missing active/test numbers, wrong webhooks, suspended account, low balance all flagged', () => {
  const r = evaluateConfig({ active: null, test: null, functionUrl: 'https://x.twil.io', accountStatus: 'suspended', balance: 1, minBalance: 5 });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /no active number/i.test(p)));
  assert.ok(r.problems.some((p) => /no synthetic test number/i.test(p)));
  assert.ok(r.problems.some((p) => /account status/i.test(p)));
  assert.ok(r.problems.some((p) => /balance/i.test(p)));
  assert.ok(r.problems.every((p) => !p.includes('$1') && !p.includes('$5')));

  const r2 = evaluateConfig({
    active: { phoneNumber: '+1A', voiceUrl: 'https://WRONG/forward', smsUrl: 'https://x.twil.io/sms' },
    test: { phoneNumber: '+1T', voiceUrl: 'https://x.twil.io/forward', smsUrl: 'https://x.twil.io/sms' },
    functionUrl: 'https://x.twil.io', accountStatus: 'active', balance: 10, minBalance: 5,
  });
  assert.ok(r2.problems.some((p) => /voice webhook/i.test(p)));
  assert.ok(r2.problems.every((p) => !p.includes('https://WRONG')));
});

test('unreadable balance (NaN/undefined/null) is flagged, never a false OK', () => {
  const base = {
    active: { phoneNumber: '+1A', voiceUrl: 'https://x.twil.io/forward', smsUrl: 'https://x.twil.io/sms' },
    test: { phoneNumber: '+1T', voiceUrl: 'https://x.twil.io/forward', smsUrl: 'https://x.twil.io/sms' },
    functionUrl: 'https://x.twil.io', accountStatus: 'active', minBalance: 5,
  };
  for (const bad of [NaN, undefined, null]) {
    const r = evaluateConfig({ ...base, balance: bad });
    assert.equal(r.ok, false, `balance ${String(bad)} must not be OK`);
    assert.ok(r.problems.some((p) => /balance unavailable/i.test(p)));
  }
});

test('default minBalance of 5 applies when omitted', () => {
  const base = {
    active: { phoneNumber: '+1A', voiceUrl: 'https://x.twil.io/forward', smsUrl: 'https://x.twil.io/sms' },
    test: { phoneNumber: '+1T', voiceUrl: 'https://x.twil.io/forward', smsUrl: 'https://x.twil.io/sms' },
    functionUrl: 'https://x.twil.io', accountStatus: 'active',
  };
  assert.equal(evaluateConfig({ ...base, balance: 3 }).ok, false); // 3 < default 5
  assert.equal(evaluateConfig({ ...base, balance: 5 }).ok, true);  // boundary: 5 is not < 5
});

test('wrong sms webhook is flagged independently of voice', () => {
  const r = evaluateConfig({
    active: { phoneNumber: '+1A', voiceUrl: 'https://x.twil.io/forward', smsUrl: 'https://WRONG/sms' },
    test: { phoneNumber: '+1T', voiceUrl: 'https://x.twil.io/forward', smsUrl: 'https://x.twil.io/sms' },
    functionUrl: 'https://x.twil.io', accountStatus: 'active', balance: 10, minBalance: 5,
  });
  assert.ok(r.problems.some((p) => /sms webhook/i.test(p)));
  assert.ok(r.problems.every((p) => !p.includes('https://WRONG')));
  assert.ok(!r.problems.some((p) => /voice webhook/i.test(p)));
});

test('synthetic test number webhook drift is flagged independently', () => {
  const r = evaluateConfig({
    active: { phoneNumber: '+1A', voiceUrl: 'https://x.twil.io/forward', smsUrl: 'https://x.twil.io/sms' },
    test: { phoneNumber: '+1T', voiceUrl: 'https://wrong.invalid/forward', smsUrl: 'https://x.twil.io/sms' },
    functionUrl: 'https://x.twil.io', accountStatus: 'active', balance: 10,
  });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /synthetic test voice webhook/i.test(p)));
  assert.ok(r.problems.every((p) => !p.includes('wrong.invalid')));
});
