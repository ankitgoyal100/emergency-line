'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TEMPLATE_DIR = path.join(__dirname, '..', 'templates', 'legal');
const readTemplate = (name) => fs.readFileSync(path.join(TEMPLATE_DIR, name), 'utf8');

test('legal templates remain neutral starting points rather than consent claims', () => {
  const privacy = readTemplate('privacy.template.html');
  const terms = readTemplate('terms.template.html');
  const consent = readTemplate('sms-consent.template.html');

  assert.match(privacy, /Template only/i);
  assert.match(privacy, /not 911, 112/i);
  assert.match(privacy, /\{\{OPERATOR_NAME\}\}/);
  assert.match(terms, /delivery and response are not guaranteed/i);
  assert.match(terms, /\{\{CONTACT_EMAIL\}\}/);
  assert.match(consent, /does not prove that consent occurred/i);
  assert.match(consent, /\{\{DESCRIBE_THE_EXACT_OPT_IN_ACTION/);

  for (const page of [privacy, terms, consent]) {
    assert.doesNotMatch(page, /mailto:[^{}\s"']+@[^{}\s"']+/i);
    assert.doesNotMatch(page, /\+1[\s()-]*\d{3}[\s()-]*\d{3}[\s-]*\d{4}/);
  }
});
