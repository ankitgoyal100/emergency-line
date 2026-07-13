'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');

const root = path.join(__dirname, '..');
const args = new Set(process.argv.slice(2));

if (args.has('--help')) {
  console.log([
    'Deploy the local Functions and runtime variables to the live Twilio service.',
    '',
    'Usage:',
    '  npm run deploy -- --yes',
    '  npm run deploy -- --dry-run',
    '',
    'This replaces the active build. Run the local tests first and verify the',
    'voice and SMS paths immediately after deployment.',
  ].join('\n'));
  process.exit(0);
}

const unknownArgs = [...args].filter((arg) => !['--yes', '--dry-run'].includes(arg));
if (unknownArgs.length) {
  console.error(`Unknown deployment option: ${unknownArgs.join(', ')}`);
  process.exit(1);
}

const dryRun = args.has('--dry-run');
if (!args.has('--yes') && !dryRun) {
  console.error([
    'Deployment not started: this command replaces the active Twilio Functions build.',
    'After reviewing the changes and running npm test, confirm explicitly with:',
    '  npm run deploy -- --yes',
  ].join('\n'));
  process.exit(1);
}

dotenv.config({ path: path.join(root, '.env'), quiet: true });

const required = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'YOUR_REAL_NUMBER',
  'HEALTH_TOKEN',
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required deployment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const invalid = [];
const placeholderPattern = /(?:your[_-]|replace[_-]|example\.com|<{1,2}[^>]+>{1,2}|x{4,})/i;
if (!/^AC[0-9a-f]{32}$/i.test(process.env.TWILIO_ACCOUNT_SID)) invalid.push('TWILIO_ACCOUNT_SID');
if (!/^[0-9a-f]{32}$/i.test(process.env.TWILIO_AUTH_TOKEN)) invalid.push('TWILIO_AUTH_TOKEN');
if (!/^\+[1-9]\d{7,14}$/.test(process.env.YOUR_REAL_NUMBER)) invalid.push('YOUR_REAL_NUMBER');
if (/^\+1(?:555\d{7}|50055500\d{2})$/.test(process.env.YOUR_REAL_NUMBER)) invalid.push('YOUR_REAL_NUMBER (example number)');
if (process.env.TEST_NUMBER && !/^\+[1-9]\d{7,14}$/.test(process.env.TEST_NUMBER)) invalid.push('TEST_NUMBER');
if (process.env.TEST_NUMBER && /^\+1(?:555\d{7}|50055500\d{2})$/.test(process.env.TEST_NUMBER)) invalid.push('TEST_NUMBER (example number)');
if (process.env.HEALTH_TOKEN.length < 32
    || new Set(process.env.HEALTH_TOKEN).size < 8
    || placeholderPattern.test(process.env.HEALTH_TOKEN)) invalid.push('HEALTH_TOKEN');
if (process.env.SMS_ENABLED && !/^(?:true|false)$/.test(process.env.SMS_ENABLED)) invalid.push('SMS_ENABLED');
if (process.env.MESSAGE_BRAND && (process.env.MESSAGE_BRAND.length > 80 || /[\r\n\t]/.test(process.env.MESSAGE_BRAND))) invalid.push('MESSAGE_BRAND');
if (process.env.INSTANCE_ID
    && (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(process.env.INSTANCE_ID)
      || placeholderPattern.test(process.env.INSTANCE_ID))) invalid.push('INSTANCE_ID');
if (invalid.length) {
  console.error(`Invalid deployment variables: ${invalid.join(', ')}`);
  process.exit(1);
}

const twilioRun = path.join(root, 'node_modules', 'twilio-run', 'bin', 'twilio-run.js');
if (!fs.existsSync(twilioRun)) {
  console.error('twilio-run is not installed. Run npm ci first.');
  process.exit(1);
}
// Do not expose unrelated shell secrets to the deployment dependency.
const childEnv = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS']
    .filter((key) => process.env[key] != null)
    .map((key) => [key, process.env[key]])
);
// Build a short-lived allowlist file instead of uploading every variable in
// .env. TEST_NUMBER may be absent for the first bootstrap deployment; setup
// purchases it, after which the operator adds it and deploys again.
const runtimeValues = {
  // twilio-run reads these from the file for API authentication and removes
  // both before uploading the remaining variables to Functions.
  ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  YOUR_REAL_NUMBER: process.env.YOUR_REAL_NUMBER,
  HEALTH_TOKEN: process.env.HEALTH_TOKEN,
  TEST_NUMBER: process.env.TEST_NUMBER || '',
  SMS_ENABLED: process.env.SMS_ENABLED || 'false',
  MESSAGE_BRAND: process.env.MESSAGE_BRAND || 'Emergency Line',
  INSTANCE_ID: process.env.INSTANCE_ID || '',
};

if (dryRun) {
  console.log('Deployment preflight passed. Dry run made no Twilio changes.');
  process.exit(0);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emergency-line-deploy-'));
const runtimeEnvPath = path.join(tempDir, 'runtime.env');
let result;
try {
  fs.writeFileSync(
    runtimeEnvPath,
    Object.entries(runtimeValues).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n',
    { mode: 0o600 }
  );
  result = spawnSync(process.execPath, [
    twilioRun,
    'deploy',
    '--runtime', 'node22',
    '--service-name', 'emergency-line',
    '--override-existing-project',
    '--env', runtimeEnvPath,
  ], {
    cwd: root,
    env: childEnv,
    stdio: 'inherit',
  });
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
