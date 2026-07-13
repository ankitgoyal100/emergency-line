'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { releaseNumbers } = require('../src/commands/release-numbers.js');

function scenario({ prompts = [], failSid } = {}) {
  const events = [];
  const info = [];
  const errors = [];
  const numbers = {
    'emergency-line-home-active': { sid: 'PN_active', phoneNumber: '+15551110001' },
    'emergency-line-home-test': { sid: 'PN_test', phoneNumber: '+15551110002' },
  };
  return {
    events, info, errors,
    deps: {
      findNumberByTag: async (_c, tag) => { events.push(`find:${tag}`); return numbers[tag] || null; },
      releaseNumber: async (_c, sid) => { events.push(`release:${sid}`); if (sid === failSid) throw new Error('failed'); },
    },
    io: {
      info: (message) => info.push(message),
      error: (message) => errors.push(message),
      prompt: async (question) => { events.push(`prompt:${question}`); return prompts.shift() || ''; },
    },
  };
}

test('release-numbers dry-run lists exact instance numbers without releasing', async () => {
  const s = scenario();
  const result = await releaseNumbers({ client: {}, instanceId: 'home', io: s.io, deps: s.deps, dryRun: true });
  assert.equal(result.dryRun, true);
  assert.equal(s.events.some((e) => e.startsWith('release:')), false);
  assert.match(s.info.join('\n'), /permanently release 2/);
});

test('release-numbers requires an exact destructive confirmation', async () => {
  const s = scenario({ prompts: ['no'] });
  await assert.rejects(() => releaseNumbers({ client: {}, instanceId: 'home', io: s.io, deps: s.deps }), /cancelled/);
  assert.equal(s.events.some((e) => e.startsWith('release:')), false);
});

test('release-numbers releases only the two exact instance tags after confirmation', async () => {
  const s = scenario({ prompts: ['RELEASE 2 NUMBERS'] });
  const result = await releaseNumbers({ client: {}, instanceId: 'home', io: s.io, deps: s.deps });
  assert.deepEqual(result.released, ['+15551110001', '+15551110002']);
  assert.ok(s.events.includes('release:PN_active'));
  assert.ok(s.events.includes('release:PN_test'));
});

test('release-numbers reports partial failures as still allocated and billable', async () => {
  const s = scenario({ failSid: 'PN_test' });
  await assert.rejects(
    () => releaseNumbers({ client: {}, instanceId: 'home', io: s.io, deps: s.deps, yes: true }),
    /could not be released/
  );
  assert.match(s.errors.join('\n'), /remains allocated and billable/i);
});
