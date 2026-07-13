'use strict';

function formatAlert({ check, problems }) {
  const list = Array.isArray(problems) ? problems : [];
  return [`🚨 EMERGENCY LINE ALERT — ${check} failed`, ...list.map((p) => `- ${p}`)].join('\n');
}

async function sendAlertSms({ client, from, to, body }) {
  await client.messages.create({ from, to, body });
}

module.exports = { formatAlert, sendAlertSms };
