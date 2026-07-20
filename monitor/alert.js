'use strict';

function formatAlert({ check, problems }) {
  const list = Array.isArray(problems) ? problems : [];
  return [`🚨 EMERGENCY LINE ALERT — ${check} failed`, ...list.map((p) => `- ${p}`)].join('\n');
}

module.exports = { formatAlert };
