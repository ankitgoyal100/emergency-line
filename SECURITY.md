# Security policy

## Supported versions

Security fixes are made only on the current default branch. No released version is guaranteed to receive fixes or support.

## Reporting a vulnerability

Do **not** open a public issue for a vulnerability, exposed credential, live phone number, private webhook, or provider resource identifier.

Use this repository’s **Security → Report a vulnerability** flow to submit a private vulnerability report through GitHub Private Vulnerability Reporting. Include:

- the affected file, endpoint, or command;
- a minimal reproduction that does not contact a real person or purchase/release a resource;
- the expected impact; and
- suggested mitigations, if known.

Reports are reviewed on a best-effort basis. There is no response-time or remediation SLA, and this channel is not monitored as an emergency service.

If a real credential or private URL is exposed, revoke or rotate it with the provider immediately. Removing it from the current branch is not enough: inspect Git history, branches, tags, Actions logs/artifacts, pull requests, forks, caches, and local clones.

## Security-sensitive areas

Changes deserve extra scrutiny when they affect:

- Twilio webhook authentication or protected/public Function visibility;
- credentials and deployment environment allowlists;
- phone-number purchases, releases, and ownership tags;
- the call-forwarding destination or caller ID;
- SMS opt-out and carrier-registration behavior;
- voicemail URLs, recordings, and logs;
- health tokens and GitHub Actions secrets; or
- claims about emergency delivery, privacy, consent, or compliance.

Never test a vulnerability against a deployment you do not own or have explicit permission to test.
