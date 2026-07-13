'use strict';
const { requireHttpsUrl } = require('../src/validate.js');

function evaluateConfig({ active, test, functionUrl, accountStatus, balance, minBalance = 5 }) {
  const problems = [];
  let baseUrl;
  try {
    baseUrl = requireHttpsUrl('FUNCTION_URL', functionUrl);
  } catch (_) {
    // This output may be public in Actions logs, so do not echo the value.
    problems.push('FUNCTION_URL is missing or invalid');
  }
  const checkNumber = (number, label) => {
    if (!number) {
      problems.push(`no ${label} number found for this installation`);
      return;
    }
    // GitHub Actions logs may be public. Never print either the configured or
    // observed webhook URL when reporting drift.
    if (baseUrl && number.voiceUrl !== `${baseUrl}/forward`) problems.push(`${label} voice webhook does not match the configured Function`);
    if (baseUrl && number.smsUrl !== `${baseUrl}/sms`) problems.push(`${label} sms webhook does not match the configured Function`);
  };
  checkNumber(active, 'active');
  checkNumber(test, 'synthetic test');
  if (accountStatus !== 'active' && accountStatus !== 'unknown') problems.push(`account status is ${accountStatus}`);
  if (typeof balance !== 'number' || !Number.isFinite(balance)) {
    problems.push('balance unavailable (could not read account balance)');
  } else if (balance < minBalance) {
    problems.push('balance below the configured minimum threshold');
  }
  return { ok: problems.length === 0, problems };
}

async function main() {
  require('dotenv').config();
  const tc = require('../src/twilio-client.js');
  const { getTags } = require('../src/tags.js');
  const client = tc.createClient({
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    apiKey: process.env.TWILIO_API_KEY,
    apiSecret: process.env.TWILIO_API_SECRET,
  });
  const tags = getTags(process.env.INSTANCE_ID);
  const [active, test] = await Promise.all([
    tc.findNumberByTag(client, tags.active),
    tc.findNumberByTag(client, tags.test),
  ]);
  const accountStatus = await tc.getAccountStatus(client, process.env.TWILIO_ACCOUNT_SID);
  const balance = await tc.getBalance(client, process.env.TWILIO_ACCOUNT_SID);
  const r = evaluateConfig({ active, test, functionUrl: process.env.FUNCTION_URL, accountStatus, balance });
  if (!r.ok) { console.error('M1 CONFIG FAILED:\n- ' + r.problems.join('\n- ')); process.exit(1); }
  console.log('M1 CONFIG OK');
}

if (require.main === module) main().catch((e) => {
  const code = e && (e.code || e.status);
  console.error(`M1 CONFIG FAILED: provider request error${code ? ` (${code})` : ''}`);
  process.exit(1);
});

module.exports = { evaluateConfig };
