'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const m = require('../functions/messages.private.js');

test('missedCallSms includes the brand, HELP/STOP instructions, and recording state', () => {
  const withRecording = m.missedCallSms({ from: '+1555', recordingUrl: 'https://r/1' });
  const withoutRecording = m.missedCallSms({ from: '+1555', recordingUrl: '' });

  for (const message of [withRecording, withoutRecording]) {
    assert.match(message, /^Emergency Line:/);
    assert.match(message, /Reply HELP for help or STOP to opt out\.$/);
  }
  assert.match(withRecording, /Automated voicemail notification from \+1555.*https:\/\/r\/1/);
  assert.match(withoutRecording, /Automated missed-call notification from \+1555.*No voicemail was left/);
});

test('brand is neutral by default, configurable, and stripped of line breaks', () => {
  assert.equal(m.DEFAULT_BRAND, 'Emergency Line');
  assert.equal(m.messageBrand('  My\nLine  '), 'My Line');
  assert.equal(m.messageBrand(''), 'Emergency Line');
});

test('SMS readiness is fail-closed until explicitly enabled with a valid destination', () => {
  assert.deepEqual(m.smsReadiness({ YOUR_REAL_NUMBER: '+15551234567' }), { enabled: false, ready: false });
  assert.deepEqual(m.smsReadiness({ SMS_ENABLED: 'TRUE', YOUR_REAL_NUMBER: '+15551234567' }), { enabled: false, ready: false });
  assert.deepEqual(m.smsReadiness({ SMS_ENABLED: 'true', YOUR_REAL_NUMBER: '+15551234567' }), { enabled: true, ready: false });
  assert.deepEqual(m.smsReadiness({ SMS_ENABLED: 'true', YOUR_REAL_NUMBER: '555', MESSAGE_BRAND: 'Emergency Line' }), { enabled: true, ready: false });
  assert.deepEqual(m.smsReadiness({ SMS_ENABLED: 'true', YOUR_REAL_NUMBER: '+15551234567', MESSAGE_BRAND: '   ' }), { enabled: true, ready: false });
  assert.deepEqual(m.smsReadiness({ SMS_ENABLED: 'true', YOUR_REAL_NUMBER: '+15551234567', MESSAGE_BRAND: 'x'.repeat(81) }), { enabled: true, ready: false });
  assert.deepEqual(m.smsReadiness({ SMS_ENABLED: 'true', YOUR_REAL_NUMBER: '+15551234567', MESSAGE_BRAND: 'Bad\nBrand' }), { enabled: true, ready: false });
  assert.deepEqual(m.smsReadiness({ SMS_ENABLED: 'true', YOUR_REAL_NUMBER: '+15551234567', MESSAGE_BRAND: 'Emergency Line' }), { enabled: true, ready: true });
});
