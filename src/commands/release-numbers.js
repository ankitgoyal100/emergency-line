'use strict';
const tcDefault = require('../twilio-client.js');
const { getTags } = require('../tags.js');

async function releaseNumbers({ client, instanceId, io, deps = tcDefault, yes = false, dryRun = false }) {
  const tags = getTags(instanceId);
  const candidates = [];
  for (const role of ['active', 'test']) {
    const number = await deps.findNumberByTag(client, tags[role]);
    if (number) candidates.push({ role, ...number });
  }

  io.info(`DESTRUCTIVE PLAN: permanently release ${candidates.length} Twilio number(s) tagged for this instance.`);
  for (const number of candidates) io.info(`  ${number.role}: ${number.phoneNumber} (${number.sid})`);
  io.info('This does not delete Twilio Functions, monitoring, credentials, or any separately retained/retired numbers.');
  if (dryRun || !candidates.length) {
    io.info(dryRun ? 'DRY RUN: no numbers were released.' : 'No matching active/test numbers were found.');
    return { dryRun, released: [] };
  }

  if (!yes) {
    const expected = `RELEASE ${candidates.length} NUMBERS`;
    const answer = await io.prompt(`Type ${expected} to permanently release them: `);
    if (answer !== expected) throw new Error('number release cancelled');
  }

  const released = [];
  const failures = [];
  for (const number of candidates) {
    try {
      await deps.releaseNumber(client, number.sid);
      released.push(number.phoneNumber);
      io.info(`Released ${number.role} number ${number.phoneNumber}.`);
    } catch (err) {
      failures.push(`${number.phoneNumber}: ${err.message}`);
      io.error(`Could not release ${number.phoneNumber}; it remains allocated and billable. Cause: ${err.message}`);
    }
  }
  if (failures.length) throw new Error(`some numbers could not be released: ${failures.join('; ')}`);
  return { dryRun: false, released };
}

module.exports = { releaseNumbers };
