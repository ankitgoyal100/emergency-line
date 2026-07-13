'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const twilio = require('twilio');
const s = require('../functions/security.private.js');

test('checkHealthToken accepts exact match, rejects mismatch/empty', () => {
  assert.equal(s.checkHealthToken('abc123', 'abc123'), true);
  assert.equal(s.checkHealthToken('abc123', 'abc124'), false);
  assert.equal(s.checkHealthToken('', 'abc123'), false);
  assert.equal(s.checkHealthToken('abc123', ''), false);
  assert.equal(s.checkHealthToken('short', 'longertoken'), false);
});

test('twilioSignature matches Twilio algorithm and round-trips through isValidSignature', () => {
  const token = 'test_auth_token';
  const url = 'https://x.twil.io/forward';
  const params = { To: '+1555', From: '+1999', CallSid: 'CA1' };
  const sig = s.twilioSignature(token, url, params);
  assert.equal(typeof sig, 'string');
  assert.equal(s.isValidSignature({ authToken: token, signature: sig, url, params }), true);
  assert.equal(s.isValidSignature({ authToken: token, signature: 'wrong', url, params }), false);
  assert.equal(s.isValidSignature({ authToken: token, signature: sig, url, params: { To: '+1666' } }), false);
});

test('twilioSignature does not throw on missing params and equals the {} case', () => {
  assert.doesNotThrow(() => s.twilioSignature('tok', 'https://x'));
  assert.equal(s.twilioSignature('tok', 'https://x'), s.twilioSignature('tok', 'https://x', {}));
});

// Parity test: cross-check our hand-rolled algorithm against the REAL Twilio
// library (twilio@5). twilio.validateRequest(authToken, signature, url, params)
// is the canonical verifier used by Twilio Functions.
test('twilioSignature is byte-for-byte compatible with the real twilio library', () => {
  const token = 'AC_fake_auth_token_for_parity_1234567890';
  const url = 'https://x.twil.io/forward';
  const params = { To: '+15551230000', From: '+19995550000', CallSid: 'CA0123456789abcdef', Digits: '1' };

  const ourSig = s.twilioSignature(token, url, params);

  // 1. The real library must accept a signature produced by our function.
  assert.equal(twilio.validateRequest(token, ourSig, url, params), true,
    'real twilio.validateRequest rejected our signature');

  // 2. Our verifier and twilio.validateRequest must AGREE on a valid signature.
  assert.equal(s.isValidSignature({ authToken: token, signature: ourSig, url, params }), true);
  assert.equal(twilio.validateRequest(token, ourSig, url, params), true);

  // 3. Both must AGREE on rejecting a tampered signature.
  const tampered = ourSig.slice(0, -2) + (ourSig.endsWith('A') ? 'BB' : 'AA');
  assert.notEqual(tampered, ourSig);
  assert.equal(s.isValidSignature({ authToken: token, signature: tampered, url, params }), false);
  assert.equal(twilio.validateRequest(token, tampered, url, params), false);
});
