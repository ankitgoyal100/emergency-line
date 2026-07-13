'use strict';
const twilio = require('twilio');
const { requireSid, optionalAreaCode } = require('./validate.js');

function createClient({ accountSid, apiKey, apiSecret }) {
  requireSid('TWILIO_ACCOUNT_SID', accountSid, 'AC');
  requireSid('TWILIO_API_KEY', apiKey, 'SK');
  if (typeof apiSecret !== 'string' || apiSecret.length < 16 || /(?:your[_-]|replace[_-]|x{4,})/i.test(apiSecret)) {
    throw new Error('TWILIO_API_SECRET is missing, weak, or still an example placeholder.');
  }
  return twilio(apiKey, apiSecret, { accountSid });
}

async function findNumberByTag(client, tag) {
  const list = await client.incomingPhoneNumbers.list({ friendlyName: tag, limit: 20 });
  const exact = list.filter((n) => n.friendlyName === tag);
  if (exact.length > 1) {
    throw new Error(`Multiple Twilio numbers have the tag "${tag}". Resolve the duplicate tags before continuing.`);
  }
  return exact[0] || null;
}

async function buyNumber(client, { areaCode, voiceUrl, smsUrl, friendlyName }) {
  const opts = { voiceEnabled: true, smsEnabled: true, limit: 1 };
  const validatedAreaCode = optionalAreaCode(areaCode);
  if (validatedAreaCode) opts.areaCode = validatedAreaCode;
  const available = await client.availablePhoneNumbers('US').local.list(opts);
  if (!available.length) throw new Error(`No numbers available in area code ${areaCode || 'US'}`);
  return client.incomingPhoneNumbers.create({
    phoneNumber: available[0].phoneNumber, friendlyName,
    voiceUrl, voiceMethod: 'POST', smsUrl, smsMethod: 'POST',
  });
}

async function setWebhooks(client, sid, { voiceUrl, smsUrl }) {
  return client.incomingPhoneNumbers(sid).update({ voiceUrl, voiceMethod: 'POST', smsUrl, smsMethod: 'POST' });
}

async function setFriendlyName(client, sid, friendlyName) {
  return client.incomingPhoneNumbers(sid).update({ friendlyName });
}

async function releaseNumber(client, sid) {
  await client.incomingPhoneNumbers(sid).remove();
}

async function getAccountStatus(client, accountSid) {
  try {
    const acc = await client.api.v2010.accounts(accountSid).fetch();
    return acc.status;
  } catch (err) {
    // Standard API keys are scoped out of the Accounts resource (401/20003).
    // Account suspension is then covered behaviorally by the M3 real-call test,
    // so degrade to 'unknown' rather than crashing the monitor/status command.
    if (err && (err.status === 401 || err.code === 20003)) return 'unknown';
    throw err;
  }
}

async function getBalance(client, accountSid) {
  const bal = await client.api.v2010.accounts(accountSid).balance.fetch();
  return parseFloat(bal.balance);
}

module.exports = {
  createClient, findNumberByTag, buyNumber, setWebhooks, setFriendlyName,
  releaseNumber, getAccountStatus, getBalance,
};
