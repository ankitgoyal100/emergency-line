'use strict';

const DEFAULT_BRAND = 'Emergency Line';
const OPT_OUT = 'Reply HELP for help or STOP to opt out.';

function messageBrand(value) {
  const brand = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_BRAND;
  // Keep operator-controlled text from injecting extra SMS lines and bound it
  // so a bad environment value cannot consume the entire message.
  return brand.replace(/[\r\n\t]+/g, ' ').slice(0, 80);
}

function smsReadiness(context) {
  const enabled = context && context.SMS_ENABLED === 'true';
  const destinationReady = !!(context && /^\+[1-9]\d{7,14}$/.test(context.YOUR_REAL_NUMBER || ''));
  const brand = context && context.MESSAGE_BRAND;
  const brandReady = typeof brand === 'string'
    && !!brand.trim()
    && brand.length <= 80
    && !/[\r\n\t]/.test(brand);
  return { enabled, ready: enabled && destinationReady && brandReady };
}

function missedCallSms({ from, recordingUrl, brand }) {
  const prefix = messageBrand(brand);
  return recordingUrl
    ? `${prefix}: Automated voicemail notification from ${from}. Listen: ${recordingUrl}. ${OPT_OUT}`
    : `${prefix}: Automated missed-call notification from ${from}. No voicemail was left. ${OPT_OUT}`;
}

module.exports = {
  DEFAULT_BRAND,
  OPT_OUT,
  messageBrand,
  smsReadiness,
  missedCallSms,
};
