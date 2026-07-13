'use strict';

const DEFAULT_BRAND = 'Emergency Line';
const OPT_OUT = 'Reply STOP to opt out.';
const MAX_BODY_LENGTH = 1600;

function messageBrand(value) {
  const brand = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_BRAND;
  // Keep operator-controlled text from injecting extra SMS lines and bound it
  // so a bad environment value cannot consume the entire message.
  return brand.replace(/[\r\n\t]+/g, ' ').slice(0, 80);
}

function smsReadiness(context) {
  const enabled = context && context.SMS_ENABLED === 'true';
  const destinationReady = !!(context && /^\+[1-9]\d{7,14}$/.test(context.YOUR_REAL_NUMBER || ''));
  return { enabled, ready: enabled && destinationReady };
}

function boundedMessage(prefix, content, suffix) {
  const raw = content == null ? '' : String(content);
  const available = MAX_BODY_LENGTH - prefix.length - suffix.length;
  if (raw.length <= available) return `${prefix}${raw}${suffix}`;

  let truncated = raw.slice(0, Math.max(0, available - 1));
  // Avoid leaving half of a UTF-16 surrogate pair before the truncation mark.
  const last = truncated.charCodeAt(truncated.length - 1);
  if (last >= 0xD800 && last <= 0xDBFF) truncated = truncated.slice(0, -1);
  return `${prefix}${truncated}…${suffix}`;
}

function forwardSmsBody({ from, body, brand }) {
  return boundedMessage(`${messageBrand(brand)}: Text from ${from}: `, body, ` ${OPT_OUT}`);
}

function missedCallSms({ from, recordingUrl, brand }) {
  const prefix = messageBrand(brand);
  return recordingUrl
    ? `${prefix}: Missed emergency call from ${from}. Voicemail: ${recordingUrl}. ${OPT_OUT}`
    : `${prefix}: Missed emergency call from ${from}. No voicemail left. ${OPT_OUT}`;
}

module.exports = {
  DEFAULT_BRAND,
  OPT_OUT,
  MAX_BODY_LENGTH,
  messageBrand,
  smsReadiness,
  forwardSmsBody,
  missedCallSms,
};
