'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { installTwilioRuntime } = require('./helpers/twilio-runtime.js');

const FUNCTIONS_DIR = path.resolve(__dirname, '../functions');

test('every routable function file exports a handler', () => {
  installTwilioRuntime();
  const routable = fs.readdirSync(FUNCTIONS_DIR).filter((f) => f.endsWith('.js') && !f.endsWith('.private.js'));
  for (const file of routable) {
    const mod = require(path.join(FUNCTIONS_DIR, file));
    assert.equal(typeof mod.handler, 'function', `${file} must export handler`);
  }
});

test('the private-module set is consistent across disk, the canonical list, and the runtime helper', () => {
  const onDisk = fs.readdirSync(FUNCTIONS_DIR)
    .filter((f) => f.endsWith('.private.js'))
    .map((f) => f.replace('.private.js', ''))
    .sort();
  // Canonical expected set anchors against an unexpected add/delete on disk.
  assert.deepEqual(onDisk, ['messages', 'security', 'twiml']);
  // The runtime helper's DEFAULT list must equal what's on disk, so a helper that
  // drifts from the actual private modules is caught (not just a duplicated literal).
  const helperDefault = Object.keys(installTwilioRuntime()).sort();
  assert.deepEqual(helperDefault, onDisk);
});
