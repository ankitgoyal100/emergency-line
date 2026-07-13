# Configuration

Emergency Line keeps deployment-specific values in `.env`, which is ignored by Git. Copy the example once, edit the copy locally, and never paste the finished file into an issue, pull request, Actions log, or chat.

```bash
cp .env.example .env
chmod 600 .env # Unix/macOS: restrict the file to your account
```

## Twilio account preparation

Use a paid Twilio account that is allowed to purchase US local numbers. A dedicated [Twilio subaccount](https://www.twilio.com/docs/iam/api/subaccounts) is strongly recommended when the parent account has any other resources:

- phone numbers, logs, and credentials stay easier to inventory;
- this project deploys a fixed Serverless Service name, so `INSTANCE_ID` alone does not isolate multiple Function deployments; and
- closing a dedicated subaccount provides a clear final teardown boundary.

A subaccount is **not a spending cap**. Twilio bills its usage to the parent account’s shared balance, and suspension of the parent affects its subaccounts.

Inside the account or subaccount that will own the deployment:

1. Copy its Account SID and Auth Token from Twilio Console.
2. Create a Standard API key in that same account and save the secret when Twilio displays it. Twilio documents the key types in its [API keys overview](https://www.twilio.com/docs/iam/api-keys).
3. Confirm the Account SID, API key, API-key secret, and Auth Token all belong to the same intended account/subaccount. A main-account API key does not manage a subaccount’s resources.
4. Complete any identity, address, regulatory, or payment requirements Twilio presents before trying to buy a number.

The Standard API key drives routine number and status operations. The Auth Token is also required by the deployment wrapper and to sign safe webhook probes. Both secrets can authorize consequential actions; store them accordingly.

## Environment reference

| Variable | Required | Purpose and handling |
| --- | --- | --- |
| `TWILIO_ACCOUNT_SID` | Yes | `AC…` identifier of the account/subaccount that owns every resource. Keep it with the private deployment inventory. |
| `TWILIO_API_KEY` | Yes | `SK…` Standard API key SID from that same account/subaccount. |
| `TWILIO_API_SECRET` | Yes | Secret paired with the API key. Treat as a credential; Twilio may show it only when created. |
| `TWILIO_AUTH_TOKEN` | Yes | Account/subaccount Auth Token used for deployment and signed probes. Treat as a high-value credential. |
| `YOUR_REAL_NUMBER` | Yes | Destination mobile number in E.164 form. The repository’s `+1555…` placeholder examples are intentionally rejected; replace them with the real destination. |
| `TEST_NUMBER` | After setup | Leave blank for the bootstrap deployment. `npm run setup` purchases it; copy the returned value here before the second deployment. |
| `DEFAULT_AREA_CODE` | No | Preferred three-digit US area code. It is only a preference and inventory may be unavailable. Leave blank to search US local inventory without an area-code filter. |
| `INSTANCE_ID` | Strongly recommended | Stable 1–32 character lowercase name used in Twilio number tags. Use letters, numbers, and internal hyphens. Never change it after provisioning unless you intend to stop discovering the existing numbers. |
| `FUNCTION_URL` | After first deploy | HTTPS base URL printed by the deployment. Do not include `/forward`, a query, credentials, or a fragment. |
| `HEALTH_TOKEN` | Yes | Random token of at least 32 characters with adequate entropy. It protects `/health`; URLs containing it must be treated as secrets. |
| `SMS_ENABLED` | Yes | Keep exactly `false` until the deployer’s own registration and real delivery tests pass. This is a gate, not an automated compliance check. |
| `MESSAGE_BRAND` | If SMS is enabled | Sender label included in application-generated messages. Keep it accurate and consistent with the registered sender identity. Maximum 80 characters; no control characters. |
| `HEARTBEAT_URL` | For scheduled monitoring | Secret ping URL supplied by an external dead-man monitor. It is not required for voice forwarding itself. |

Generate a health token locally:

```bash
openssl rand -hex 24
```

The deployment wrapper is designed to expose only `YOUR_REAL_NUMBER`, `TEST_NUMBER`, `HEALTH_TOKEN`, `SMS_ENABLED`, `MESSAGE_BRAND`, and `INSTANCE_ID` as Function runtime values. It supplies the Account SID/Auth Token to the deployment tool through a short-lived restricted file and does not upload `.env` as a file or the API-key secret. Verify the deployed variable list in Twilio and review `scripts/deploy.js` before relying on this boundary after an upgrade.

## What must stay identical

- `INSTANCE_ID` must match between local commands and the optional GitHub Actions secret. A mismatch makes the tools look for a different set of numbers.
- `FUNCTION_URL` must match the service to which the active and test numbers are wired.
- `TEST_NUMBER` in `.env` must match the number tagged as this instance’s test line and must be redeployed to the Function. Otherwise the synthetic call could take the normal forwarding path.
- The destination in `.env` must match the deployed Function response checked by `npm run check:function`.

There is intentionally no `ACTIVE_NUMBER` variable. Local commands discover the active line from the exact Twilio tag derived from `INSTANCE_ID`; the test number is also discovered for account operations but must additionally be deployed as `TEST_NUMBER` so the Function can recognize and sink it.

`npm run status` prints phone numbers, URLs, tags, and balance to the local terminal. Treat that output as private even though it contains no Auth Token.

A Standard API key may be unable to read the account-status resource; `status` can therefore show `unknown` even while number and balance requests work. Treat `unknown` as limited visibility, not proof that the account is active. The synthetic call and provider billing/Console checks cover different parts of that gap.

## Rotation and recovery

- Rotate an exposed API key secret by creating a replacement key, updating private configuration and repository secrets, validating read-only commands, then revoking the old key.
- Rotate an exposed Auth Token in Twilio, then update `.env` and the Actions secret before running signed probes. The Auth Token is not intended to be a Function runtime variable, so token rotation alone does not require a deployment.
- Rotate an exposed health token, redeploy, and update every HTTP monitor URL.
- Replace an exposed heartbeat URL in the monitoring provider and GitHub secret.
- Do not rotate or release a phone number merely as a side effect of credential rotation. Number replacement is a separate, billable operation with a physical-phone confirmation gate.

Removing a value from the current file does not remove it from Git history, Actions logs/artifacts, provider logs, forks, caches, or backups. Follow [SECURITY.md](../SECURITY.md) if a private value was committed or published.
