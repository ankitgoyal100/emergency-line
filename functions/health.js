'use strict';

function getHealthToken(event) {
  const headers = event && event.request && event.request.headers;
  if (!headers || typeof headers !== 'object') return '';
  const name = Object.keys(headers).find((key) => key.toLowerCase() === 'x-health-token');
  const value = name && headers[name];
  return typeof value === 'string' ? value : '';
}

exports.handler = async function (context, event, callback) {
  const security = require(Runtime.getFunctions()['security'].path);
  const messages = require(Runtime.getFunctions()['messages'].path);
  const providerHealth = require(Runtime.getFunctions()['provider-health'].path);
  const res = new Twilio.Response();
  res.appendHeader('Content-Type', 'application/json');
  res.appendHeader('Cache-Control', 'no-store');

  if (!security.checkHealthToken(getHealthToken(event), context.HEALTH_TOKEN)) {
    res.setStatusCode(403);
    res.setBody({ ok: false, error: 'forbidden' });
    return callback(null, res);
  }
  const voiceReady = /^\+[1-9]\d{7,14}$/.test(context.YOUR_REAL_NUMBER || '')
    && /^\+[1-9]\d{7,14}$/.test(context.TEST_NUMBER || '');
  const sms = messages.smsReadiness(context);

  let provider = { ok: false, checks: providerHealth.emptyChecks() };
  let providerAvailable = true;
  if (voiceReady) {
    try {
      provider = await providerHealth.inspectProvider(context);
    } catch (_) {
      providerAvailable = false;
    }
  }

  const ok = voiceReady && providerAvailable && provider.ok;
  res.setStatusCode(ok ? 200 : (providerAvailable ? 500 : 503));
  res.setBody({
    ok,
    ...(ok ? { marker: 'emergency-line-m1-ok' } : {}),
    service: 'emergency-line',
    capabilities: {
      voice: { ready: voiceReady },
      sms,
    },
    checks: {
      runtime: voiceReady,
      provider: providerAvailable,
      ...provider.checks,
    },
  });
  return callback(null, res);
};
