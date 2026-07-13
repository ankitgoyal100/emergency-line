'use strict';

const PLACEHOLDER_PATTERN = /(?:your[_-]|replace[_-]|example\.com|<{1,2}[^>]+>{1,2}|x{4,})/i;

function rejectPlaceholder(name, value) {
  if (PLACEHOLDER_PATTERN.test(String(value))) {
    throw new Error(`${name} still contains an example placeholder.`);
  }
}

// Fail loud at the boundary rather than silently wiring a webhook to a bad
// URL. A misconfigured emergency line is worse than a clear error.
function requireHttpsUrl(name, value) {
  if (typeof value !== 'string') {
    throw new Error(`${name} is missing or invalid (${value}); expected an https:// URL.`);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_) {
    throw new Error(`${name} is missing or invalid (${value}); expected an https:// URL.`);
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${name} is missing or invalid (${value}); expected an https:// URL without credentials, query, or fragment.`);
  }
  rejectPlaceholder(name, value);
  return value.replace(/\/$/, '');
}

function requireSid(name, value, prefix) {
  const pattern = new RegExp(`^${prefix}[0-9a-fA-F]{32}$`);
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(`${name} is missing or invalid; expected a ${prefix} SID.`);
  }
  rejectPlaceholder(name, value);
  return value;
}

function requireE164(name, value) {
  if (typeof value !== 'string' || !/^\+[1-9]\d{7,14}$/.test(value)) {
    throw new Error(`${name} is missing or invalid; expected an E.164 number such as +12025550123.`);
  }
  // The example file intentionally uses the non-existent +1 555 area code.
  // Reject it so copying the example verbatim can never target a fake number.
  if (/^\+1555/.test(value)) {
    throw new Error(`${name} still contains an example phone number.`);
  }
  rejectPlaceholder(name, value);
  return value;
}

function optionalAreaCode(value) {
  if (value == null || value === '') return undefined;
  const normalized = String(value);
  if (!/^[2-9]\d{2}$/.test(normalized)) {
    throw new Error('DEFAULT_AREA_CODE is invalid; expected a three-digit US area code.');
  }
  return normalized;
}

function requireHealthToken(name, value) {
  if (typeof value !== 'string' || value.length < 32 || new Set(value).size < 8) {
    throw new Error(`${name} is missing or weak; use at least 32 random characters.`);
  }
  rejectPlaceholder(name, value);
  return value;
}

function optionalInstanceId(value) {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(value)) {
    throw new Error('INSTANCE_ID is invalid; use 1-32 lowercase letters, numbers, or internal hyphens.');
  }
  rejectPlaceholder('INSTANCE_ID', value);
  return value;
}

function requireBooleanFlag(name, value) {
  if (value == null || value === '') return false;
  if (value !== 'true' && value !== 'false') {
    throw new Error(`${name} must be exactly "true" or "false".`);
  }
  return value === 'true';
}

module.exports = {
  requireHttpsUrl,
  requireSid,
  requireE164,
  optionalAreaCode,
  requireHealthToken,
  optionalInstanceId,
  requireBooleanFlag,
  rejectPlaceholder,
};
