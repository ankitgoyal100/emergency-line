'use strict';

async function pingHeartbeat({ heartbeatUrl, fetchImpl }) {
  if (!heartbeatUrl) return false;
  const doFetch = fetchImpl || fetch;
  try {
    const res = await doFetch(heartbeatUrl, { method: 'GET' });
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  }
}

async function main() {
  require('dotenv').config();
  const ok = await pingHeartbeat({ heartbeatUrl: process.env.HEARTBEAT_URL });
  if (!ok) throw new Error('heartbeat ping failed');
  console.log('heartbeat pinged');
}

if (require.main === module) main().catch(() => {
  console.error('heartbeat ping failed');
  process.exit(1);
});

module.exports = { pingHeartbeat };
