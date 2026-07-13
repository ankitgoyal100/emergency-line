'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const tc = require('../src/twilio-client.js');

function fakeClient(overrides = {}) {
  const calls = { created: null, updated: null, removed: null, listQuery: null, availableQuery: null, availableCountry: null };
  const numberFn = (sid) => ({
    update: async (a) => { calls.updated = { sid, ...a }; return { sid, ...a }; },
    remove: async () => { calls.removed = sid; },
  });
  numberFn.list = async (q) => { calls.listQuery = q; return overrides.list ? overrides.list(q) : []; };
  numberFn.create = async (a) => { calls.created = a; return { sid: 'PN_new', phoneNumber: a.phoneNumber }; };
  const client = {
    incomingPhoneNumbers: numberFn,
    availablePhoneNumbers: (country) => ({ local: { list: async (q) => { calls.availableCountry = country; calls.availableQuery = q; return overrides.available || []; } } }),
    api: { v2010: { accounts: (sid) => ({
      fetch: async () => ({ status: overrides.status || 'active' }),
      balance: { fetch: async () => ({ balance: overrides.balance || '12.50' }) },
    }) } },
  };
  return { client, calls };
}

test('findNumberByTag sends the friendlyName+limit filter and returns one exact match or null', async () => {
  const withHit = fakeClient({ list: async () => [{ sid: 'PN1', friendlyName: 'emergency-line-active' }] });
  assert.equal((await tc.findNumberByTag(withHit.client, 'emergency-line-active')).sid, 'PN1');
  assert.deepEqual(withHit.calls.listQuery, { friendlyName: 'emergency-line-active', limit: 20 });
  const empty = fakeClient();
  assert.equal(await tc.findNumberByTag(empty.client, 'emergency-line-active'), null);
});

test('findNumberByTag fails closed when duplicate exact tags exist', async () => {
  const f = fakeClient({ list: async () => [
    { sid: 'PN1', friendlyName: 'emergency-line-active' },
    { sid: 'PN2', friendlyName: 'emergency-line-active' },
  ] });
  await assert.rejects(() => tc.findNumberByTag(f.client, 'emergency-line-active'), /Multiple Twilio numbers/);
});

test('findNumberByTag returns null when no entry exactly matches the tag (no wrong-line fallback)', async () => {
  const f = fakeClient({ list: async () => [{ sid: 'PNX', friendlyName: 'something-else' }] });
  assert.equal(await tc.findNumberByTag(f.client, 'emergency-line-active'), null);
});

test('buyNumber purchases the first available number and wires POST webhooks', async () => {
  const f = fakeClient({ available: [{ phoneNumber: '+15550009999' }] });
  const rec = await tc.buyNumber(f.client, { areaCode: 415, voiceUrl: 'https://x/forward', smsUrl: 'https://x/sms', friendlyName: 'emergency-line-active' });
  assert.equal(rec.phoneNumber, '+15550009999');
  assert.equal(f.calls.availableCountry, 'US');
  assert.equal(f.calls.availableQuery.areaCode, '415');
  assert.equal(f.calls.availableQuery.voiceEnabled, true);
  assert.equal(f.calls.availableQuery.smsEnabled, true);
  assert.equal(f.calls.created.voiceUrl, 'https://x/forward');
  assert.equal(f.calls.created.smsUrl, 'https://x/sms');
  assert.equal(f.calls.created.voiceMethod, 'POST');
  assert.equal(f.calls.created.smsMethod, 'POST');
  assert.equal(f.calls.created.friendlyName, 'emergency-line-active');
});

test('buyNumber throws when no numbers are available', async () => {
  const f = fakeClient({ available: [] });
  await assert.rejects(() => tc.buyNumber(f.client, { areaCode: 999, voiceUrl: 'v', smsUrl: 's', friendlyName: 'x' }), /No numbers available/);
});

test('setWebhooks and setFriendlyName and releaseNumber call the SDK with POST methods', async () => {
  const f = fakeClient();
  await tc.setWebhooks(f.client, 'PN1', { voiceUrl: 'v', smsUrl: 's' });
  assert.equal(f.calls.updated.voiceUrl, 'v');
  assert.equal(f.calls.updated.voiceMethod, 'POST');
  assert.equal(f.calls.updated.smsMethod, 'POST');
  await tc.setFriendlyName(f.client, 'PN1', 'emergency-line-active');
  assert.equal(f.calls.updated.friendlyName, 'emergency-line-active');
  await tc.releaseNumber(f.client, 'PN9');
  assert.equal(f.calls.removed, 'PN9');
});

test('getAccountStatus degrades to "unknown" when a Standard key is scoped out (401/20003)', async () => {
  const client401 = { api: { v2010: { accounts: () => ({ fetch: async () => { const e = new Error('Authenticate'); e.status = 401; e.code = 20003; throw e; } }) } } };
  assert.equal(await tc.getAccountStatus(client401, 'AC1'), 'unknown');
});

test('getAccountStatus rethrows non-auth errors (fail loud)', async () => {
  const client500 = { api: { v2010: { accounts: () => ({ fetch: async () => { const e = new Error('boom'); e.status = 500; throw e; } }) } } };
  await assert.rejects(() => tc.getAccountStatus(client500, 'AC1'), /boom/);
});

test('getAccountStatus and getBalance parse SDK responses', async () => {
  const f = fakeClient({ status: 'active', balance: '3.14' });
  assert.equal(await tc.getAccountStatus(f.client, 'AC1'), 'active');
  assert.equal(await tc.getBalance(f.client, 'AC1'), 3.14);
});

test('createClient rejects malformed or placeholder credentials before SDK use', () => {
  assert.throws(() => tc.createClient({ accountSid: 'AC1', apiKey: 'SK1', apiSecret: 'secret' }), /TWILIO_ACCOUNT_SID/);
  assert.throws(() => tc.createClient({
    accountSid: `AC${'a'.repeat(32)}`,
    apiKey: `SK${'b'.repeat(32)}`,
    apiSecret: 'your_api_key_secret',
  }), /API_SECRET/);
});
