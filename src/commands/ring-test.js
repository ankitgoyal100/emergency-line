'use strict';

const { requireE164 } = require('../validate.js');

// Places a REAL call to the user's phone FROM the Emergency Line (active) number,
// so the call arrives at the saved emergency contact. This is a monthly by-ear
// last-mile check of the physical phone and its current device settings. No
// application can guarantee volume, delivery, or bypass of silent/DND.
async function ringTest({ client, activeNumber, realNumber, io, originate, yes = false }) {
  requireE164('active Twilio number', activeNumber);
  requireE164('YOUR_REAL_NUMBER', realNumber);
  const place = originate || ((a) => client.calls.create(a));
  io.info('COST: this places one real Twilio call and incurs normal voice usage charges.');
  if (!yes) {
    const confirmation = await io.prompt('Type CALL to place the real test call: ');
    if (confirmation !== 'CALL') {
      io.info('Ring test cancelled before placing a call.');
      return { passed: false, cancelled: true };
    }
  }
  io.info(`Placing a real test call to your phone (${realNumber}) from the Emergency Line number ${activeNumber}.`);
  io.info('Listen for the physical phone. Whether it rings through silent/DND depends on your device and contact settings.');
  await place({
    from: activeNumber,
    to: realNumber,
    twiml: '<Response><Say voice="Polly.Joanna">This is your scheduled emergency line test. If you hear this message, the test call reached this phone. Verify device alert settings separately.</Say><Pause length="2"/></Response>',
  });
  const answer = await io.prompt('Did the intended physical phone audibly ring as expected? (y/n) ');
  const passed = /^y/i.test(answer);
  if (passed) io.info('PASS — the last-mile ring test passed under the current phone settings.');
  else io.error('FAIL — check the saved contact, ringer/focus settings, carrier service, and destination number, then re-run.');
  return { passed, cancelled: false };
}

module.exports = { ringTest };
