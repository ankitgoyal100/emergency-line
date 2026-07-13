# Legal and carrier-disclosure templates

These neutral files are starting points for a self-hoster’s own deployment:

- `privacy.template.html`
- `terms.template.html`
- `sms-consent.template.html`

They are **not legal advice, not a compliance certification, and not evidence that a recipient opted in**. Requirements vary by jurisdiction, carrier, message type, and deployment. Obtain appropriate advice before publishing them or making representations to a carrier.

## Customize privately

Copy the templates into the ignored `assets/` directory using the public filenames you intend to host:

```bash
mkdir -p assets
cp templates/legal/privacy.template.html assets/privacy.html
cp templates/legal/terms.template.html assets/terms.html
cp templates/legal/sms-consent.template.html assets/sms-consent.html
```

Then replace every `{{PLACEHOLDER}}` and delete every conditional section that does not apply. Before deployment, verify that no placeholders remain and that Git is ignoring the generated pages:

```bash
rg '\{\{' assets
git check-ignore assets/privacy.html assets/terms.html assets/sms-consent.html
```

The `rg` command should produce no output. At minimum, verify:

- the real operator/sender identity and a monitored contact route;
- the actual data processed by this deployment and its providers;
- the actual retention/deletion practices for logs and recordings;
- the actual message types and expected frequency;
- exactly how the sole recipient gave consent;
- working STOP, START, and HELP behavior;
- a truthful statement about sharing, selling, marketing, and service providers; and
- the correct local emergency-services disclaimer.

Do not claim that the recipient consented just because the repository contains code or because a phone number is present in `.env`. Keep a dated private consent record and screenshots/evidence outside Git as appropriate.

The deployment tool includes local files from `assets/` in the Twilio Serverless deployment. After `npm run deploy -- --yes`, verify the exact public HTTPS URLs and cross-links in a logged-out browser before submitting them to a carrier. Do not assume a successful deploy proves the text is accurate.

Generated pages may contain personal or business details, so the entire `assets/` directory is intentionally ignored by this repository. Back up the finished pages privately; a fresh Git clone cannot restore them.
