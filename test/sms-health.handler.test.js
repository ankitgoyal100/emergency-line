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

function healthyHealthContext(overrides = {}) {
  const activeTag = 'emergency-line-active';
  const testTag = 'emergency-line-test';
  const domain = 'x.twil.io';
  const testNumber = '+12025550102';
  const active = {
    friendlyName: activeTag,
    phoneNumber: '+12025550101',
    voiceUrl: `https://${domain}/forward`,
    smsUrl: `https://${domain}/sms`,
    voiceMethod: 'POST',
    smsMethod: 'POST',
  };
  const test = {
    friendlyName: testTag,
    phoneNumber: testNumber,
    voiceUrl: `https://${domain}/forward`,
    smsUrl: `https://${domain}/sms`,
    voiceMethod: 'POST',
    smsMethod: 'POST',
  };
  const accountResource = () => ({
    fetch: async () => ({ status: 'active' }),
    balance: { fetch: async () => ({ balance: '10.00' }) },
  });
  const client = {
    incomingPhoneNumbers: {
      list: async ({ friendlyName }) => (friendlyName === activeTag ? [active] : [test]),
    },
    api: { v2010: { accounts: accountResource } },
  };
  return {
    HEALTH_TOKEN: 'secret',
    ACCOUNT_SID: `AC${'a'.repeat(32)}`,
    DOMAIN_NAME: domain,
    YOUR_REAL_NUMBER: '+12025550103',
    TEST_NUMBER: testNumber,
    MESSAGE_BRAND: 'Emergency Line',
    getTwilioClient: () => client,
    ...overrides,
  };
}

function healthEvent(token = 'secret', headerName = 'x-health-token') {
  return { request: { headers: { [headerName]: token } } };
}

for (const [name, enabled, event] of [
  ['human-authored text while notifications are enabled', 'true', { From: '+15551234567', Body: 'need help' }],
  ['human-authored text while notifications are disabled', 'false', { From: '+15551234567', Body: 'hello' }],
  ['provider-handled STOP event', 'true', { From: '+15551234567', Body: 'STOP', OptOutType: 'STOP' }],
  ['text from the synthetic test number', 'true', { From: '+15559998888', Body: 'probe' }],
]) {
  test(`inbound SMS discards ${name}`, async () => {
    let called = false;
    const context = {
      YOUR_REAL_NUMBER: '+15552223333', TEST_NUMBER: '+15559998888',
      SMS_ENABLED: enabled, MESSAGE_BRAND: 'Family Emergency Line',
      getTwilioClient: () => ({ messages: { create: async () => { called = true; return {}; } } }),
    };
    const result = await run(sms, context, { To: '+15550001111', ...event });
    assert.notEqual(typeof result, 'string', 'must return TwiML, not a text/plain string');
    assert.ok(result instanceof Twilio.twiml.MessagingResponse);
    assert.equal(result.toString(), '<?xml version="1.0" encoding="UTF-8"?><Response/>');
    assert.equal(called, false);
  });
}

test('health reports voice ready but SMS not ready by default', async () => {
  const context = healthyHealthContext();
  const res = await run(health, context, healthEvent());
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.marker, 'emergency-line-m1-ok');
  assert.deepEqual(res.body.capabilities.voice, { ready: true });
  assert.deepEqual(res.body.capabilities.sms, { enabled: false, ready: false });
  assert.ok(Object.values(res.body.checks).every(Boolean));
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('health reports SMS ready only after explicit enablement', async () => {
  const context = healthyHealthContext({ SMS_ENABLED: 'true' });
  const res = await run(health, context, healthEvent('secret', 'X-Health-Token'));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.capabilities.sms, { enabled: true, ready: true });
});

test('health returns 403 with a bad token', async () => {
  let touchedProvider = false;
  const context = healthyHealthContext({ getTwilioClient: () => { touchedProvider = true; throw new Error('must not run'); } });
  const res = await run(health, context, healthEvent('nope'));
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.ok, false);
  assert.equal(touchedProvider, false);
});

test('health returns 403 with a missing token', async () => {
  const context = { HEALTH_TOKEN: 'secret', YOUR_REAL_NUMBER: '+1', TEST_NUMBER: '+2' };
  const res = await run(health, context, {});
  assert.equal(res.statusCode, 403);
});

test('health rejects a query-string token so it cannot leak through URLs and logs', async () => {
  let touchedProvider = false;
  const context = healthyHealthContext({
    getTwilioClient: () => { touchedProvider = true; throw new Error('must not run'); },
  });
  const res = await run(health, context, { token: 'secret' });
  assert.equal(res.statusCode, 403);
  assert.equal(touchedProvider, false);
});

test('health returns 500 with a valid token but missing/invalid voice env', async () => {
  let touchedProvider = false;
  const context = healthyHealthContext({
    YOUR_REAL_NUMBER: '',
    getTwilioClient: () => { touchedProvider = true; throw new Error('must not run'); },
  });
  const res = await run(health, context, healthEvent());
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.marker, undefined);
  assert.equal(touchedProvider, false);
});

test('health sanitizes provider failures and returns 503 without a success marker', async () => {
  const context = healthyHealthContext({ getTwilioClient: () => { throw new Error('secret provider detail'); } });
  const res = await run(health, context, healthEvent());
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.marker, undefined);
  assert.equal(JSON.stringify(res.body).includes('secret provider detail'), false);
});

test('healthy health response exposes no numbers, SIDs, URLs, tags, or balance', async () => {
  const res = await run(health, healthyHealthContext(), healthEvent());
  const body = JSON.stringify(res.body);
  for (const privateValue of ['+12025550101', '+12025550102', '+12025550103', 'ACaaaa', 'https://', 'emergency-line-active', '10.00']) {
    assert.equal(body.includes(privateValue), false, `response exposed ${privateValue}`);
  }
});
