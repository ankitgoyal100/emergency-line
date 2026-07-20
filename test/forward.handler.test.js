'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installTwilioRuntime } = require('./helpers/twilio-runtime.js');
installTwilioRuntime();
const forward = require('../functions/forward.protected.js');

function ctx(extra = {}) {
  return Object.assign({
    DOMAIN_NAME: 'x.twil.io',
    YOUR_REAL_NUMBER: '+15552223333',
    TEST_NUMBER: '+15559998888',
    SMS_ENABLED: 'true',
    MESSAGE_BRAND: 'Family Emergency Line',
    getTwilioClient: () => ({ messages: { create: async () => ({ sid: 'SM1' }) } }),
  }, extra);
}
function run(handler, context, event) {
  return new Promise((resolve, reject) => {
    handler.handler(context, event, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

test('initial call from a real caller forwards with line as caller ID + whisper url', async () => {
  const xml = await run(forward, ctx(), { To: '+15550001111', From: '+15551234567' });
  assert.match(xml, /callerId="\+15550001111"/);
  assert.match(xml, /timeout="18"/);
  assert.doesNotMatch(xml, /whisper/);
  assert.match(xml, /stage=retry/);
});

test('initial call from the test number returns the sink (no dial)', async () => {
  const xml = await run(forward, ctx(), { To: '+15550001111', From: '+15559998888' });
  assert.match(xml, /health ok/);
  assert.doesNotMatch(xml, /<Dial/);
});

test('initial call to the synthetic test number returns the sink and never rings the owner', async () => {
  const xml = await run(forward, ctx(), { To: '+15559998888', From: '+15551234567' });
  assert.match(xml, /health ok/);
  assert.doesNotMatch(xml, /<Dial/);
});

test('invalid destination configuration fails closed without dialing', async () => {
  const xml = await run(forward, ctx({ YOUR_REAL_NUMBER: 'replace-me' }), {
    To: '+15550001111', From: '+15551234567',
  });
  assert.match(xml, /not configured correctly/);
  assert.doesNotMatch(xml, /<Dial/);
});

test('retry stage re-dials once on no-answer, escalates action to voicemail', async () => {
  const xml = await run(forward, ctx(), { To: '+15550001111', From: '+15551234567', stage: 'retry', DialCallStatus: 'no-answer' });
  assert.match(xml, /<Dial/);
  assert.match(xml, /stage=voicemail/);
});

test('retry stage does nothing when the human already answered', async () => {
  const xml = await run(forward, ctx(), { To: '+15550001111', From: '+1', stage: 'retry', DialCallStatus: 'completed' });
  assert.doesNotMatch(xml, /<Dial/);
});

test('voicemail stage records and posts to notify', async () => {
  const xml = await run(forward, ctx(), { To: '+15550001111', From: '+1', stage: 'voicemail', DialCallStatus: 'no-answer' });
  assert.match(xml, /<Record/);
  assert.match(xml, /stage=notify/);
});

test('voicemail stage does nothing when the retry was answered (second carrier-voicemail guard)', async () => {
  const xml = await run(forward, ctx(), { To: '+15550001111', From: '+1', stage: 'voicemail', DialCallStatus: 'completed' });
  assert.doesNotMatch(xml, /<Record/);
  assert.doesNotMatch(xml, /<Dial/);
});

test('notify stage propagates SMS failure via callback (never hangs)', async () => {
  const context = ctx({ getTwilioClient: () => ({ messages: { create: async () => { throw new Error('sms down'); } } }) });
  await assert.rejects(
    () => run(forward, context, { To: '+15550001111', From: '+15551234567', stage: 'notify', RecordingUrl: 'https://r/1' }),
    /sms down/
  );
});

test('notify stage sends the missed-call SMS from the line to the real number', async () => {
  let sent = null;
  const context = ctx({ getTwilioClient: () => ({ messages: { create: async (a) => { sent = a; return { sid: 'SM1' }; } } }) });
  await run(forward, context, { To: '+15550001111', From: '+15551234567', stage: 'notify', RecordingUrl: 'https://r/1' });
  assert.equal(sent.from, '+15550001111');
  assert.equal(sent.to, '+15552223333');
  assert.match(sent.body, /Family Emergency Line: Automated voicemail notification from \+15551234567/);
  assert.match(sent.body, /Reply HELP for help or STOP to opt out\.$/);
});

test('notify stage sends the no-voicemail message when no recording URL exists', async () => {
  let sent = null;
  const context = ctx({ getTwilioClient: () => ({ messages: { create: async (a) => { sent = a; return { sid: 'SM1' }; } } }) });
  await run(forward, context, { To: '+15550001111', From: '+15551234567', stage: 'notify' });
  assert.match(sent.body, /Family Emergency Line: Automated missed-call notification from \+15551234567\. No voicemail was left\./);
});

test('notify stage sends nothing when SMS has not been explicitly enabled', async () => {
  let called = false;
  const context = ctx({
    SMS_ENABLED: undefined,
    getTwilioClient: () => ({ messages: { create: async () => { called = true; return {}; } } }),
  });
  await run(forward, context, { To: '+15550001111', From: '+15551234567', stage: 'notify' });
  assert.equal(called, false);
});

for (const event of [
  { To: '+15559998888', From: '+15551234567', stage: 'notify', RecordingUrl: 'https://r/1' },
  { To: '+15550001111', From: '+15559998888', stage: 'notify', RecordingUrl: 'https://r/1' },
]) {
  test('synthetic-number callback cannot originate an SMS', async () => {
    let called = false;
    const context = ctx({ getTwilioClient: () => ({ messages: { create: async () => { called = true; return {}; } } }) });
    const xml = await run(forward, context, event);
    assert.equal(xml, '<Response/>');
    assert.equal(called, false);
  });
}
