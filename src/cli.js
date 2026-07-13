'use strict';

async function dispatch(argv, deps) {
  const [command, ...rawOptions] = argv;
  const { commands, io } = deps;
  const options = parseOptions(rawOptions);

  switch (command) {
    case 'status':
      return commands.runStatus(wire(deps));
    case 'setup':
      return commands.runSetup(wire(deps, options));
    case 'swap':
      return commands.runSwap(wire(deps, options));
    case 'ring-test':
      if (options.yes || options.dryRun) {
        throw new Error('ring-test accepts no flags and always requires the exact CALL confirmation.');
      }
      return commands.ringTest(wire(deps, options));
    case 'release-numbers':
      return commands.releaseNumbers(wire(deps, options));
    case 'sms-readiness':
      return commands.smsReadiness(wire(deps, options));
    default:
      io.error('Usage: emergency-line <setup|swap|status|ring-test|release-numbers|sms-readiness> [command options]');
      throw new Error(`unknown command: ${command}`);
  }
}

function parseOptions(args) {
  const options = { dryRun: false, yes: false };
  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--yes') options.yes = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

function wire(deps, options = {}) {
  const { makeClient, env, io } = deps;
  const client = makeClient();
  return {
    client,
    io,
    accountSid: env && env.TWILIO_ACCOUNT_SID,
    functionUrl: env && env.FUNCTION_URL,
    areaCode: env && env.DEFAULT_AREA_CODE,
    instanceId: env && env.INSTANCE_ID,
    realNumber: env && env.YOUR_REAL_NUMBER,
    smsEnabled: env && env.SMS_ENABLED,
    ...options,
  };
}

// Look up a required number by tag, failing with an actionable message (instead
// of a cryptic null dereference) when the line hasn't been set up yet.
async function requireNumberByTag(tc, client, tag) {
  const n = await tc.findNumberByTag(client, tag);
  if (!n) throw new Error(`No number tagged "${tag}" — run \`npm run setup\` first.`);
  return n;
}

async function main() {
  require('dotenv').config({ quiet: true });
  const tc = require('./twilio-client.js');
  const { createIo } = require('./io.js');
  const { runStatus } = require('./commands/status.js');
  const { runSetup } = require('./commands/setup.js');
  const { runSwap } = require('./commands/swap.js');
  const { ringTest } = require('./commands/ring-test.js');
  const { releaseNumbers } = require('./commands/release-numbers.js');
  const { smsReadiness } = require('./commands/sms-readiness.js');
  const { requireAuthToken, probeSyntheticSink, verifyForwarding } = require('../monitor/check-e2e.js');
  const { getTags } = require('./tags.js');
  const { requireE164 } = require('./validate.js');

  const env = process.env;
  const io = createIo();
  const makeClient = () => tc.createClient({
    accountSid: env.TWILIO_ACCOUNT_SID, apiKey: env.TWILIO_API_KEY, apiSecret: env.TWILIO_API_SECRET,
  });

  const runSwapWired = (base) => {
    // Validate the signing credential before runSwap can purchase a number.
    const authToken = requireAuthToken(env.TWILIO_AUTH_TOKEN);
    return runSwap({
      ...base,
      verify: async (newNumber) => {
        const test = await requireNumberByTag(tc, base.client, getTags(base.instanceId).test);
        const preflightSink = () => probeSyntheticSink({
          functionUrl: base.functionUrl,
          authToken,
          fromNumber: test.phoneNumber,
          toNumber: newNumber,
        });
        const pollStatus = async (sid) => (await base.client.calls(sid).fetch()).status;
        return verifyForwarding({
          client: base.client,
          fromNumber: test.phoneNumber,
          toNumber: newNumber,
          pollStatus,
          preflightSink,
        });
      },
    });
  };

  const commands = {
    runStatus,
    runSetup,
    runSwap: runSwapWired,
    ringTest: async (base) => {
      const tags = getTags(base.instanceId);
      const active = await requireNumberByTag(tc, base.client, tags.active);
      return ringTest({
        client: base.client,
        activeNumber: active.phoneNumber,
        realNumber: requireE164('YOUR_REAL_NUMBER', env.YOUR_REAL_NUMBER),
        io: base.io,
      });
    },
    releaseNumbers,
    smsReadiness,
  };

  await dispatch(process.argv.slice(2), { makeClient, io, env, commands });
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });

module.exports = { dispatch, parseOptions, wire, requireNumberByTag };
