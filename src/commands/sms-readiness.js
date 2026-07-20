'use strict';

const tcDefault = require('../twilio-client.js');
const { requireHttpsUrl, requireE164, requireBooleanFlag } = require('../validate.js');
const { getTags } = require('../tags.js');

// This is deliberately a human gate, not an automated compliance claim.
// Carrier approval, sender registration, real delivery, and STOP/START/HELP behavior
// cannot be inferred safely from the presence of local environment variables.
async function smsReadiness({ client, functionUrl, instanceId, smsEnabled, messageBrand, io, deps = tcDefault }) {
  const baseUrl = requireHttpsUrl('FUNCTION_URL', functionUrl);
  if (typeof messageBrand !== 'string' || !messageBrand.trim() || messageBrand.length > 80 || /[\r\n\t]/.test(messageBrand)) {
    throw new Error('MESSAGE_BRAND must identify the registered sender before SMS readiness can be confirmed.');
  }
  const tags = getTags(instanceId);
  const active = await deps.findNumberByTag(client, tags.active);
  if (!active) throw new Error('No active number exists for this installation.');
  const phoneNumber = requireE164('active Twilio number', active.phoneNumber);
  if (active.smsUrl !== `${baseUrl}/sms` || active.smsMethod !== 'POST') {
    throw new Error('The active number does not have the expected POST /sms webhook. SMS is not ready.');
  }

  const suffix = phoneNumber.slice(-4);
  const providerChecks = [
    ['After confirming the campaign is approved (not pending), type APPROVED: ', 'APPROVED'],
    [`After confirming the active sender ending ${suffix} is individually registered, type REGISTERED ${suffix}: `, `REGISTERED ${suffix}`],
    ['After confirming the Messaging Service defers to the sender webhook and is not creating Conversations, type WEBHOOK: ', 'WEBHOOK'],
  ];
  for (const [question, expected] of providerChecks) {
    if ((await io.prompt(question)) !== expected) {
      throw new Error(`SMS readiness not confirmed at the ${expected} check. Keep SMS_ENABLED=false.`);
    }
  }

  if (!requireBooleanFlag('SMS_ENABLED', smsEnabled)) {
    io.info('SMS PROVIDER PREFLIGHT CONFIRMED BY OPERATOR. This command made no provider changes and is not proof of legal compliance.');
    io.info('Set SMS_ENABLED=true, redeploy, perform the real notification/no-relay/STOP/START/HELP tests, then run this command again for the final readiness gate.');
    return { ready: false, preflight: true, phoneNumber };
  }

  const deliveryChecks = [
    ['After confirming a real automated missed-call or voicemail notification was delivered to the intended recipient, type OUTBOUND: ', 'OUTBOUND'],
    ['After confirming inbound human-authored texts are acknowledged but never relayed, type NO RELAY: ', 'NO RELAY'],
    ['After confirming the HELP reply matches the registration, type HELP: ', 'HELP'],
    ['After sending STOP and confirming a subsequent application message is blocked, type STOP BLOCKED: ', 'STOP BLOCKED'],
    ['After sending START and confirming application delivery is restored, type START RESTORED: ', 'START RESTORED'],
  ];

  for (const [question, expected] of deliveryChecks) {
    if ((await io.prompt(question)) !== expected) {
      throw new Error(`SMS readiness not confirmed at the ${expected} check. Keep SMS_ENABLED=false.`);
    }
  }

  io.info('SMS READINESS CONFIRMED BY OPERATOR. This command made no carrier or Twilio changes and is not proof of legal compliance.');
  io.info('Keep the registration, webhook, and delivery behavior under review; set SMS_ENABLED=false immediately if any check stops passing.');
  return { ready: true, preflight: true, phoneNumber };
}

module.exports = { smsReadiness };
