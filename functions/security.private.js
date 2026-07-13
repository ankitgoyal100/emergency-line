'use strict';
const crypto = require('node:crypto');

function checkHealthToken(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Twilio's webhook signature: HMAC-SHA1 over (url + concatenated sorted key+value
// POST params), base64-encoded. See Twilio "Validating Signatures".
function twilioSignature(authToken, url, params) {
  params = params || {};
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}

function isValidSignature({ authToken, signature, url, params }) {
  if (!authToken || !signature) return false;
  const expected = twilioSignature(authToken, url, params || {});
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { checkHealthToken, twilioSignature, isValidSignature };
