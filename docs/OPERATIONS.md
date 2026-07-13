# Operations

This runbook covers a generic self-hosted deployment. Keep exact numbers, credentials, provider IDs, monitor URLs, costs, contacts, and carrier-registration records in ignored local files—not in this document or Git history.

## Cost model and budget controls

Review the provider’s current prices before setup and after pricing notices. For a US local-number deployment, start with [Twilio Voice pricing](https://www.twilio.com/en-us/voice/pricing/us), Twilio Messaging/A2P pricing, Twilio Functions pricing, and the pricing of any external monitor.

The main cost sources are:

| Action/resource | Cost exposure |
| --- | --- |
| Normal setup | Two recurring local-number rentals: active and synthetic-test numbers |
| Answered forwarded call | Applicable inbound call leg plus the outbound leg to the owner |
| Retry/unanswered call | Additional outbound attempt, followed by recording and storage if the application voicemail is reached |
| SMS traffic | Inbound messages and carrier fees can apply even while application forwarding is disabled; enabling SMS adds outbound segments and Brand/campaign fees, and long bodies can consume multiple segments |
| `check:e2e` | A billable synthetic call from the test number to the active number; the signed HTTP preflight itself is not a call |
| `ring-test` | A billable direct call from the active number to the owner’s phone |
| `swap` | A third recurring number from purchase until either provisional rollback or old-number release, plus its synthetic verification call |
| Hosting/monitoring | Twilio Functions usage, GitHub Actions according to the repository/plan, and any external uptime/dead-man service |

Subaccounts isolate resources but [share the parent Twilio balance](https://www.twilio.com/docs/iam/api/subaccounts). Auto-recharge is therefore generally an account-level availability control, not per-installation cost isolation.

Twilio [Usage Triggers](https://www.twilio.com/docs/usage/api/usage-trigger) and other alerts notify after usage data is evaluated; they can lag and do not stop calls or cap spending. Use several controls together:

- low-balance and auto-recharge settings chosen for the owner’s availability/risk tradeoff;
- usage and invoice alerts at conservative thresholds;
- an independent review of call/message logs and number inventory;
- a private number shared with as few people as practical; and
- prompt voice-only operation or number replacement when abuse is detected.

There is no caller allowlist or application rate limiter. Anyone who learns the number can make it ring and incur usage. A spending shutdown can also disable the very call path this project is meant to provide, so choose and test that tradeoff explicitly.

## Monitoring setup and coverage

The checks cover different layers and should not be described interchangeably:

| Check | What it proves at that moment | What it does not prove |
| --- | --- | --- |
| Tokenized `/health` | Function runtime is responding; exact active/test inventory, test-number identity, webhook methods/URLs, account status, and balance of at least $5 pass read-only Twilio API checks | Forwarding TwiML, carrier/PSTN delivery, owner phone, two-way audio, SMS registration, or SMS delivery |
| `status` | Tagged number inventory, configured webhooks, account-status visibility, and balance | Deployed code, call delivery, destination phone, or SMS registration |
| `check:config` | Active/test-number webhook matches and a readable balance at or above the built-in $5 threshold | Deployed routing response or physical delivery |
| `check:function` | A signed Function request returns TwiML with the configured destination | It does not place a call or verify the physical phone |
| `check:e2e -- --yes` | The exact test caller is configured as a sink and a synthetic Twilio call completes | Owner phone, contact, Emergency Bypass, two-way audio, or SMS |
| `ring-test` | A direct test call audibly reached the intended physical phone under its current settings | The inbound number-to-Function forwarding path |
| Real inbound call | The active line reached the intended phone; answering can verify two-way audio | Future availability or the unanswered/recording path unless separately tested |

### Optional GitHub Actions monitor

The included workflow runs `check:config` about every 30 minutes and a billable `check:e2e` about every 12 hours. Scheduled workflows run from the default branch. A manual `workflow_dispatch` runs only the configuration check; the workflow intentionally reserves the synthetic call for its 12-hour scheduled event.

To use it, the deployment owner needs a GitHub repository they control (the canonical repository or their own reviewed fork), because a local clone cannot store Actions secrets or run schedules. Updating a local clone later does not update that repository’s workflow; review and merge/push workflow upgrades separately.

Forks do not inherit repository secrets, and scheduled workflows are disabled by default in a fork. Configure these repository secrets before enabling the monitor:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_API_KEY`
- `TWILIO_API_SECRET`
- `TWILIO_AUTH_TOKEN`
- `FUNCTION_URL`
- `INSTANCE_ID` when the deployment uses one (recommended); it must exactly match `.env`

Add them under the controlled repository’s **Settings → Secrets and variables → Actions**, then review and enable **Actions → Emergency Line Monitor**. Confirm the first configuration-only run succeeds before waiting for the schedule. Do not put the owner’s destination number in Actions; the supplied workflow does not require it.

The workflow deliberately does not store `YOUR_REAL_NUMBER`, so it does not run `check:function`. Run that check from the private operator environment.

GitHub documents that [public-repository schedules can be disabled after 60 days without repository activity](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows); review the workflow state periodically. The independent HTTP health monitor below is the primary non-ringing availability alarm and does not depend on GitHub's scheduler.

If you do not want the recurring synthetic-call cost, keep the workflow disabled or review and customize it before enabling.

### Optional HTTP health monitor

Configure an external HTTPS monitor to send a `GET` request to:

```text
https://<your-function-host>/health
```

Add the custom request header `X-Health-Token: <your-health-token>`. The Function intentionally rejects query-string tokens so the secret is less likely to appear in URLs, browser history, proxy/access logs, screenshots, or support exports.

Require all three of the following: HTTP 200, JSON with `"ok":true`, and the exact keyword `emergency-line-m1-ok`. The Function authenticates the token before making any provider request, then performs read-only Twilio API checks for exact active/test inventory, test-number identity, webhook URLs and methods, active account status, and at least $5 of balance. A provider timeout or API failure returns 503; a detected configuration problem returns 500. Responses are deliberately sanitized and marked `Cache-Control: no-store`.

This should be the primary non-ringing availability monitor because it does not depend on GitHub Actions scheduling and does not place calls or send messages. Prefer a five-minute interval and alert after two or three consecutive failures to reduce transient provider noise. One request every five minutes produces about 8,640 Function invocations and 34,560 read-only Twilio API requests in a 30-day month. Monitoring providers may check from multiple regions or retry failures, multiplying both counts. For example, four requests per interval would be about 34,560 Function invocations; with Twilio's example first-10,000-invocations allowance and $0.0001 overage price, that would add about $2.46/month if the allowance is otherwise unused. Check the monitor's location settings, actual Function usage, and current pricing rather than treating this estimate as a cap.

The check still cannot prove that the tagged active number is the unchanged number already shared with callers; it also cannot prove forwarding TwiML, the carrier/PSTN path, physical ringing, audio, A2P approval, or SMS delivery. Keep the deeper synthetic and human checks below. Treat the header value and monitor configuration as credentials; rotate the token if either appears in a public log or report.

## Monthly owner check

1. Run `npm run status` and inspect all numbers, webhooks, account status, and balance.
2. Review Twilio usage, auto-recharge, low-balance alerts, and unexpected caller/message activity.
3. Run `npm run check:config`, `npm run check:function`, and—after reviewing the billable-call warning—`npm run check:e2e -- --yes`.
4. Run `npm run ring-test` and confirm by ear that the intended physical phone rings through the owner’s normal Silent/Focus settings.
5. Place an inbound call from a different carrier/phone, answer, and confirm two-way audio.
6. If SMS is enabled, test one outbound alert and one inbound forwarded text, including delivery status. Periodically retest the documented STOP, START, and HELP paths.
7. Confirm the independent HTTP monitor has a recent successful `/health` check and that any optional scheduled workflow/dead-man monitor is still enabled.
8. Review dependency/security update notices and follow [Upgrading and rollback](UPGRADING.md) for a reviewed release.

Automated success is never a substitute for steps 4 and 5.

## If a check fails

- Keep another contact route available and tell intended callers not to rely on the line until resolved.
- Check the Twilio status page, account balance, subaccount status, number ownership, number webhooks, Function deployment, and recent call/message errors.
- Check that the destination phone number and `FUNCTION_URL` in local configuration match the deployed Function response.
- Verify that the phone is powered, connected to mobile service, audible, and still has the dedicated number saved with Emergency Bypass enabled.
- For SMS, verify campaign approval, individual sender registration, Messaging Service sender pool, **Defer to sender’s webhook**, `/sms`, delivery errors, and opt-out status.
- Do not paste unredacted logs into a public issue.

## Replacing a leaked or abused number

Swapping is billable and can leave both numbers active if cleanup fails.

1. If SMS is enabled, set `SMS_ENABLED=false` and redeploy before swapping. Voice remains available; this prevents the unregistered replacement sender from attempting application messages.
2. Run `npm run swap -- --dry-run` and review the billable resource/call plan.
3. Run `npm run swap`. After its purchase confirmation, it buys one provisional number and runs the signed sink preflight plus a billable synthetic call.
4. When prompted, save the new number in the destination phone contact, re-enable Emergency Bypass for ringtone and text tone, and place a real inbound call from a non-test phone. Answer and confirm two-way audio and the intended physical ring.
5. Type `RANG` only after the preceding physical test. This promotes the new number; it still does not release the old number.
6. If SMS is desired, register the new sender and complete the SMS tests in [SMS-A2P.md](SMS-A2P.md) while the old line remains available.
7. Release the old number only after every required voice/SMS test passes. Declining the final release prompt retains a rollback path but both numbers remain billable.
8. Run status again and inspect the Twilio Console for old, provisional, retired, or duplicate tagged numbers.
9. Update monitoring configuration and the small group of intended callers without committing the number.

A synthetic sink call is useful, but it cannot authorize release of the old line by itself.

## Backups

Source code can be recovered from GitHub, but live configuration cannot. Keep an encrypted, access-controlled backup of `.env`, `.twiliodeployinfo` if present, generated `assets/`, the current contact/setup instructions, and a minimal inventory of external resources. Do not put credentials or generated operator pages in a Git bundle or repository.

Test the restore instructions without printing secret values. Rotate credentials if a backup is lost or exposed.

## Complete teardown

Teardown is destructive. Releasing a phone number may be irreversible, and another person may later receive it. Tell intended callers to stop using the line first.

1. Tell intended callers to use another route. Disable the scheduled GitHub workflow and external monitors first so teardown cannot create synthetic calls or repeated failure alerts.
2. If SMS is enabled, set `SMS_ENABLED=false` and redeploy while the line still exists. Remove or replace any public legal/consent URLs only after carrier/provider cleanup no longer depends on them.
3. Back up any voicemail or records that must be retained, then delete what is no longer needed under the deployer’s retention policy.
4. Run `npm run release-numbers -- --dry-run`. Confirm it lists only this deployment’s tagged active/test numbers. Retired or provisional numbers require separate review in Twilio.
5. Run `npm run release-numbers` and complete its explicit confirmation to release the listed active/test numbers.
6. In Twilio, verify there are no remaining billable numbers—including provisional/retired resources—in the dedicated account/subaccount.
7. Remove senders from Messaging Services. Cancel/deactivate unused A2P campaigns and delete unused Messaging Services using Twilio’s current instructions; campaign fees may be separate from phone-number fees.
8. Delete the Twilio Serverless Service/environments/builds and unused API keys, or permanently close the dedicated subaccount if nothing else uses it. Closing a subaccount releases all of its numbers and cannot be undone. Do not close a shared account without reviewing every other resource.
9. Delete external uptime monitors/heartbeats and any paid monitoring subscription created for this deployment.
10. Remove the GitHub Actions secrets and review Actions artifacts/logs for private values. Delete a fork only if it is no longer wanted; deleting source alone does not delete provider resources.
11. Remove the contact from the destination phone and tell every recipient of the old number that it no longer belongs to this line.
12. Delete local `.env`, deployment state, generated compliance pages, and operator notes only after all provider cleanup is verified.
13. If no other Twilio workload uses the parent account, review auto-recharge, payment methods, and remaining balance with Twilio. Subaccounts share that parent balance.
14. Review billing/usage after the next billing cycle. A zero-resource inventory is stronger evidence than a successful CLI message.

The teardown command can release numbers owned by this project; it cannot prove that every separately created provider resource or subscription is gone. Complete the provider-by-provider verification above.
