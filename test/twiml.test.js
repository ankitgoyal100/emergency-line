'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const twiml = require('../functions/twiml.private.js');

test('isTestCaller matches only the exact test number', () => {
  assert.equal(twiml.isTestCaller('+1999', '+1999'), true);
  assert.equal(twiml.isTestCaller('+1888', '+1999'), false);
  assert.equal(twiml.isTestCaller('+1999', ''), false);
});

test('buildForwardTwiml dials the real number with the line as caller ID', () => {
  const xml = twiml.buildForwardTwiml({
    to: '+15550001111', realNumber: '+15552223333', timeout: 18,
    action: 'https://x.twil.io/forward?stage=retry',
  });
  assert.match(xml, /<Dial[^>]*callerId="\+15550001111"/);
  assert.match(xml, /timeout="18"/);
  assert.match(xml, /answerOnBridge="true"/);
  assert.match(xml, /action="https:\/\/x\.twil\.io\/forward\?stage=retry"/);
  assert.match(xml, />\+15552223333<\/Number>/);
  assert.doesNotMatch(xml, /url=/);
});

test('buildVoicemailTwiml records with a beep and posts to the action', () => {
  const xml = twiml.buildVoicemailTwiml({ action: 'https://x.twil.io/forward?stage=notify', maxLength: 60 });
  assert.match(xml, /<Record[^>]*action="https:\/\/x\.twil\.io\/forward\?stage=notify"/);
  assert.match(xml, /maxLength="60"/);
});

test('buildSinkTwiml says ok and hangs up (never rings a phone)', () => {
  const xml = twiml.buildSinkTwiml();
  assert.match(xml, /health ok/);
  assert.match(xml, /<Hangup\/>/);
  assert.doesNotMatch(xml, /<Dial/);
});

test('buildUnavailableTwiml explains misconfiguration without dialing', () => {
  const xml = twiml.buildUnavailableTwiml();
  assert.match(xml, /not configured correctly/);
  assert.match(xml, /<Hangup\/>/);
  assert.doesNotMatch(xml, /<Dial/);
});
