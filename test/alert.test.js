'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatAlert } = require('../monitor/alert.js');

test('formatAlert produces a readable multi-line message', () => {
  const msg = formatAlert({ check: 'M1', problems: ['no active number', 'balance $1 below $5'] });
  assert.match(msg, /EMERGENCY LINE ALERT/);
  assert.match(msg, /M1/);
  assert.match(msg, /\n- no active number/);
  assert.match(msg, /\n- balance \$1 below \$5/);
});

test('formatAlert tolerates missing problems without throwing', () => {
  assert.doesNotThrow(() => formatAlert({ check: 'M2', problems: undefined }));
  assert.match(formatAlert({ check: 'M2', problems: undefined }), /M2 failed/);
});
