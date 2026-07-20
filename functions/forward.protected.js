'use strict';

exports.handler = function (context, event, callback) {
  const twiml = require(Runtime.getFunctions()['twiml'].path);
  const messages = require(Runtime.getFunctions()['messages'].path);
  const domain = context.DOMAIN_NAME;
  const to = event.To;
  const realNumber = context.YOUR_REAL_NUMBER;
  const stage = event.stage || 'initial';
  const completed = event.DialCallStatus === 'completed';

  // The synthetic number is never a user-facing line or SMS sender. Sink an
  // initial call when it appears on either side and fail closed on any forged
  // or stale callback stage so it cannot ring the owner or send an alert.
  if (twiml.isTestCaller(event.From, context.TEST_NUMBER)
      || twiml.isTestCaller(to, context.TEST_NUMBER)) {
    return callback(null, stage === 'initial' ? twiml.buildSinkTwiml() : '<Response/>');
  }

  if (!/^\+[1-9]\d{7,14}$/.test(realNumber || '') || !/^\+[1-9]\d{7,14}$/.test(to || '')) {
    return callback(null, twiml.buildUnavailableTwiml());
  }

  const dial = (nextStage) => twiml.buildForwardTwiml({
    to, realNumber,
    timeout: 18,
    action: `https://${domain}/forward?stage=${nextStage}`,
  });

  // Inbound call: sink synthetic/test-number calls, else place the FIRST dial.
  if (stage === 'initial') {
    return callback(null, dial('retry'));
  }

  // Callback after the first dial. completed = human OR carrier voicemail
  // answered → done. Otherwise place the ONE retry (action → stage=voicemail).
  if (stage === 'retry') {
    if (completed) return callback(null, '<Response/>');
    return callback(null, dial('voicemail'));
  }

  // Callback after the retry dial. completed → done. Otherwise record voicemail.
  if (stage === 'voicemail') {
    if (completed) return callback(null, '<Response/>');
    return callback(null, twiml.buildVoicemailTwiml({
      action: `https://${domain}/forward?stage=notify`, maxLength: 60,
    }));
  }

  // Callback after the voicemail recording: text the missed-call alert.
  if (stage === 'notify') {
    if (!messages.smsReadiness(context).ready) return callback(null, '<Response/>');
    const client = context.getTwilioClient();
    const body = messages.missedCallSms({
      from: event.From,
      recordingUrl: event.RecordingUrl,
      brand: context.MESSAGE_BRAND,
    });
    return client.messages.create({ to: realNumber, from: to, body })
      .then(() => callback(null, '<Response/>'))
      .catch((err) => callback(err));
  }

  return callback(null, '<Response/>');
};
