'use strict';
const security = require('../functions/security.private.js');
const { requireHttpsUrl } = require('../src/validate.js');

function assertForwardTwiml(xml, { expectedCallerId, expectedRealNumber }) {
  const problems = [];
  if (!/<Dial/.test(xml)) problems.push('no <Dial> in response');
  if (expectedCallerId && !xml.includes(`callerId="${expectedCallerId}"`)) {
    problems.push('caller ID does not match the requested line');
  }
  if (expectedRealNumber && !xml.includes(`>${expectedRealNumber}</Number>`)) {
    problems.push('forwarding destination does not match local configuration');
  }
  return { ok: problems.length === 0, problems };
}

async function probeFunction({ functionUrl, authToken, fetchImpl, lineNumber = '+15550000000', expectedRealNumber }) {
  const url = `${requireHttpsUrl('FUNCTION_URL', functionUrl)}/forward`;
  // NOTE: `From` must never equal the deployed TEST_NUMBER, or the Function
  // returns the Dial-less sink TwiML and this probe would false-alarm.
  const params = { To: lineNumber, From: '+15551112222', CallSid: 'CAmonitorprobe' };
  const signature = security.twilioSignature(authToken, url, params);
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'X-Twilio-Signature': signature, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const xml = await res.text();
  const check = assertForwardTwiml(xml, { expectedCallerId: lineNumber, expectedRealNumber });
  return { ok: res.status === 200 && check.ok, status: res.status, problems: check.problems };
}

async function main() {
  require('dotenv').config();
  const r = await probeFunction({
    functionUrl: process.env.FUNCTION_URL,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fetchImpl: fetch,
    expectedRealNumber: process.env.YOUR_REAL_NUMBER,
  });
  if (!r.ok) { console.error(`M2 FUNCTION FAILED (status ${r.status}):\n- ` + r.problems.join('\n- ')); process.exit(1); }
  console.log('M2 FUNCTION OK');
}

if (require.main === module) main().catch(() => {
  console.error('M2 FUNCTION FAILED: request error');
  process.exit(1);
});

module.exports = { assertForwardTwiml, probeFunction };
