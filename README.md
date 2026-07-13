# Emergency Line

A small, self-hosted Twilio application that gives one person a dedicated phone number for urgent calls. Calls to the dedicated number are forwarded to the owner’s mobile phone using the dedicated number as caller ID. On an iPhone, saving that number as a contact with Emergency Bypass enabled can make it ring through Silent mode or a Focus.

The project intentionally has no accounts, customer database, payment system, or caller allowlist. Each person deploys and pays for their own Twilio resources.

> [!WARNING]
> **This is not 911, 112, or an emergency service. It provides no guarantee that a call, text, alert, or voicemail will be delivered, heard, or answered.** Twilio, mobile carriers, the internet, account balance, software, phone settings, and the destination phone can all fail. Always keep another way to reach the owner, and contact local emergency services when immediate assistance is needed.

Documentation:

- [Configuration and credential setup](docs/CONFIGURATION.md)
- [Operations, monitoring, costs, and teardown](docs/OPERATIONS.md)
- [SMS and US A2P registration](docs/SMS-A2P.md)
- [Upgrading and rollback](docs/UPGRADING.md)

## What it does

For a normal inbound call, the deployed Function:

1. dials the configured mobile phone for 18 seconds;
2. retries once if the first dial is not completed;
3. offers a voicemail if neither dial completes; and
4. optionally sends the owner a missed-call or voicemail text.

Inbound texts can optionally be forwarded to the owner. Application forwarding and alerts are **off by default** because US application-to-person messaging usually requires the deployer’s own carrier registration. Voice forwarding works independently of SMS. `SMS_ENABLED=false` does not make a Twilio number incapable of receiving carrier SMS; inbound texts are discarded by the application but may still create Twilio/carrier usage.

Anyone who knows the dedicated number can call or text it. There is intentionally no trusted-caller list. Treat both active and synthetic-test numbers as private: unwanted traffic can make the phone ring or create Twilio charges.

## Important limitations

- Emergency Bypass is an Apple device feature, not a Twilio feature. It does not force maximum volume. Keep the ringer audible and test the exact phone and contact regularly.
- A completed forwarded call can be a person or the mobile carrier’s voicemail. The application cannot reliably distinguish them.
- The synthetic checks do not prove that the owner’s physical phone rang. Perform a real by-ear ring test at least monthly.
- The provisioning flow is designed around US Twilio local numbers and iPhone Emergency Bypass. Other countries, number types, phones, and carriers may behave differently.
- GitHub can disable scheduled workflows in inactive public repositories. Do not rely on GitHub Actions as the only alarm channel.
- Voicemail records callers. The deployer is responsible for notice, consent, retention, deletion, and all laws and carrier rules that apply to their deployment.

## Costs and abuse controls

Running this project creates charges in **your** Twilio account. Setup normally purchases two local numbers: the dedicated line and a synthetic-test line. Calls can incur an inbound leg and a simultaneous outbound leg; retries, SMS segments, recordings, recording storage, carrier fees, registration, Functions usage, and monitoring can add charges. Twilio pricing and carrier rules change, so review [Twilio’s current Voice pricing](https://www.twilio.com/en-us/voice/pricing/us), Messaging/A2P pricing, and the fuller [cost model](docs/OPERATIONS.md#cost-model-and-budget-controls) before proceeding.

For a concrete reference, this is an example US pay-as-you-go budget using public prices
checked on July 13, 2026. It is an estimate, not a quote; Twilio can change prices, rounds each
call leg separately, and may add carrier fees and taxes.

| Service or resource | Example assumption | Approximate cost |
| --- | --- | ---: |
| Twilio local numbers | One active line plus one synthetic-test line at $1.15 each | **$2.30/month** |
| Forwarded voice calls | $0.0085/min inbound plus $0.0140/min outbound | **$0.0225/connected minute** |
| Synthetic voice monitoring | Supplied M3 check enabled twice daily; about 60 one-minute, two-leg calls/month | **$1.35/month** |
| Twilio Functions | First 10,000 invocations/month are free; then $0.0001/invocation | **Usually $0** at light personal usage. One request every 5 minutes is about 8,640/month; four regional requests at that cadence would be about 34,560/month, or about **$2.46** beyond the allowance |
| GitHub Actions monitoring | Standard GitHub-hosted runner in a public repository | **$0** |
| External HTTP/heartbeat monitor | Optional; Better Stack and similar providers may offer a sufficient free tier | **Often $0; provider-dependent** |
| Call recording | Recording plus retained storage | **$0.0025/min + $0.0005/stored min/month** |
| SMS traffic, if enabled | US long-code inbound or outbound SMS | **$0.0083/segment + carrier fees** |
| Sole Proprietor A2P, if needed for US SMS | $4 Brand registration and $15 Campaign vetting; then $2/month | **About $19 once + $2/month** |

That makes the example **voice-only baseline about $3.65/month** with both numbers and the
twice-daily synthetic check, before real calls, recordings, taxes, and optional external
monitoring. Adding the example Sole Proprietor A2P campaign makes the recurring baseline about
**$5.65/month**, before actual SMS traffic. A voice-only deployment with automated synthetic
calls disabled starts around **$2.30/month** before real usage. See Twilio’s current
[Voice](https://www.twilio.com/en-us/voice/pricing/us),
[SMS](https://www.twilio.com/en-us/sms/pricing/us),
[Serverless](https://www.twilio.com/en-us/serverless/pricing), and
[A2P fee](https://help.twilio.com/articles/1260803965530-What-pricing-and-fees-are-associated-with-the-A2P-10DLC-service-) pages before deployment.

Recommended safeguards:

- use a dedicated Twilio subaccount for this deployment;
- enable Twilio balance auto-recharge and a low-balance alert;
- configure Twilio usage triggers or other spending alerts, understanding that notifications are not hard spending caps;
- keep SMS disabled until registration and real delivery tests pass;
- keep the dedicated number private; and
- review usage and perform a real ring test every month.

The CLI shows a resource/cost warning and requires confirmation before buying or releasing numbers. Treat `--yes` as a billable/destructive automation switch, not as a harmless convenience.

## Prerequisites

- Node.js 22
- a paid Twilio account that can purchase a local number
- preferably, a dedicated Twilio subaccount
- a Twilio Standard API key for that subaccount
- the subaccount Auth Token for deploying and signing the local Function probe
- an iPhone if you want to use Apple Emergency Bypass
- OpenSSL or another cryptographically secure random-string generator for `HEALTH_TOKEN`
- ripgrep (`rg`) if you use the optional legal-template placeholder check

Never put a real number, credential, provider resource ID, or private webhook URL in a committed file. `.env`, Twilio deployment state, generated compliance pages, and operator notes are ignored by Git.

Read [Configuration](docs/CONFIGURATION.md) before creating credentials. Use a dedicated account/subaccount for this deployment when possible. `INSTANCE_ID` isolates the CLI’s number tags, but the deployment wrapper still uses a fixed Twilio Serverless Service name; multiple installations should not share that Service.

## Install from a fresh clone

```bash
git clone https://github.com/ankitgoyal100/emergency-line.git
cd emergency-line
npm ci
npm test
cp .env.example .env
```

If you use a fork, clone your reviewed fork instead. For a live installation, prefer a release tag or exact commit you reviewed over an unpinned moving branch. Confirm that Node is version 22. Fill `.env` with credentials and configuration from the dedicated Twilio account/subaccount. Set a stable, unique `INSTANCE_ID` (lowercase letters, numbers, and internal hyphens) so the CLI manages only this installation’s number tags. Do not change it after provisioning. Leave `TEST_NUMBER` blank until setup purchases it, and keep `SMS_ENABLED=false`. Replace every example value; the CLI deliberately rejects example credentials and numbers. Generate a long health token:

```bash
openssl rand -hex 24
```

### First deployment

Bootstrap is intentionally two-stage: the first deployment creates the Function URL without a test number; setup then purchases and wires the active/test numbers; the second deployment teaches the Function which caller must be routed to the non-ringing synthetic sink. The `/health` endpoint is expected to report voice as not ready between those stages.

1. Validate the deployment inputs without changing Twilio, then explicitly deploy the Functions:

   ```bash
   npm run deploy -- --dry-run
   npm run deploy -- --yes
   ```

2. Put the printed HTTPS service URL in `FUNCTION_URL` in `.env`.
3. Review the setup plan without purchasing anything:

   ```bash
   npm run setup -- --dry-run
   ```

4. Run setup and read its cost/resource preview carefully:

   ```bash
   npm run setup
   ```

   Setup is billable. It should not purchase numbers until you explicitly confirm.

   Setup attempts to release numbers bought by the current invocation if a later purchase/configuration step fails. If the error says cleanup failed, inspect Twilio immediately: the reported number may still be allocated and billable.

5. Put the returned synthetic-test number in `TEST_NUMBER`, then deploy again:

   ```bash
   npm run deploy -- --dry-run
   npm run deploy -- --yes
   ```

6. Save the dedicated line as a contact on the destination iPhone. For both **Ringtone** and **Text Tone**, enable Emergency Bypass, choose an audible tone, and keep the ringer volume up.

Continue directly to the validation ladder below. It contains the deliberate billable tests; do not run them twice or share the number before they pass.

## Validate the deployment

Run checks from least consequential to most consequential. None of these commands is a guarantee of future delivery.

1. Inspect the private local/provider state. Do not paste this output publicly because it contains numbers and URLs:

   ```bash
   npm run status
   npm run check:config
   npm run check:function
   ```

   `check:config` reads Twilio configuration and balance. `check:function` sends a signed HTTP request to the deployed Function and verifies the forwarding destination; it does not place a call.

2. Deliberately run the billable synthetic route check. Its signed preflight must prove that the exact tagged test caller is sunk before the command originates anything:

   ```bash
   npm run check:e2e -- --yes
   ```

   This tests Twilio’s call path into the Function without intentionally ringing the owner. It does not verify the physical phone.

3. From a separate, non-test phone, call the dedicated line. Confirm the intended phone rings, answer, and verify two-way audio.
4. Deliberately run `npm run ring-test`, type its confirmation, and verify the saved contact/device behavior by ear. This is a separate billable call and does not test the inbound forwarding path.
5. Test the unanswered path: verify the retry and recording notice. With SMS disabled, no missed-call/voicemail text is sent; inspect and manage recordings in Twilio according to your retention obligations.

Repeat the physical-phone checks after device/contact changes, carrier changes, number changes, or application rollback—not only after initial setup.

## SMS is a separate, opt-in feature

Leave `SMS_ENABLED=false` for a voice-only deployment. Before enabling SMS, the deployer must complete their own registration, consent disclosures, sender assignment, and delivery tests. Do not copy another operator’s campaign IDs, attestations, legal text, or consent claims.

See [SMS and US A2P registration](docs/SMS-A2P.md) and the [neutral legal templates](templates/legal/README.md). Run `npm run sms-readiness` once as a provider preflight while disabled and again after enabling and completing real delivery/STOP/START/HELP tests. Those human confirmations make no provider changes and are not proof of compliance. The templates are starting points, not legal advice and not evidence that consent occurred.

## Commands

| Command | Purpose | Network/cost impact |
| --- | --- | --- |
| `npm test` | Run the offline test suite | None |
| `npm run deploy -- --dry-run` | Validate deploy inputs without replacing the Function | Local only |
| `npm run deploy -- --yes` | Replace the active Twilio Functions build | **Live deployment mutation** |
| `npm run setup -- --dry-run` | Validate configuration and preview resources | Read-only |
| `npm run setup` | Purchase missing numbers or rewire existing tagged numbers after exact confirmation | **Billable or live configuration mutation** |
| `npm run status` | Show deployment configuration and account balance | Read-only Twilio API calls |
| `npm run ring-test` | Place a real test call to the owner’s phone | **Billable call** |
| `npm run swap -- --dry-run` | Preview a replacement-number operation | Read-only Twilio API calls |
| `npm run swap` | Buy a replacement line and stage it for human verification | **Billable and potentially destructive** |
| `npm run check:function` | Probe the deployed forwarding TwiML | Network request; does not ring the phone |
| `npm run check:config` | Check webhooks and account balance | Read-only Twilio API calls |
| `npm run check:e2e -- --yes` | After a non-ringing sink preflight, call from the test line into the dedicated line | **Billable synthetic call** |
| `npm run sms-readiness` | Require exact human confirmation of approval, sender, webhook, delivery, HELP, STOP/blocked, and START/restored checks | Read-only; makes no provider changes |
| `npm run release-numbers -- --dry-run` | Preview the tagged active/test numbers that would be released | Read-only |
| `npm run release-numbers` | Release this deployment’s tagged active/test numbers | **Destructive** |

`swap` must not release the old line based only on a synthetic test. Confirm the new contact and a real physical-phone ring before approving release of the old number. If cleanup fails, use `npm run status` and the Twilio Console to look for duplicate or provisional numbers.

`--yes` bypasses the initial setup, swap, or number-release confirmation and should be reserved for intentional automation. `ring-test` accepts no flags and always requires the exact `CALL` confirmation. No automation flag turns a synthetic test into proof of a physical ring, and swap still requires the separate `RANG` and old-number release confirmations.

## Monitoring

The repository includes three different checks:

- `/health` is a token-protected provider check for exact tagged-number inventory, test-number identity, voice/SMS webhook drift, HTTP methods, Twilio account status, and a balance of at least $5. It does not place a call or send a text.
- `check:config` checks both retained numbers’ webhook configuration and the account balance.
- `check:function` asks the deployed Function for forwarding TwiML and verifies the destination. It does not place a call.
- `check:e2e` first sends a signed, non-ringing webhook probe and refuses to originate when the deployed Function does not prove that the exact tagged test number will be sunk. With explicit `--yes`, it then places a billable synthetic call from the test number to the dedicated number.

For the non-ringing baseline, prefer an independent HTTPS monitor that requests `/health` and requires both HTTP 200 and the exact success marker `emergency-line-m1-ok`. This removes GitHub's scheduler from the basic availability alarm path. The included GitHub Actions monitor can separately run configuration and billable synthetic checks and ping an external heartbeat, but scheduled workflows may be delayed or dropped. Forks do not inherit secrets. If you use it, configure the repository secrets named in `.github/workflows/monitor.yml`; when `INSTANCE_ID` is set locally, add a matching `INSTANCE_ID` repository secret as well. Enable Actions failure notifications, set up an independent dead-man alert for the heartbeat, and review scheduled-workflow status periodically.

No automated check verifies the owner’s speaker, volume, contact, battery, mobile service, or attention. Keep a recurring reminder for the physical ring test.

## Operations and teardown

See [Operations](docs/OPERATIONS.md) for swapping, monitoring, incident checks, backups, costs, and complete teardown. See [Upgrading and rollback](docs/UPGRADING.md) before replacing a live Function build. Releasing Twilio numbers is irreversible and does not remove recordings, logs, Functions, Messaging Services, registrations, monitors, or GitHub secrets. Confirm each provider separately.

## Architecture

- `functions/` contains the Twilio call, SMS, health, TwiML, and message handlers.
- `src/` contains the local provisioning and number-management CLI.
- `monitor/` contains read-only configuration/Function checks and the synthetic call check.
- `.github/workflows/` contains CI and optional scheduled monitoring.

The owner’s laptop is not in the live call path after deployment. Twilio hosts the call logic; optional GitHub Actions and an uptime provider host monitoring.

## Security and contributing

Read [SECURITY.md](SECURITY.md) before reporting a vulnerability. General contribution guidance is in [CONTRIBUTING.md](CONTRIBUTING.md), and the project’s best-effort support policy is in [SUPPORT.md](SUPPORT.md).

Licensed under the [MIT License](LICENSE).

This project is not affiliated with or endorsed by Twilio Inc. Twilio and related marks belong to Twilio Inc. or its affiliates.
