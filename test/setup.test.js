'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runSetup } = require('../src/commands/setup.js');

function scenario({ existing = {}, failBuyAt, failRelease = false, prompts = [] } = {}) {
  const events = [];
  const info = [];
  const errors = [];
  let buys = 0;
  const deps = {
    findNumberByTag: async (_c, tag) => { events.push(`find:${tag}`); return existing[tag] || null; },
    buyNumber: async (_c, opts) => {
      buys += 1;
      events.push(`buy:${opts.friendlyName}`);
      if (buys === failBuyAt) throw new Error('buy failed');
      const phoneNumber = buys === 1 ? '+12025550101' : '+12025550102';
      return { sid: `PN_new_${buys}`, phoneNumber };
    },
    setWebhooks: async (_c, sid, opts) => { events.push(`wire:${sid}:${opts.voiceUrl}:${opts.smsUrl}`); },
    releaseNumber: async (_c, sid) => {
      events.push(`release:${sid}`);
      if (failRelease) throw new Error('release failed');
    },
  };
  const io = {
    info: (message) => info.push(message),
    error: (message) => errors.push(message),
    prompt: async (question) => { events.push(`prompt:${question}`); return prompts.shift() || ''; },
  };
  return { deps, io, events, info, errors };
}

test('setup previews cost and buys both numbers only after confirmation', async () => {
  const s = scenario({ prompts: ['BUY 2'] });
  const res = await runSetup({ client: {}, functionUrl: 'https://x.twil.io', areaCode: 415, io: s.io, deps: s.deps });
  assert.deepEqual(res, { active: '+12025550101', test: '+12025550102' });
  assert.ok(s.events.some((e) => e.startsWith('prompt:Type BUY 2')));
  assert.ok(s.events.includes('buy:emergency-line-active'));
  assert.ok(s.events.includes('buy:emergency-line-test'));
  assert.match(s.info.join('\n'), /recurring monthly fee/i);
});

test('setup cancellation and dry-run make no mutations or purchases', async () => {
  const cancelled = scenario({ prompts: ['no'] });
  await assert.rejects(
    () => runSetup({ client: {}, functionUrl: 'https://x.twil.io', areaCode: '415', io: cancelled.io, deps: cancelled.deps }),
    /cancelled/
  );
  assert.equal(cancelled.events.some((e) => e.startsWith('buy:')), false);

  const dry = scenario();
  const result = await runSetup({ client: {}, functionUrl: 'https://x.twil.io', areaCode: '415', io: dry.io, deps: dry.deps, dryRun: true });
  assert.equal(result.dryRun, true);
  assert.equal(dry.events.some((e) => e.startsWith('buy:') || e.startsWith('wire:')), false);
});

test('setup --yes buys without a prompt and unique instance tags isolate numbers', async () => {
  const s = scenario();
  await runSetup({ client: {}, functionUrl: 'https://x.twil.io', areaCode: '415', instanceId: 'family-1', io: s.io, deps: s.deps, yes: true });
  assert.ok(s.events.includes('buy:emergency-line-family-1-active'));
  assert.ok(s.events.includes('buy:emergency-line-family-1-test'));
  assert.equal(s.events.some((e) => e.startsWith('prompt:')), false);
});

test('setup rewires existing tagged numbers only after explicit confirmation', async () => {
  const s = scenario({ existing: {
    'emergency-line-active': { sid: 'PN_A', phoneNumber: '+12025550111' },
    'emergency-line-test': { sid: 'PN_T', phoneNumber: '+12025550112' },
  }, prompts: ['REWIRE 2'] });
  const res = await runSetup({ client: {}, functionUrl: 'https://x.twil.io/', areaCode: 415, io: s.io, deps: s.deps });
  assert.deepEqual(res, { active: '+12025550111', test: '+12025550112' });
  assert.equal(s.events.some((e) => e.startsWith('buy:')), false);
  assert.ok(s.events.some((e) => e.startsWith('prompt:Type REWIRE 2')));
  assert.ok(s.events.some((e) => e === 'wire:PN_A:https://x.twil.io/forward:https://x.twil.io/sms'));
  assert.ok(s.events.some((e) => e === 'wire:PN_T:https://x.twil.io/forward:https://x.twil.io/sms'));
});

test('declining an existing-number rewire makes no mutation', async () => {
  const s = scenario({ existing: {
    'emergency-line-active': { sid: 'PN_A', phoneNumber: '+12025550111' },
    'emergency-line-test': { sid: 'PN_T', phoneNumber: '+12025550112' },
  }, prompts: ['no'] });
  await assert.rejects(
    () => runSetup({ client: {}, functionUrl: 'https://x.twil.io', areaCode: 415, io: s.io, deps: s.deps }),
    /cancelled before changing/i
  );
  assert.equal(s.events.some((e) => e.startsWith('wire:') || e.startsWith('buy:')), false);
});

test('partial setup failure releases every number bought by that invocation', async () => {
  const s = scenario({ failBuyAt: 2 });
  await assert.rejects(
    () => runSetup({ client: {}, functionUrl: 'https://x.twil.io', areaCode: 415, io: s.io, deps: s.deps, yes: true }),
    /buy failed/
  );
  assert.ok(s.events.includes('release:PN_new_1'));
  assert.equal(s.events.some((e) => e.startsWith('wire:')), false);
});

test('partial setup reports a cleanup failure without masking the buy failure', async () => {
  const s = scenario({ failBuyAt: 2, failRelease: true });
  await assert.rejects(
    () => runSetup({ client: {}, functionUrl: 'https://x.twil.io', areaCode: 415, io: s.io, deps: s.deps, yes: true }),
    /buy failed/
  );
  assert.match(s.errors.join('\n'), /remains billable/i);
});

test('setup validates URL and area code before touching Twilio', async () => {
  for (const input of [
    { functionUrl: undefined, areaCode: '415', error: /FUNCTION_URL/ },
    { functionUrl: 'https://x.twil.io', areaCode: '012', error: /DEFAULT_AREA_CODE/ },
  ]) {
    const s = scenario();
    await assert.rejects(
      () => runSetup({ client: {}, functionUrl: input.functionUrl, areaCode: input.areaCode, io: s.io, deps: s.deps }),
      input.error
    );
    assert.deepEqual(s.events, []);
  }
});
