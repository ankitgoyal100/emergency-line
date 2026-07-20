'use strict';
const tcDefault = require('../twilio-client.js');
const { requireHttpsUrl, optionalAreaCode, requireE164 } = require('../validate.js');
const { getTags } = require('../tags.js');

async function releaseProvisional({ client, bought, deps, io, reason }) {
  try {
    await deps.releaseNumber(client, bought.sid);
    io.info(`Released provisional number ${bought.phoneNumber} (${reason}).`);
  } catch (releaseErr) {
    io.error(`URGENT: could not release provisional number ${bought.phoneNumber} (${bought.sid}); it remains billable. Release it in Twilio. Cause: ${releaseErr.message}`);
  }
}

async function exactPrompt(io, question, expected) {
  return (await io.prompt(question)) === expected;
}

async function runSwap({
  client,
  functionUrl,
  areaCode,
  instanceId,
  io,
  deps = tcDefault,
  verify,
  yes = false,
  dryRun = false,
}) {
  const baseUrl = requireHttpsUrl('FUNCTION_URL', functionUrl);
  const normalizedAreaCode = optionalAreaCode(areaCode);
  const tags = getTags(instanceId);
  const voiceUrl = `${baseUrl}/forward`;
  const smsUrl = `${baseUrl}/sms`;
  const old = await deps.findNumberByTag(client, tags.active);
  if (old) requireE164('current active Twilio number', old.phoneNumber);
  const strandedProvisional = await deps.findNumberByTag(client, tags.provisional);
  if (strandedProvisional) {
    throw new Error('A provisional number from an earlier swap still exists and may be billable. Resolve it in Twilio before starting another swap.');
  }

  io.info(`Plan: purchase one provisional US local number${old ? ', prove it rings the destination phone, then optionally release the old number' : ' and prove it rings the destination phone'}.`);
  io.info('COST: the provisional number starts a recurring Twilio charge immediately and both numbers remain billable until one is released.');
  io.info('SMS SAFETY: the replacement must be registered/configured separately before setting SMS_ENABLED=true; voice is independent.');
  if (tags.isLegacy) {
    io.info('NOTICE: INSTANCE_ID is unset. Retaining legacy number tags for compatibility.');
  }
  if (dryRun) {
    io.info('DRY RUN: no number was purchased, renamed, rewired, or released.');
    return { dryRun: true, old: old && old.phoneNumber, tags };
  }
  if (typeof verify !== 'function') throw new Error('swap verification is unavailable; no number was purchased');
  if (!yes && !(await exactPrompt(io, 'Type SWAP to purchase one provisional monthly Twilio number: ', 'SWAP'))) {
    throw new Error('swap cancelled before purchase');
  }

  let bought;
  try {
    bought = await deps.buyNumber(client, {
      areaCode: normalizedAreaCode,
      voiceUrl,
      smsUrl,
      friendlyName: tags.provisional,
    });
    requireE164('new Twilio number', bought.phoneNumber);
  } catch (err) {
    io.error(`Failed to buy a new number: ${err.message}`);
    if (bought && bought.sid) {
      await releaseProvisional({ client, bought, deps, io, reason: 'invalid purchase response' });
    }
    throw err;
  }

  // This automated probe only proves Twilio -> Function routing. It is not a
  // last-mile test and can never authorize release of the working old line.
  let webhookOk = false;
  try {
    webhookOk = await verify(bought.phoneNumber);
  } catch (err) {
    io.error(`Webhook verification error: ${err.message}`);
  }
  if (!webhookOk) {
    io.error('New number failed the webhook probe. The existing line was not changed.');
    await releaseProvisional({ client, bought, deps, io, reason: 'webhook probe failed' });
    throw new Error('verification failed');
  }

  io.info(`LAST-MILE TEST REQUIRED: from a non-test phone, call ${bought.phoneNumber} and physically confirm the intended destination phone rings.`);
  io.info('Do not confirm based on the automated probe, a Twilio log, or voicemail alone.');
  const rang = await exactPrompt(io, 'Only after hearing/seeing the destination phone ring, type RANG (anything else rolls back): ', 'RANG');
  if (!rang) {
    await releaseProvisional({ client, bought, deps, io, reason: 'physical ring not confirmed' });
    throw new Error('physical ring was not confirmed; existing line retained');
  }

  // Remove the active tag from the old number before promotion so duplicate
  // tags cannot make later status/swap commands choose an arbitrary number.
  const retiredTag = `${tags.retired.slice(0, 52)}-${String(old && old.sid || 'none').slice(-8)}`;
  if (old) {
    try {
      await deps.setFriendlyName(client, old.sid, retiredTag);
    } catch (err) {
      await releaseProvisional({ client, bought, deps, io, reason: 'could not retire old tag' });
      throw new Error(`could not safely rename the existing line; it was retained: ${err.message}`);
    }
  }

  try {
    await deps.setFriendlyName(client, bought.sid, tags.active);
  } catch (err) {
    if (old) {
      try {
        await deps.setFriendlyName(client, old.sid, tags.active);
      } catch (restoreErr) {
        io.error(`URGENT: could not restore the old number's active tag. Both numbers remain allocated; fix Twilio friendly names manually. Cause: ${restoreErr.message}`);
      }
    }
    await releaseProvisional({ client, bought, deps, io, reason: 'promotion failed' });
    throw new Error(`could not promote the new line; the old number was not released: ${err.message}`);
  }

  if (old) {
    const suffix = old.phoneNumber.slice(-4);
    const releaseConfirmed = await exactPrompt(
      io,
      `The new line is active and the old line ${old.phoneNumber} is still allocated and billable. Type RELEASE ${suffix} to permanently release the old number, or press Enter to retain it: `,
      `RELEASE ${suffix}`
    );
    if (releaseConfirmed) {
      try {
        await deps.releaseNumber(client, old.sid);
        io.info(`Released old number ${old.phoneNumber}.`);
      } catch (releaseErr) {
        io.error(`New number is active, but old number ${old.phoneNumber} could not be released and remains billable. Release it manually in Twilio. Cause: ${releaseErr.message}`);
      }
    } else {
      io.info(`Retained old number ${old.phoneNumber}; it remains functional and billable until explicitly released.`);
    }
  }

  io.info(`New emergency number: ${bought.phoneNumber}`);
  io.info('ACTION: update the saved emergency contact, recheck device ringer/contact settings, and repeat a real inbound call.');
  io.info('ACTION: keep SMS_ENABLED=false until messaging registration and notification/no-relay/STOP/START/HELP tests pass for this sender.');
  return bought.phoneNumber;
}

module.exports = { runSwap, exactPrompt, releaseProvisional };
