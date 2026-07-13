'use strict';

const E164 = /^\+[1-9]\d{7,14}$/;
const ACCOUNT_SID = /^AC[0-9a-f]{32}$/i;
const INSTANCE_ID = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

function emptyChecks() {
  return {
    inventory: false,
    testNumber: false,
    webhooks: false,
    methods: false,
    account: false,
    balance: false,
  };
}

function getTags(instanceId) {
  const id = instanceId == null ? '' : String(instanceId);
  if (id && !INSTANCE_ID.test(id)) return null;
  const base = id ? `emergency-line-${id}` : 'emergency-line';
  return { active: `${base}-active`, test: `${base}-test` };
}

function getBaseUrl(domainName) {
  if (typeof domainName !== 'string' || !/^[a-z0-9.-]+$/i.test(domainName)) return null;
  return `https://${domainName}`;
}

function exactMatches(numbers, friendlyName) {
  if (!Array.isArray(numbers)) return [];
  return numbers.filter((number) => number && number.friendlyName === friendlyName);
}

function evaluateProviderSnapshot({
  activeNumbers,
  testNumbers,
  activeTag,
  testTag,
  expectedBaseUrl,
  expectedTestNumber,
  accountStatus,
  balance,
  minBalance = 5,
}) {
  const activeMatches = exactMatches(activeNumbers, activeTag);
  const testMatches = exactMatches(testNumbers, testTag);
  const inventory = activeMatches.length === 1 && testMatches.length === 1;
  const active = inventory ? activeMatches[0] : null;
  const test = inventory ? testMatches[0] : null;
  const testNumber = Boolean(test && E164.test(expectedTestNumber || '') && test.phoneNumber === expectedTestNumber);
  const numbers = inventory ? [active, test] : [];
  const webhooks = inventory && Boolean(expectedBaseUrl) && numbers.every((number) => (
    number.voiceUrl === `${expectedBaseUrl}/forward`
      && number.smsUrl === `${expectedBaseUrl}/sms`
  ));
  const methods = inventory && numbers.every((number) => (
    number.voiceMethod === 'POST' && number.smsMethod === 'POST'
  ));
  const account = accountStatus === 'active';
  const numericBalance = typeof balance === 'number'
    ? balance
    : (typeof balance === 'string' && balance.trim() ? Number(balance) : Number.NaN);
  const balanceReady = Number.isFinite(numericBalance) && numericBalance >= minBalance;
  const checks = { inventory, testNumber, webhooks, methods, account, balance: balanceReady };
  return { ok: Object.values(checks).every(Boolean), checks };
}

async function inspectProvider(context) {
  const tags = getTags(context.INSTANCE_ID);
  const expectedBaseUrl = getBaseUrl(context.DOMAIN_NAME);
  if (!tags || !expectedBaseUrl || !ACCOUNT_SID.test(context.ACCOUNT_SID || '') || !E164.test(context.TEST_NUMBER || '')) {
    return { ok: false, checks: emptyChecks() };
  }

  const client = context.getTwilioClient();
  const accountResource = client.api.v2010.accounts(context.ACCOUNT_SID);
  const [activeNumbers, testNumbers, account, balance] = await Promise.all([
    client.incomingPhoneNumbers.list({ friendlyName: tags.active, limit: 20 }),
    client.incomingPhoneNumbers.list({ friendlyName: tags.test, limit: 20 }),
    accountResource.fetch(),
    accountResource.balance.fetch(),
  ]);

  return evaluateProviderSnapshot({
    activeNumbers,
    testNumbers,
    activeTag: tags.active,
    testTag: tags.test,
    expectedBaseUrl,
    expectedTestNumber: context.TEST_NUMBER,
    accountStatus: account && account.status,
    balance: balance && balance.balance,
  });
}

module.exports = { emptyChecks, evaluateProviderSnapshot, inspectProvider };
