'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateProviderSnapshot, inspectProvider } = require('../functions/provider-health.private.js');

function number(friendlyName, phoneNumber) {
  return {
    friendlyName,
    phoneNumber,
    voiceUrl: 'https://x.twil.io/forward',
    smsUrl: 'https://x.twil.io/sms',
    voiceMethod: 'POST',
    smsMethod: 'POST',
  };
}

function healthySnapshot() {
  return {
    activeNumbers: [number('emergency-line-active', '+12025550101')],
    testNumbers: [number('emergency-line-test', '+12025550102')],
    activeTag: 'emergency-line-active',
    testTag: 'emergency-line-test',
    expectedBaseUrl: 'https://x.twil.io',
    expectedTestNumber: '+12025550102',
    accountStatus: 'active',
    balance: '10.00',
  };
}

test('provider snapshot passes only when every M1 check is healthy', () => {
  const result = evaluateProviderSnapshot(healthySnapshot());
  assert.equal(result.ok, true);
  assert.ok(Object.values(result.checks).every(Boolean));
});

test('missing or duplicate tagged numbers fail inventory closed', () => {
  const base = healthySnapshot();
  for (const activeNumbers of [[], [...base.activeNumbers, ...base.activeNumbers]]) {
    const result = evaluateProviderSnapshot({ ...base, activeNumbers });
    assert.equal(result.ok, false);
    assert.equal(result.checks.inventory, false);
    assert.equal(result.checks.webhooks, false);
  }
});

test('test-number mismatch fails without exposing either number', () => {
  const result = evaluateProviderSnapshot({ ...healthySnapshot(), expectedTestNumber: '+12025550199' });
  assert.equal(result.ok, false);
  assert.equal(result.checks.testNumber, false);
  assert.equal('phoneNumber' in result, false);
});

test('voice, SMS, and HTTP-method drift fail independently', () => {
  const base = healthySnapshot();
  const wrongVoice = { ...base.activeNumbers[0], voiceUrl: 'https://wrong.invalid/forward' };
  const wrongSms = { ...base.activeNumbers[0], smsUrl: 'https://wrong.invalid/sms' };
  const wrongMethod = { ...base.activeNumbers[0], voiceMethod: 'GET' };
  assert.equal(evaluateProviderSnapshot({ ...base, activeNumbers: [wrongVoice] }).checks.webhooks, false);
  assert.equal(evaluateProviderSnapshot({ ...base, activeNumbers: [wrongSms] }).checks.webhooks, false);
  assert.equal(evaluateProviderSnapshot({ ...base, activeNumbers: [wrongMethod] }).checks.methods, false);
});

test('suspended account and low, missing, or invalid balances fail closed', () => {
  const base = healthySnapshot();
  assert.equal(evaluateProviderSnapshot({ ...base, accountStatus: 'suspended' }).checks.account, false);
  for (const balance of ['4.99', undefined, null, '', '5junk', 'not-a-number']) {
    const result = evaluateProviderSnapshot({ ...base, balance });
    assert.equal(result.ok, false);
    assert.equal(result.checks.balance, false);
  }
  assert.equal(evaluateProviderSnapshot({ ...base, balance: '5.00' }).checks.balance, true);
});

test('provider inspection rejects invalid runtime config before creating a client', async () => {
  for (const context of [
    { ACCOUNT_SID: 'bad', DOMAIN_NAME: 'x.twil.io', TEST_NUMBER: '+12025550102' },
    { ACCOUNT_SID: `AC${'a'.repeat(32)}`, DOMAIN_NAME: 'not a domain', TEST_NUMBER: '+12025550102' },
    { ACCOUNT_SID: `AC${'a'.repeat(32)}`, DOMAIN_NAME: 'x.twil.io', TEST_NUMBER: 'bad' },
    { ACCOUNT_SID: `AC${'a'.repeat(32)}`, DOMAIN_NAME: 'x.twil.io', TEST_NUMBER: '+12025550102', INSTANCE_ID: '../bad' },
  ]) {
    let created = false;
    const result = await inspectProvider({
      ...context,
      getTwilioClient: () => { created = true; throw new Error('must not run'); },
    });
    assert.equal(result.ok, false);
    assert.equal(created, false);
  }
});

test('provider inspection performs exactly the four intended read operations', async () => {
  const base = healthySnapshot();
  const calls = [];
  const accountResource = () => ({
    fetch: async () => { calls.push('account.fetch'); return { status: base.accountStatus }; },
    balance: { fetch: async () => { calls.push('balance.fetch'); return { balance: base.balance }; } },
  });
  const context = {
    ACCOUNT_SID: `AC${'a'.repeat(32)}`,
    DOMAIN_NAME: 'x.twil.io',
    TEST_NUMBER: base.expectedTestNumber,
    getTwilioClient: () => ({
      incomingPhoneNumbers: {
        list: async ({ friendlyName }) => {
          calls.push(`numbers.list:${friendlyName}`);
          return friendlyName === base.activeTag ? base.activeNumbers : base.testNumbers;
        },
      },
      api: { v2010: { accounts: accountResource } },
    }),
  };
  const result = await inspectProvider(context);
  assert.equal(result.ok, true);
  assert.deepEqual(calls.sort(), [
    'account.fetch',
    'balance.fetch',
    'numbers.list:emergency-line-active',
    'numbers.list:emergency-line-test',
  ]);
});
