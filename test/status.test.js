'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runStatus } = require('../src/commands/status.js');

function fakeIo() {
  const out = [];
  return { io: { info: (m) => out.push(m), error: (m) => out.push('ERR:' + m), prompt: async () => '' }, out };
}

test('runStatus reports active/test numbers, account status, balance', async () => {
  const client = {}; // not used directly; helpers are injected via deps
  const deps = {
    findNumberByTag: async (_c, tag) => tag === 'emergency-line-active'
      ? { phoneNumber: '+1AAA', voiceUrl: 'https://x.twil.io/twiml', smsUrl: 'https://x.twil.io/messages' }
      : { phoneNumber: '+1TTT' },
    getAccountStatus: async () => 'active',
    getBalance: async () => 9.99,
  };
  const { io, out } = fakeIo();
  const result = await runStatus({ client, accountSid: 'AC1', functionUrl: 'https://x.twil.io', io, deps });
  assert.deepEqual(result, { active: '+1AAA', test: '+1TTT', accountStatus: 'active', balance: 9.99 });
  assert.ok(out.join('\n').includes('+1AAA'));
  assert.ok(out.join('\n').includes('https://x.twil.io/twiml'));
  assert.ok(out.join('\n').includes('https://x.twil.io/messages'));
});

test('runStatus is safe before setup when no numbers exist yet', async () => {
  const deps = {
    findNumberByTag: async () => null,
    getAccountStatus: async () => 'active',
    getBalance: async () => 0,
  };
  const { io, out } = fakeIo();
  const result = await runStatus({ client: {}, accountSid: 'AC1', functionUrl: 'https://x.twil.io', io, deps });
  assert.deepEqual(result, { active: null, test: null, accountStatus: 'active', balance: 0 });
  assert.ok(out.join('\n').includes('(none)'));
  assert.ok(out.join('\n').includes('(n/a)'));
});
