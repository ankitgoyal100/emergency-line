'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runSwap } = require('../src/commands/swap.js');

function scenario(overrides = {}) {
  const events = [];
  const info = [];
  const errors = [];
  const prompts = [...(overrides.prompts || ['RANG', 'RELEASE 0113'])];
  const old = overrides.old === null ? null : { sid: 'PN_old', phoneNumber: '+12025550113' };
  const deps = {
    findNumberByTag: async (_c, tag) => {
      events.push(`find:${tag}`);
      if (tag.endsWith('-provisional')) return overrides.provisional || null;
      return old;
    },
    buyNumber: async (_c, opts) => {
      events.push(`buy:${opts.friendlyName}`);
      if (overrides.buyThrows) throw new Error('buy failed');
      return { sid: 'PN_new', phoneNumber: '+12025550114' };
    },
    setFriendlyName: async (_c, sid, name) => {
      events.push(`name:${sid}:${name}`);
      if (overrides.nameThrowsFor === sid) throw new Error(`name ${sid} failed`);
      if (overrides.restoreThrows && sid === 'PN_old' && name.endsWith('-active')) throw new Error('restore failed');
    },
    releaseNumber: async (_c, sid) => {
      events.push(`release:${sid}`);
      if (overrides.releaseThrowsFor === sid) throw new Error(`release ${sid} failed`);
    },
  };
  const io = {
    info: (message) => info.push(message),
    error: (message) => errors.push(message),
    prompt: async (question) => { events.push(`prompt:${question}`); return prompts.shift() || ''; },
  };
  const verify = async () => {
    events.push('verify');
    if (overrides.verifyThrows) throw new Error('verify boom');
    return overrides.verifyOk !== false;
  };
  return { deps, io, verify, events, info, errors };
}

function run(s, extra = {}) {
  return runSwap({ client: {}, functionUrl: 'https://x.twil.io', io: s.io, deps: s.deps, verify: s.verify, yes: true, ...extra });
}

test('safe happy path: probe, physical confirmation, promote, then explicit old-number release', async () => {
  const s = scenario();
  const number = await run(s);
  assert.equal(number, '+12025550114');
  assert.deepEqual(s.events.filter((e) => !e.startsWith('prompt:')), [
    'find:emergency-line-active',
    'find:emergency-line-active-provisional',
    'buy:emergency-line-active-provisional',
    'verify',
    'name:PN_old:emergency-line-active-retired-PN_old',
    'name:PN_new:emergency-line-active',
    'release:PN_old',
  ]);
  assert.match(s.info.join('\n'), /physically confirm/i);
});

test('a stranded provisional number blocks another purchase', async () => {
  const s = scenario({ provisional: { sid: 'PN_stranded', phoneNumber: '+12025550115' } });
  await assert.rejects(() => run(s), /provisional number.*still exists/i);
  assert.equal(s.events.some((e) => e.startsWith('buy:')), false);
});

test('physical-ring confirmation cannot be bypassed by --yes; refusal rolls back new and retains old', async () => {
  const s = scenario({ prompts: ['not confirmed'] });
  await assert.rejects(() => run(s), /physical ring was not confirmed/);
  assert.ok(s.events.includes('release:PN_new'));
  assert.equal(s.events.some((e) => e.startsWith('name:PN_old')), false);
  assert.equal(s.events.includes('release:PN_old'), false);
});

test('declining old-number release retains it after the new line is active', async () => {
  const s = scenario({ prompts: ['RANG', ''] });
  const number = await run(s);
  assert.equal(number, '+12025550114');
  assert.equal(s.events.includes('release:PN_old'), false);
  assert.match(s.info.join('\n'), /remains functional and billable/i);
});

test('pre-purchase confirmation and dry-run prevent accidental charges', async () => {
  const cancelled = scenario({ prompts: ['no'] });
  await assert.rejects(() => runSwap({
    client: {}, functionUrl: 'https://x.twil.io', io: cancelled.io, deps: cancelled.deps, verify: cancelled.verify,
  }), /cancelled before purchase/);
  assert.equal(cancelled.events.some((e) => e.startsWith('buy:')), false);

  const dry = scenario();
  const result = await run(dry, { dryRun: true });
  assert.equal(result.dryRun, true);
  assert.equal(dry.events.some((e) => e.startsWith('buy:')), false);
});

test('webhook probe failure or exception releases new and never changes old', async () => {
  for (const overrides of [{ verifyOk: false }, { verifyThrows: true }]) {
    const s = scenario(overrides);
    await assert.rejects(() => run(s), /verification failed/);
    assert.ok(s.events.includes('release:PN_new'));
    assert.equal(s.events.some((e) => e.startsWith('name:')), false);
    assert.equal(s.events.includes('release:PN_old'), false);
  }
});

test('rollback release failure is loudly reported without touching old', async () => {
  const s = scenario({ verifyOk: false, releaseThrowsFor: 'PN_new' });
  await assert.rejects(() => run(s), /verification failed/);
  assert.match(s.errors.join('\n'), /remains billable/i);
  assert.equal(s.events.includes('release:PN_old'), false);
});

test('buy failure leaves old untouched', async () => {
  const s = scenario({ buyThrows: true });
  await assert.rejects(() => run(s), /buy failed/);
  assert.equal(s.events.some((e) => e.startsWith('name:') || e.startsWith('release:')), false);
});

test('failure to retire the old tag rolls back provisional and preserves old', async () => {
  const s = scenario({ nameThrowsFor: 'PN_old', prompts: ['RANG'] });
  await assert.rejects(() => run(s), /existing line.*retained/i);
  assert.ok(s.events.includes('release:PN_new'));
  assert.equal(s.events.includes('release:PN_old'), false);
});

test('promotion failure restores old active tag and releases provisional', async () => {
  const s = scenario({ nameThrowsFor: 'PN_new', prompts: ['RANG'] });
  await assert.rejects(() => run(s), /old number was not released/i);
  assert.ok(s.events.includes('name:PN_old:emergency-line-active'));
  assert.ok(s.events.includes('release:PN_new'));
  assert.equal(s.events.includes('release:PN_old'), false);
});

test('old release failure leaves new active and reports old as billable', async () => {
  const s = scenario({ releaseThrowsFor: 'PN_old' });
  const number = await run(s);
  assert.equal(number, '+12025550114');
  assert.match(s.errors.join('\n'), /remains billable/i);
});

test('first-time swap promotes after physical confirmation and releases nothing else', async () => {
  const s = scenario({ old: null, prompts: ['RANG'] });
  const number = await run(s, { instanceId: 'home' });
  assert.equal(number, '+12025550114');
  assert.ok(s.events.includes('name:PN_new:emergency-line-home-active'));
  assert.equal(s.events.includes('release:PN_old'), false);
});

test('swap validates URL and area code before touching Twilio', async () => {
  for (const input of [
    { functionUrl: '', areaCode: '415', error: /FUNCTION_URL/ },
    { functionUrl: 'https://x.twil.io', areaCode: '111', error: /DEFAULT_AREA_CODE/ },
  ]) {
    const s = scenario();
    await assert.rejects(() => runSwap({
      client: {}, functionUrl: input.functionUrl, areaCode: input.areaCode, io: s.io, deps: s.deps, verify: s.verify, yes: true,
    }), input.error);
    assert.deepEqual(s.events, []);
  }
});
