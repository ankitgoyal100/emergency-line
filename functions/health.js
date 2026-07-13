'use strict';

exports.handler = function (context, event, callback) {
  const security = require(Runtime.getFunctions()['security'].path);
  const messages = require(Runtime.getFunctions()['messages'].path);
  const res = new Twilio.Response();
  res.appendHeader('Content-Type', 'application/json');

  if (!security.checkHealthToken(event.token, context.HEALTH_TOKEN)) {
    res.setStatusCode(403);
    res.setBody({ ok: false, error: 'forbidden' });
    return callback(null, res);
  }
  const voiceReady = /^\+[1-9]\d{7,14}$/.test(context.YOUR_REAL_NUMBER || '')
    && /^\+[1-9]\d{7,14}$/.test(context.TEST_NUMBER || '');
  const sms = messages.smsReadiness(context);
  const ok = voiceReady;
  res.setStatusCode(ok ? 200 : 500);
  res.setBody({
    ok,
    service: 'emergency-line',
    capabilities: {
      voice: { ready: voiceReady },
      sms,
    },
  });
  return callback(null, res);
};
