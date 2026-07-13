'use strict';
const tcDefault = require('../twilio-client.js');
const { requireHttpsUrl, optionalAreaCode, requireE164 } = require('../validate.js');
const { getTags } = require('../tags.js');

async function confirmSetup(io, purchaseCount, rewireCount, yes) {
  if (yes) return true;
  if (purchaseCount) {
    const expected = `BUY ${purchaseCount}`;
    const answer = await io.prompt(`Type ${expected} to purchase ${purchaseCount} monthly Twilio number${purchaseCount === 1 ? '' : 's'} and apply the webhook plan: `);
    return answer === expected;
  }
  const expected = `REWIRE ${rewireCount}`;
  const answer = await io.prompt(`Type ${expected} to update the webhooks on ${rewireCount} existing Twilio number${rewireCount === 1 ? '' : 's'}: `);
  return answer === expected;
}

async function releasePurchased({ client, purchased, deps, io }) {
  for (const number of [...purchased].reverse()) {
    try {
      await deps.releaseNumber(client, number.sid);
      io.info(`Rolled back newly purchased number ${number.phoneNumber}.`);
    } catch (err) {
      io.error(`URGENT: could not release newly purchased ${number.phoneNumber} (${number.sid}); it remains billable. Release it in Twilio. Cause: ${err.message}`);
    }
  }
}

async function runSetup({
  client,
  functionUrl,
  areaCode,
  instanceId,
  io,
  deps = tcDefault,
  yes = false,
  dryRun = false,
}) {
  const baseUrl = requireHttpsUrl('FUNCTION_URL', functionUrl);
  const normalizedAreaCode = optionalAreaCode(areaCode);
  const tags = getTags(instanceId);
  const voiceUrl = `${baseUrl}/forward`;
  const smsUrl = `${baseUrl}/sms`;

  if (tags.isLegacy) {
    io.info('NOTICE: INSTANCE_ID is unset. Retaining legacy number tags for compatibility; new installations should set a unique INSTANCE_ID.');
  }

  // Discover the complete plan before making any changes or incurring cost.
  const existing = {
    active: await deps.findNumberByTag(client, tags.active),
    test: await deps.findNumberByTag(client, tags.test),
  };
  for (const [role, number] of Object.entries(existing)) {
    if (number) requireE164(`${role} Twilio number`, number.phoneNumber);
  }
  const missing = Object.keys(existing).filter((role) => !existing[role]);

  io.info(`Plan: reuse ${2 - missing.length} existing number(s) and purchase ${missing.length} US local number(s).`);
  if (missing.length) {
    io.info('COST: Twilio charges a recurring monthly fee per purchased number plus call/SMS usage. Confirm current Twilio pricing before continuing.');
  }
  if (dryRun) {
    io.info('DRY RUN: no numbers were purchased and no webhooks were changed.');
    return { dryRun: true, missing, tags };
  }
  if (!(await confirmSetup(io, missing.length, 2 - missing.length, yes))) {
    throw new Error('setup cancelled before changing Twilio resources');
  }

  const purchased = [];
  const numbers = { ...existing };
  try {
    // Buy all missing resources first. If any buy fails, release everything
    // bought by this invocation so a partial setup does not remain billable.
    for (const role of missing) {
      const bought = await deps.buyNumber(client, {
        areaCode: normalizedAreaCode,
        voiceUrl,
        smsUrl,
        friendlyName: tags[role],
      });
      purchased.push(bought);
      requireE164(`new ${role} Twilio number`, bought.phoneNumber);
      numbers[role] = bought;
      io.info(`Bought ${tags[role]}: ${bought.phoneNumber}`);
    }

    // Existing numbers are only rewired after every required purchase succeeds.
    for (const role of Object.keys(existing)) {
      if (!existing[role]) continue;
      await deps.setWebhooks(client, existing[role].sid, { voiceUrl, smsUrl });
      io.info(`Reused ${tags[role]}: ${existing[role].phoneNumber}`);
    }
  } catch (err) {
    await releasePurchased({ client, purchased, deps, io });
    throw err;
  }

  const active = numbers.active.phoneNumber;
  const test = numbers.test.phoneNumber;
  io.info('');
  io.info(`SET Twilio Function env TEST_NUMBER=${test} and redeploy.`);
  io.info(`SAVE ${active} as your emergency contact and configure the device contact/ringer settings you rely on.`);
  io.info('SMS remains disabled until SMS_ENABLED=true is deliberately set after completing all applicable messaging registration.');
  return { active, test };
}

module.exports = { runSetup, confirmSetup, releasePurchased };
