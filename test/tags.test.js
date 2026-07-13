'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getTags } = require('../src/tags.js');

test('legacy tags remain compatible when INSTANCE_ID is omitted', () => {
  assert.deepEqual(getTags(), {
    active: 'emergency-line-active',
    test: 'emergency-line-test',
    provisional: 'emergency-line-active-provisional',
    retired: 'emergency-line-active-retired',
    isLegacy: true,
  });
});

test('INSTANCE_ID isolates number tags for a new installation', () => {
  const tags = getTags('family-1');
  assert.equal(tags.active, 'emergency-line-family-1-active');
  assert.equal(tags.test, 'emergency-line-family-1-test');
  assert.equal(tags.isLegacy, false);
});
