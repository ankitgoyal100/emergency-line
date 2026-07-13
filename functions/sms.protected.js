'use strict';

exports.handler = function (context, event, callback) {
  const twiml = require(Runtime.getFunctions()['twiml'].path);
  const messages = require(Runtime.getFunctions()['messages'].path);

  // SMS is fail-closed. Setting SMS_ENABLED=true is an operator attestation
  // that registration and sender configuration are complete for this number.
  if (!messages.smsReadiness(context).ready) {
    return callback(null, '<Response/>');
  }

  // Test-number texts are health probes — accept but do not forward.
  if (twiml.isTestCaller(event.From, context.TEST_NUMBER)) {
    return callback(null, '<Response/>');
  }
  const client = context.getTwilioClient();
  const body = messages.forwardSmsBody({
    from: event.From,
    body: event.Body || '',
    brand: context.MESSAGE_BRAND,
  });
  return client.messages.create({ to: context.YOUR_REAL_NUMBER, from: event.To, body })
    .then(() => callback(null, '<Response/>'))
    .catch((err) => callback(err));
};
