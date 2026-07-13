'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertForwardTwiml, probeFunction } = require('../monitor/check-function.js');
const security = require('../functions/security.private.js');

test('assertForwardTwiml checks dial, caller ID, and (when given) the forwarded number', () => {
  const xml = '<Response><Dial callerId="+1LINE" timeout="18"><Number>+1REAL</Number></Dial></Response>';
  assert.equal(assertForwardTwiml(xml, { expectedCallerId: '+1LINE' }).ok, true);
  assert.equal(assertForwardTwiml('<Response/>', { expectedCallerId: '+1LINE' }).ok, false);
  const wrong = '<Response><Dial callerId="+1WRONG" timeout="18"><Number>+1REAL</Number></Dial></Response>';
  assert.equal(assertForwardTwiml(wrong, { expectedCallerId: '+1LINE' }).ok, false);
  // forwarded-number verification
  assert.equal(assertForwardTwiml(xml, { expectedCallerId: '+1LINE', expectedRealNumber: '+1REAL' }).ok, true);
  const wrongNum = assertForwardTwiml(xml, { expectedCallerId: '+1LINE', expectedRealNumber: '+1OTHER' });
  assert.equal(wrongNum.ok, false);
  assert.ok(wrongNum.problems.some((p) => /destination does not match/.test(p)));
  assert.ok(wrongNum.problems.every((p) => !p.includes('+1OTHER')));
});

test('probeFunction signs the request over the exact posted url+params and validates the response', async () => {
  let seen = null;
  const fetchImpl = async (url, opts) => {
    seen = { url, opts };
    return { status: 200, text: async () => '<Response><Dial callerId="+15550000000" timeout="18"><Number>+1REAL</Number></Dial></Response>' };
  };
  const r = await probeFunction({ functionUrl: 'https://x.twil.io', authToken: 'tok', fetchImpl, lineNumber: '+15550000000' });
  assert.equal(r.ok, true);
  assert.equal(seen.url, 'https://x.twil.io/forward');
  assert.match(seen.opts.body, /From=/);
  const posted = Object.fromEntries(new URLSearchParams(seen.opts.body));
  assert.equal(seen.opts.headers['X-Twilio-Signature'], security.twilioSignature('tok', seen.url, posted));
});

test('probeFunction normalizes a trailing slash before signing and posting', async () => {
  let seen = null;
  const fetchImpl = async (url, opts) => {
    seen = { url, opts };
    return { status: 200, text: async () => '<Response><Dial callerId="+15550000000" timeout="18"><Number>+1REAL</Number></Dial></Response>' };
  };
  const r = await probeFunction({ functionUrl: 'https://x.twil.io/', authToken: 'tok', fetchImpl, lineNumber: '+15550000000' });
  assert.equal(r.ok, true);
  assert.equal(seen.url, 'https://x.twil.io/forward');
  const posted = Object.fromEntries(new URLSearchParams(seen.opts.body));
  assert.equal(seen.opts.headers['X-Twilio-Signature'], security.twilioSignature('tok', seen.url, posted));
});

test('probeFunction fails when the deployed forwarding number does not match expected', async () => {
  const fetchImpl = async () => ({ status: 200, text: async () => '<Response><Dial callerId="+15550000000" timeout="18"><Number>+15559999999</Number></Dial></Response>' });
  const r = await probeFunction({ functionUrl: 'https://x.twil.io', authToken: 'tok', fetchImpl, lineNumber: '+15550000000', expectedRealNumber: '+15551234567' });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /destination does not match/.test(p)));
  assert.ok(r.problems.every((p) => !p.includes('+15551234567')));
});
