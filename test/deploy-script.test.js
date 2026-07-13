'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.join(__dirname, '..');
const script = path.join(root, 'scripts', 'deploy.js');

test('deploy script refuses to replace the live build without explicit confirmation', () => {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    env: {},
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Deployment not started/);
  assert.match(result.stderr, /npm run deploy -- --yes/);
  assert.equal(result.stdout, '');
});

test('deploy script help is read-only and documents the confirmation flag', () => {
  const result = spawnSync(process.execPath, [script, '--help'], {
    cwd: root,
    encoding: 'utf8',
    env: {},
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /npm run deploy -- --yes/);
  assert.equal(result.stderr, '');
});

test('deploy dry run supports voice-only bootstrap without a test number', () => {
  const result = spawnSync(process.execPath, [script, '--dry-run'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
      TWILIO_AUTH_TOKEN: 'b'.repeat(32),
      YOUR_REAL_NUMBER: '+12125550123',
      HEALTH_TOKEN: 'health-token-with-at-least-32-characters',
      SMS_ENABLED: 'false',
      MESSAGE_BRAND: 'Emergency Line',
      INSTANCE_ID: 'family-line',
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dry run made no Twilio changes/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /\+12125550123/);
});

test('deploy preflight rejects the example forwarding number', () => {
  const result = spawnSync(process.execPath, [script, '--dry-run'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
      TWILIO_AUTH_TOKEN: 'b'.repeat(32),
      YOUR_REAL_NUMBER: '+15551234567',
      HEALTH_TOKEN: 'health-token-with-at-least-32-characters',
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /YOUR_REAL_NUMBER \(example number\)/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /\+15551234567/);
});

test('deploy preflight rejects copied placeholder secrets without echoing them', () => {
  const placeholder = 'replace_with_a_random_32_char_secret';
  const result = spawnSync(process.execPath, [script, '--dry-run'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
      TWILIO_AUTH_TOKEN: 'b'.repeat(32),
      YOUR_REAL_NUMBER: '+12125550123',
      HEALTH_TOKEN: placeholder,
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /HEALTH_TOKEN/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(placeholder));
});
