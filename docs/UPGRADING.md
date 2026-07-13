# Upgrading and rollback

An application upgrade and a phone-number change are separate operations. A normal source update should not buy, rewire, rename, or release a number.

`npm run deploy -- --yes` replaces the active Twilio Functions build. There is no automatic application rollback command, so record a known-good source revision and protect the matching private configuration before deploying.

## Before an upgrade

1. Confirm the line has another usable contact path while maintenance is underway.
2. Make an encrypted, access-controlled backup of `.env`, `.twiliodeployinfo` if present, generated `assets/`, and the private external-resource inventory. Do not add any of them to Git.
3. Require a clean tracked working tree and record the deployed revision:

   ```bash
   git status --short
   git rev-parse HEAD
   ```

4. Read the target release notes and compare `.env.example` with your private `.env` without printing secret values. Pay particular attention to renamed variables, `INSTANCE_ID`, `SMS_ENABLED`, and runtime changes.
5. If SMS is enabled, understand whether the update changes message content, opt-out handling, webhooks, or the registered use case before deploying it.

## Upgrade procedure

Use a reviewed release tag or exact commit. Avoid an unreviewed moving branch for the live deployment.

```bash
git fetch --tags
REVIEWED_REF='replace-with-reviewed-tag-or-commit'
git switch --detach "$REVIEWED_REF"
npm ci
npm test
npm audit
npm run deploy -- --dry-run
```

The commands above do not place calls, send messages, buy numbers, or release numbers. `npm ci` changes only the local dependency directory. The deployment dry-run validates inputs but does not contact Twilio to replace the build.

When ready to mutate the live Function:

```bash
npm run deploy -- --yes
```

After deployment, use the validation ladder in [README.md](../README.md#validate-the-deployment). Start with non-calling checks. Run the synthetic and physical-call tests only deliberately, because they incur usage and the physical tests ring a real phone.

Do **not** run `npm run setup` merely because the source changed. On an existing installation, setup can rewire the active/test number webhooks; if a tagged number is missing, it can purchase a replacement after confirmation.

## Application rollback

If the new Function is faulty but provider resources are intact:

1. Tell intended callers to use the backup contact path.
2. Return the working tree to the exact known-good revision recorded before the upgrade. With a clean tree, `git switch --detach <known-good-commit>` is one explicit option. Do not use a destructive Git reset when there are uncommitted changes.
3. Restore the matching private environment schema if the upgrade changed it.
4. Run `npm ci`, `npm test`, and `npm run deploy -- --dry-run` at that revision.
5. Redeploy the known-good revision with `npm run deploy -- --yes`.
6. Repeat the non-calling checks, then deliberately repeat the necessary synthetic and physical tests.

Rolling back the Function does not roll back phone-number purchases/releases, Messaging Service sender pools, A2P registration, GitHub secrets, monitoring configuration, or provider-side data. Inspect those separately.

## Number rollback boundary

`npm run swap` keeps the previous active number until the operator confirms the replacement rang the intended physical phone and then separately confirms old-number release. Declining release is the safest rollback window, although both numbers remain billable.

Once Twilio releases a number, recovery is not guaranteed and the number may later be assigned to someone else. Never treat a released number as recoverable. Update contacts and intended callers only after the replacement has passed the real inbound and two-way-audio test.
