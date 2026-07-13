'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dispatch, requireNumberByTag } = require('../src/cli.js');

test('dispatch routes all known commands', async () => {
  const called = [];
  const deps = {
    makeClient: () => ({}),
    io: { info: () => {}, error: () => {}, prompt: async () => 'y' },
    env: { FUNCTION_URL: 'https://x.twil.io', TWILIO_ACCOUNT_SID: 'AC1', DEFAULT_AREA_CODE: '415', INSTANCE_ID: 'home', SMS_ENABLED: 'true' },
    commands: {
      runStatus: async () => { called.push('status'); },
      runSetup: async () => { called.push('setup'); },
      runSwap: async () => { called.push('swap'); },
      ringTest: async () => { called.push('ring-test'); },
      releaseNumbers: async () => { called.push('release-numbers'); },
      smsReadiness: async (options) => {
        assert.equal(options.smsEnabled, 'true');
        called.push('sms-readiness');
      },
    },
  };
  await dispatch(['status'], deps);
  await dispatch(['setup'], deps);
  await dispatch(['swap'], deps);
  await dispatch(['ring-test'], deps);
  await dispatch(['release-numbers', '--dry-run'], deps);
  await dispatch(['sms-readiness'], deps);
  assert.deepEqual(called, ['status', 'setup', 'swap', 'ring-test', 'release-numbers', 'sms-readiness']);
});

test('dispatch parses safety flags and rejects unknown options', async () => {
  let received;
  const deps = {
    makeClient: () => ({}),
    io: { info: () => {}, error: () => {} },
    env: {},
    commands: { runSetup: async (args) => { received = args; } },
  };
  await dispatch(['setup', '--dry-run', '--yes'], deps);
  assert.equal(received.dryRun, true);
  assert.equal(received.yes, true);
  await assert.rejects(() => dispatch(['setup', '--force'], deps), /unknown option/);
});

test('ring-test rejects automation flags and cannot bypass the CALL prompt through dispatch', async () => {
  let called = false;
  const deps = {
    makeClient: () => ({}),
    io: { info: () => {}, error: () => {} },
    env: {},
    commands: { ringTest: async () => { called = true; } },
  };
  await assert.rejects(() => dispatch(['ring-test', '--yes'], deps), /always requires the exact CALL confirmation/);
  assert.equal(called, false);
});

test('dispatch throws on unknown command', async () => {
  await assert.rejects(() => dispatch(['bogus'], { commands: {}, io: { info: () => {}, error: () => {} } }), /unknown command/i);
});

test('requireNumberByTag returns the number, or throws an actionable error when absent', async () => {
  const present = { findNumberByTag: async () => ({ phoneNumber: '+1A' }) };
  assert.deepEqual(await requireNumberByTag(present, {}, 'emergency-line-active'), { phoneNumber: '+1A' });
  const absent = { findNumberByTag: async () => null };
  await assert.rejects(() => requireNumberByTag(absent, {}, 'emergency-line-test'), /run `npm run setup` first/);
});
