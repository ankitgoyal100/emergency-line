'use strict';
const path = require('node:path');
const twilio = require('twilio');

// The Serverless runtime augments the global `Twilio` with a `Response` class
// (used by public handlers via `new Twilio.Response()`). The base `twilio` lib
// does not carry it, so model the minimal surface our handlers/tests use with a
// self-contained fake (avoids coupling to twilio-run internal paths).
class FakeResponse {
  constructor() { this.statusCode = 200; this.body = undefined; this.headers = {}; }
  appendHeader(key, value) { this.headers[key] = value; return this; }
  setStatusCode(code) { this.statusCode = code; return this; }
  setBody(body) { this.body = body; return this; }
}

// Twilio Functions expose `Runtime` and `Twilio` as globals. Handler unit tests
// install fakes so `require(Runtime.getFunctions()[name].path)` resolves to the
// real .private.js files on disk, and `new Twilio.Response()` works.
function installTwilioRuntime(privateModules = ['twiml', 'messages', 'security', 'provider-health']) {
  const map = {};
  for (const name of privateModules) {
    map[name] = { path: path.resolve(__dirname, `../../functions/${name}.private.js`) };
  }
  global.Runtime = { getFunctions: () => map };
  global.Twilio = twilio;
  global.Twilio.Response = FakeResponse;
  return map;
}

module.exports = { installTwilioRuntime };
