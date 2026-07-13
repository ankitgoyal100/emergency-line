'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installTwilioRuntime } = require('./helpers/twilio-runtime.js');
installTwilioRuntime();
const sms = require('../functions/sms.protected.js');
const health = require('../functions/health.js');

function run(handler, context, event) {
  return new Promise((resolve, reject) => {
    handler.handler(context, event, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

test('inbound SMS is forwarded to the real number, labeled with sender', async () => {
  let sent = null;
  const context = {
    YOUR_REAL_NUMBER: '+15552223333', TEST_NUMBER: '+15559998888',
    SMS_ENABLED: 'true', MESSAGE_BRAND: 'Family Emergency Line',
    getTwilioClient: () => ({ messages: { create: async (a) => { sent = a; return { sid: 'SM1' }; } } }),
  };
  await run(sms, context, { To: '+15550001111', From: '+15551234567', Body: 'need help' });
  assert.equal(sent.from, '+15550001111');
  assert.equal(sent.to, '+15552223333');
  assert.equal(
    sent.body,
    'Family Emergency Line: Text from +15551234567: need help Reply STOP to opt out.'
  );
});

test('inbound SMS from the test number is a probe: not forwarded', async () => {
  let called = false;
  const context = {
    YOUR_REAL_NUMBER: '+15552223333', TEST_NUMBER: '+15559998888',
    SMS_ENABLED: 'true',
    getTwilioClient: () => ({ messages: { create: async () => { called = true; return {}; } } }),
  };
  await run(sms, context, { To: '+15550001111', From: '+15559998888', Body: 'probe' });
  assert.equal(called, false);
});

test('health reports voice ready but SMS not ready by default', async () => {
  const context = { HEALTH_TOKEN: 'secret', YOUR_REAL_NUMBER: '+15552223333', TEST_NUMBER: '+15559998888' };
  const res = await run(health, context, { token: 'secret' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.deepEqual(res.body.capabilities.voice, { ready: true });
  assert.deepEqual(res.body.capabilities.sms, { enabled: false, ready: false });
});

test('health reports SMS ready only after explicit enablement', async () => {
  const context = {
    HEALTH_TOKEN: 'secret', YOUR_REAL_NUMBER: '+15552223333', TEST_NUMBER: '+15559998888', SMS_ENABLED: 'true',
  };
  const res = await run(health, context, { token: 'secret' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.capabilities.sms, { enabled: true, ready: true });
});

test('health returns 403 with a bad token', async () => {
  const context = { HEALTH_TOKEN: 'secret', YOUR_REAL_NUMBER: '+1', TEST_NUMBER: '+2' };
  const res = await run(health, context, { token: 'nope' });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.ok, false);
});

test('health returns 403 with a missing token', async () => {
  const context = { HEALTH_TOKEN: 'secret', YOUR_REAL_NUMBER: '+1', TEST_NUMBER: '+2' };
  const res = await run(health, context, {});
  assert.equal(res.statusCode, 403);
});

test('health returns 500 with a valid token but missing/invalid voice env', async () => {
  const context = { HEALTH_TOKEN: 'secret', YOUR_REAL_NUMBER: '', TEST_NUMBER: '+15559998888' };
  const res = await run(health, context, { token: 'secret' });
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.ok, false);
});

test('inbound SMS is silently accepted but not forwarded when disabled', async () => {
  let called = false;
  const context = {
    YOUR_REAL_NUMBER: '+15552223333', TEST_NUMBER: '+15559998888',
    getTwilioClient: () => ({ messages: { create: async () => { called = true; return {}; } } }),
  };
  const result = await run(sms, context, { To: '+15550001111', From: '+15551234567', Body: 'need help' });
  assert.equal(result, '<Response/>');
  assert.equal(called, false);
});
