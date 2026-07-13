'use strict';
const VoiceResponse = require('twilio').twiml.VoiceResponse;

function isTestCaller(from, testNumber) {
  return !!testNumber && from === testNumber;
}

function buildForwardTwiml({ to, realNumber, timeout = 18, action }) {
  const vr = new VoiceResponse();
  const dial = vr.dial({ callerId: to, timeout, action, method: 'POST', answerOnBridge: true });
  dial.number(realNumber);
  return vr.toString();
}

function buildVoicemailTwiml({ action, maxLength = 60 }) {
  const vr = new VoiceResponse();
  vr.say({ voice: 'Polly.Joanna' }, 'The person you are calling is not available. Please leave a message after the tone. This message is recorded.');
  vr.record({ maxLength, action, method: 'POST', playBeep: true });
  vr.say({ voice: 'Polly.Joanna' }, 'No message was recorded. Goodbye.');
  vr.hangup();
  return vr.toString();
}

function buildSinkTwiml() {
  const vr = new VoiceResponse();
  vr.say('health ok');
  vr.hangup();
  return vr.toString();
}

function buildUnavailableTwiml() {
  const vr = new VoiceResponse();
  vr.say('This line is not configured correctly. Please contact the line owner another way.');
  vr.hangup();
  return vr.toString();
}

module.exports = {
  isTestCaller,
  buildForwardTwiml, buildVoicemailTwiml, buildSinkTwiml, buildUnavailableTwiml,
};
