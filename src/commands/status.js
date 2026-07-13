'use strict';
const tc = require('../twilio-client.js');
const { getTags } = require('../tags.js');

async function runStatus({ client, accountSid, functionUrl, instanceId, io, deps = tc }) {
  const tags = getTags(instanceId);
  const active = await deps.findNumberByTag(client, tags.active);
  const test = await deps.findNumberByTag(client, tags.test);
  const accountStatus = await deps.getAccountStatus(client, accountSid);
  const balance = await deps.getBalance(client, accountSid);

  io.info(`Active emergency number: ${active ? active.phoneNumber : '(none)'}`);
  io.info(`  voice webhook:        ${active ? active.voiceUrl : '(n/a)'}`);
  io.info(`  sms webhook:          ${active ? active.smsUrl : '(n/a)'}`);
  io.info(`Test number:            ${test ? test.phoneNumber : '(none)'}`);
  io.info(`Function URL:           ${functionUrl}`);
  io.info(`Account status:         ${accountStatus}${accountStatus === 'unknown' ? ' (standard key; suspension checked by M3)' : ''}`);
  io.info(`Balance:                $${balance.toFixed(2)}`);
  io.info(`Instance tags:          ${tags.active}, ${tags.test}`);

  return { active: active && active.phoneNumber, test: test && test.phoneNumber, accountStatus, balance };
}

module.exports = { runStatus };
