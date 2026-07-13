'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  requireE2eAuthorization,
  probeSyntheticSink,
  verifyForwarding,
} = require('../monitor/check-e2e.js');
const { ringTest } = require('../src/commands/ring-test.js');

test('verifyForwarding returns true when the synthetic call completes at the sink', async () => {
  const client = { calls: { create: async (a) => { assert.equal(a.from, '+1TEST'); assert.equal(a.to, '+1NEW'); return { sid: 'CA1' }; } } };
  const pollStatus = async () => 'completed';
  assert.equal(await verifyForwarding({ client, fromNumber: '+1TEST', toNumber: '+1NEW', pollStatus, preflightSink: async () => true }), true);
});

test('verifyForwarding returns false when the call fails', async () => {
  const client = { calls: { create: async () => ({ sid: 'CA1' }) } };
  const pollStatus = async () => 'failed';
  assert.equal(await verifyForwarding({ client, fromNumber: '+1TEST', toNumber: '+1NEW', pollStatus, preflightSink: async () => true }), false);
});

test('verifyForwarding polls across iterations using the injected sleep, true on eventual completion', async () => {
  const statuses = ['queued', 'ringing', 'completed'];
  let calls = 0, sleeps = 0;
  const client = { calls: { create: async () => ({ sid: 'CA1' }) } };
  const pollStatus = async () => statuses[calls++];
  const sleep = async () => { sleeps++; };
  const ok = await verifyForwarding({ client, fromNumber: '+1T', toNumber: '+1N', pollStatus, sleep, preflightSink: async () => true });
  assert.equal(ok, true);
  assert.equal(sleeps, 2); // slept between the 3 polls, not after the final
});

test('verifyForwarding returns false after exhausting attempts (bounded, no trailing sleep, no real wait)', async () => {
  let sleeps = 0;
  const client = { calls: { create: async () => ({ sid: 'CA1' }) } };
  const pollStatus = async () => 'ringing'; // never terminal
  const sleep = async () => { sleeps++; };
  const ok = await verifyForwarding({ client, fromNumber: '+1T', toNumber: '+1N', pollStatus, attempts: 4, sleep, preflightSink: async () => true });
  assert.equal(ok, false);
  assert.equal(sleeps, 3); // attempts-1 sleeps; no sleep after the last poll
});

test('synthetic check refuses to originate when the deployed Function does not confirm the sink', async () => {
  let originated = false;
  const client = { calls: { create: async () => { originated = true; return { sid: 'CA1' }; } } };
  const ok = await verifyForwarding({
    client,
    fromNumber: '+12025550101',
    toNumber: '+12025550102',
    pollStatus: async () => 'completed',
    preflightSink: async () => false,
  });
  assert.equal(ok, false);
  assert.equal(originated, false);
});

test('synthetic check requires an explicit billable authorization flag', () => {
  assert.throws(() => requireE2eAuthorization([]), /billable/);
  assert.throws(() => requireE2eAuthorization(['--dry-run']), /billable/);
  assert.doesNotThrow(() => requireE2eAuthorization(['--yes']));
});

test('sink preflight accepts only signed sink TwiML and rejects a Dial response', async () => {
  const base = {
    functionUrl: 'https://x.twil.io',
    authToken: 'a'.repeat(32),
    fromNumber: '+12025550101',
    toNumber: '+12025550102',
  };
  const sink = async (_url, options) => {
    assert.ok(options.headers['X-Twilio-Signature']);
    return { status: 200, text: async () => '<Response><Say>health ok</Say><Hangup/></Response>' };
  };
  assert.equal(await probeSyntheticSink({ ...base, fetchImpl: sink }), true);

  const dial = async () => ({ status: 200, text: async () => '<Response><Dial><Number>+12025550103</Number></Dial></Response>' });
  assert.equal(await probeSyntheticSink({ ...base, fetchImpl: dial }), false);
});

test('ringTest calls the real phone from the Emergency Line number and records a pass when user confirms', async () => {
  let originated = null;
  const originate = async (a) => { originated = a; return { sid: 'CA9' }; };
  const io = { info: () => {}, error: () => {}, prompt: async () => 'y' };
  const result = await ringTest({ client: {}, activeNumber: '+12025550101', realNumber: '+12025550102', io, originate, yes: true });
  assert.equal(originated.from, '+12025550101');
  assert.equal(originated.to, '+12025550102');
  assert.deepEqual(result, { passed: true, cancelled: false });
});

test('ringTest records a failure when user says it did not ring', async () => {
  const originate = async () => ({ sid: 'CA9' });
  const io = { info: () => {}, error: () => {}, prompt: async () => 'n' };
  const result = await ringTest({ client: {}, activeNumber: '+12025550101', realNumber: '+12025550102', io, originate, yes: true });
  assert.deepEqual(result, { passed: false, cancelled: false });
});

test('ringTest requires explicit confirmation before it places a billable call', async () => {
  let originated = false;
  const originate = async () => { originated = true; return {}; };
  const io = { info: () => {}, error: () => {}, prompt: async () => 'no' };
  const result = await ringTest({ client: {}, activeNumber: '+12025550101', realNumber: '+12025550102', io, originate });
  assert.deepEqual(result, { passed: false, cancelled: true });
  assert.equal(originated, false);
});

test('ringTest rejects invalid numbers before confirmation or call placement', async () => {
  let originated = false;
  let prompted = false;
  await assert.rejects(() => ringTest({
    client: {},
    activeNumber: 'example',
    realNumber: '+12025550102',
    io: { info: () => {}, error: () => {}, prompt: async () => { prompted = true; return 'CALL'; } },
    originate: async () => { originated = true; },
  }), /active Twilio number/);
  assert.equal(prompted, false);
  assert.equal(originated, false);
});
