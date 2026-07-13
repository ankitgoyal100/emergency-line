'use strict';

const security = require('../functions/security.private.js');
const { requireHttpsUrl, requireE164 } = require('../src/validate.js');

function requireAuthToken(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{32}$/i.test(value)) {
    throw new Error('TWILIO_AUTH_TOKEN is missing or invalid.');
  }
  return value;
}

function requireE2eAuthorization(args) {
  if (args.length !== 1 || args[0] !== '--yes') {
    throw new Error('Synthetic call not started. This check is billable; confirm explicitly with `npm run check:e2e -- --yes`.');
  }
}

// Safely ask the deployed Function what it would do for the exact tagged test
// caller. A direct webhook request returns TwiML but does not execute <Dial>.
// Only a confirmed sink response may authorize the subsequent synthetic call.
async function probeSyntheticSink({ functionUrl, authToken, fromNumber, toNumber, fetchImpl = fetch }) {
  const url = `${requireHttpsUrl('FUNCTION_URL', functionUrl)}/forward`;
  const params = {
    To: requireE164('active Twilio number', toNumber),
    From: requireE164('test Twilio number', fromNumber),
    CallSid: 'CApreflightsinkprobe',
  };
  const signature = security.twilioSignature(requireAuthToken(authToken), url, params);
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'X-Twilio-Signature': signature, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const xml = await response.text();
  return response.status === 200
    && !/<Dial\b/i.test(xml)
    && /<Say(?:\s[^>]*)?>health ok<\/Say>/i.test(xml)
    && /<Hangup\s*\/>/i.test(xml);
}

// Originates a call FROM the test number INTO the number under test. The Function
// recognizes the test caller and routes to the sink, so no real phone rings.
// Returns true if the call reaches a terminal success status.
async function verifyForwarding({ client, fromNumber, toNumber, pollStatus, preflightSink, attempts = 10, delayMs = 3000, sleep }) {
  if (typeof preflightSink !== 'function' || !(await preflightSink())) return false;
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const call = await client.calls.create({
    from: fromNumber,
    to: toNumber,
    twiml: '<Response><Say>probe</Say></Response>',
  });
  for (let i = 0; i < attempts; i++) {
    const status = await pollStatus(call.sid);
    if (status === 'completed') return true;
    if (['failed', 'busy', 'no-answer', 'canceled'].includes(status)) return false;
    if (i < attempts - 1) await wait(delayMs);
  }
  return false;
}

async function main() {
  require('dotenv').config({ quiet: true });
  requireE2eAuthorization(process.argv.slice(2));
  const tc = require('../src/twilio-client.js');
  const { getTags } = require('../src/tags.js');
  const client = tc.createClient({
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    apiKey: process.env.TWILIO_API_KEY,
    apiSecret: process.env.TWILIO_API_SECRET,
  });
  const tags = getTags(process.env.INSTANCE_ID);
  const test = await tc.findNumberByTag(client, tags.test);
  const active = await tc.findNumberByTag(client, tags.active);
  if (!test || !active) {
    console.error(`M3 E2E FAILED: missing number (test=${!!test}, active=${!!active}) — run setup/swap first`);
    process.exit(1);
  }
  const preflightSink = () => probeSyntheticSink({
    functionUrl: process.env.FUNCTION_URL,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fromNumber: test.phoneNumber,
    toNumber: active.phoneNumber,
  });
  const pollStatus = async (sid) => (await client.calls(sid).fetch()).status;
  const ok = await verifyForwarding({
    client,
    fromNumber: test.phoneNumber,
    toNumber: active.phoneNumber,
    pollStatus,
    preflightSink,
  });
  if (!ok) { console.error('M3 E2E FAILED'); process.exit(1); }
  console.log('M3 E2E OK');
}

if (require.main === module) main().catch((e) => {
  const code = e && (e.code || e.status);
  console.error(`M3 E2E FAILED: provider request error${code ? ` (${code})` : ''}`);
  process.exit(1);
});

module.exports = {
  requireAuthToken,
  requireE2eAuthorization,
  probeSyntheticSink,
  verifyForwarding,
};
