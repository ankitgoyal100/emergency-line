# Repository guide for AI coding sessions

User-facing setup and safety information lives in [README.md](README.md). Treat that file as part of the product: any change to provisioning, billing, destructive behavior, monitoring coverage, or required configuration must update the documentation in the same change.

## Purpose and safety boundary

Emergency Line is a self-hosted Twilio call-forwarding application for one owner. It is not an emergency service and must never claim guaranteed delivery, availability, volume, or human response.

The project intentionally has no caller allowlist. Anyone who knows a deployed number can call it and create usage. Never add a public SaaS, shared billing, authentication system, customer database, or multi-tenant behavior without a separate design and explicit maintainer approval.

## Repository layout

- `functions/*.protected.js` — Twilio webhooks. Twilio validates the request signature at the Serverless edge.
- `functions/health.js` — public URL with a secret-token check.
- `functions/*.private.js` — non-routable shared handler logic.
- `src/` — the local Twilio provisioning and number-management CLI.
- `monitor/` — configuration, Function-response, synthetic-call, and alert helpers.
- `test/` — `node:test` tests using dependency-injected fakes; tests must not make live network requests or buy resources.
- `.github/workflows/` — CI and optional scheduled monitoring.
- `docs/CONFIGURATION.md` — credential provenance, environment schema, and rotation boundaries.
- `docs/OPERATIONS.md` — cost model, monitoring coverage, swaps, backups, and teardown.
- `docs/SMS-A2P.md` — voice-only default and deployer-specific messaging registration/readiness.
- `docs/UPGRADING.md` — reviewed source updates and application/number rollback boundaries.
- `templates/legal/` — neutral starting-point templates. They are not legal advice or proof of consent.

## Development rules

- Run `npm test` and keep the offline suite green.
- Keep the package marked `private` to prevent accidental npm publication.
- Never commit `.env`, `.twilio-functions.env`, `.twiliodeployinfo`, real phone numbers, credentials, webhook tokens, provider IDs, carrier-campaign records, personalized compliance pages, or operator runbooks.
- Use fake `+1555…` numbers and placeholder `AC…`/`SK…` identifiers in examples.
- Validate configuration before any network mutation.
- Show a resource/cost preview and require explicit confirmation before buying or releasing a number. `--dry-run` must not mutate provider state; `--yes` must be explicit.
- A synthetic call proves only the Twilio routing path to the sink. It does not prove that the physical phone, contact, Emergency Bypass, speaker, carrier, or owner worked.
- Never release an existing active number until the operator confirms a real ring on the replacement phone/contact.
- Cleanup failures must be loud and actionable. Never hide a possibly billable orphaned resource.
- SMS must remain off by default. Each deployer must complete and test their own carrier registration before enabling it.

## Call behavior that must remain explicit

- The forwarded leg uses the called dedicated line as caller ID so the saved contact can match.
- The 18-second dial timeout is an attempt to beat carrier voicemail, not a guarantee.
- One retry is implemented as a TwiML stage machine.
- A completed dial may represent a person or carrier voicemail.
- The synthetic test caller is routed to a sink and must not ring the owner.
- The manual ring test calls the owner directly and must require a human answer.

## Deployment hygiene

Use a dedicated Twilio subaccount where possible. `INSTANCE_ID` isolates number tags but not the fixed Serverless Service name. Deployment passes only the documented runtime variables to Twilio Functions; credentials remain local. Generated operator-specific legal pages and all campaign/provider identifiers stay ignored.

The Twilio Function runtime and local Node version are separate configuration concerns. Keep their supported versions documented and covered by CI.

## Documentation hygiene

Legal templates must use obvious placeholders and conditional language. Never assert that a recipient consented, that a carrier registration is approved, or that a privacy practice applies unless the deployer has supplied and verified that fact. Pricing and carrier-registration guidance should point deployers to current provider terms rather than promising a fixed fee or approval time.
