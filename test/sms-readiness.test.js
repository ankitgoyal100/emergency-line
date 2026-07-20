'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { smsReadiness } = require('../src/commands/sms-readiness.js');

function scenario({ smsUrl = 'https://x.twil.io/sms', smsMethod = 'POST', answers } = {}) {
  const prompts = [...(answers || ['APPROVED', 'REGISTERED 0101', 'WEBHOOK'])];
  const events = [];
  return {
    deps: {
      findNumberByTag: async (_client, tag) => {
        events.push(`find:${tag}`);
        return { phoneNumber: '+12025550101', smsUrl, smsMethod };
      },
    },
    io: {
      prompt: async () => prompts.shift() || '',
      info: (message) => events.push(message),
    },
    events,
  };
}

test('SMS readiness preflight requires provider confirmations before enablement', async () => {
  const s = scenario();
  const result = await smsReadiness({ client: {}, functionUrl: 'https://x.twil.io', instanceId: 'home', smsEnabled: 'false', messageBrand: 'Emergency Line', io: s.io, deps: s.deps });
  assert.deepEqual(result, { ready: false, preflight: true, phoneNumber: '+12025550101' });
  assert.ok(s.events.includes('find:emergency-line-home-active'));
});

test('SMS final readiness requires real delivery and HELP/STOP/START confirmations after enablement', async () => {
  const s = scenario({ answers: ['APPROVED', 'REGISTERED 0101', 'WEBHOOK', 'OUTBOUND', 'NO RELAY', 'HELP', 'STOP BLOCKED', 'START RESTORED'] });
  const result = await smsReadiness({ client: {}, functionUrl: 'https://x.twil.io', smsEnabled: 'true', messageBrand: 'Emergency Line', io: s.io, deps: s.deps });
  assert.deepEqual(result, { ready: true, preflight: true, phoneNumber: '+12025550101' });
});

test('SMS readiness fails closed on webhook drift or a missing confirmation', async () => {
  const drift = scenario({ smsUrl: 'https://wrong.invalid/sms' });
  await assert.rejects(
    () => smsReadiness({ client: {}, functionUrl: 'https://x.twil.io', messageBrand: 'Emergency Line', io: drift.io, deps: drift.deps }),
    /expected POST \/sms webhook/
  );

  const incomplete = scenario({ answers: ['APPROVED', 'not registered'] });
  await assert.rejects(
    () => smsReadiness({ client: {}, functionUrl: 'https://x.twil.io', messageBrand: 'Emergency Line', io: incomplete.io, deps: incomplete.deps }),
    /Keep SMS_ENABLED=false/
  );
});

test('SMS readiness requires an explicit registered sender label', async () => {
  const s = scenario();
  await assert.rejects(
    () => smsReadiness({ client: {}, functionUrl: 'https://x.twil.io', smsEnabled: 'false', io: s.io, deps: s.deps }),
    /MESSAGE_BRAND/
  );
});
