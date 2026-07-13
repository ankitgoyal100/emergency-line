'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const m = require('../functions/messages.private.js');

test('forwardSmsBody labels the original sender', () => {
  assert.equal(
    m.forwardSmsBody({ from: '+1555', body: 'help' }),
    'Emergency Line: Text from +1555: help Reply STOP to opt out.'
  );
  assert.equal(
    m.forwardSmsBody({ from: '+1555', body: 'help', brand: 'Smith Family Line' }),
    'Smith Family Line: Text from +1555: help Reply STOP to opt out.'
  );
});

test('missedCallSms includes the brand, opt-out, and recording state', () => {
  const withRecording = m.missedCallSms({ from: '+1555', recordingUrl: 'https://r/1' });
  const withoutRecording = m.missedCallSms({ from: '+1555', recordingUrl: '' });

  for (const message of [withRecording, withoutRecording]) {
    assert.match(message, /^Emergency Line:/);
    assert.match(message, /Reply STOP to opt out\.$/);
  }
  assert.match(withRecording, /Missed emergency call from \+1555.*https:\/\/r\/1/);
  assert.match(withoutRecording, /No voicemail left/);
});

test('forwardSmsBody never exceeds Twilio body limit and truncates safely', () => {
  const prefix = `${m.DEFAULT_BRAND}: Text from +1555: `;
  const suffix = ` ${m.OPT_OUT}`;
  const available = m.MAX_BODY_LENGTH - prefix.length - suffix.length;
  const ascii = m.forwardSmsBody({ from: '+1555', body: 'x'.repeat(1600) });
  const unicode = m.forwardSmsBody({ from: '+1555', body: `${'x'.repeat(available - 2)}😀y` });

  assert.equal(ascii.length, m.MAX_BODY_LENGTH);
  assert.match(ascii, /… Reply STOP to opt out\.$/);
  assert.ok(unicode.length <= m.MAX_BODY_LENGTH);
  assert.doesNotMatch(unicode, /[\uD800-\uDBFF]…/);
  assert.match(unicode, /Reply STOP to opt out\.$/);
});

test('brand is neutral by default, configurable, and stripped of line breaks', () => {
  assert.equal(m.DEFAULT_BRAND, 'Emergency Line');
  assert.equal(m.messageBrand('  My\nLine  '), 'My Line');
  assert.equal(m.messageBrand(''), 'Emergency Line');
});

test('SMS readiness is fail-closed until explicitly enabled with a valid destination', () => {
  assert.deepEqual(m.smsReadiness({ YOUR_REAL_NUMBER: '+15551234567' }), { enabled: false, ready: false });
  assert.deepEqual(m.smsReadiness({ SMS_ENABLED: 'TRUE', YOUR_REAL_NUMBER: '+15551234567' }), { enabled: false, ready: false });
  assert.deepEqual(m.smsReadiness({ SMS_ENABLED: 'true', YOUR_REAL_NUMBER: '555' }), { enabled: true, ready: false });
  assert.deepEqual(m.smsReadiness({ SMS_ENABLED: 'true', YOUR_REAL_NUMBER: '+15551234567' }), { enabled: true, ready: true });
});
