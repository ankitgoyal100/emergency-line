# SMS and US A2P registration

Emergency Line is voice-only by default. Voice forwarding does not depend on SMS registration.

Twilio states that anyone—including individuals and hobbyists—sending application-generated SMS or MMS from a US ten-digit long-code number to US recipients must register for A2P 10DLC. Requirements, fees, review times, and Console screens change. Start with Twilio’s current [A2P 10DLC overview](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc) rather than copying an old registration.

This guide is operational context, not legal advice or a promise that a campaign will be accepted.

## What this application sends

If the deployer explicitly enables SMS, the application may:

- forward a caller’s inbound text to the configured owner phone;
- send the owner a missed-call notification; and
- send the owner a link to a voicemail recording.

It does not provide a marketing list or a public subscriber signup. That description alone is not proof of consent. The deployer must accurately describe the actual deployment, recipient, opt-in process, message frequency, opt-out/help behavior, privacy practices, and retention.

With `SMS_ENABLED=false`, inbound SMS webhooks are acknowledged without forwarding, and missed-call/voicemail SMS alerts are skipped. The application does not queue them for later delivery. This flag does not disable the carrier/Twilio number’s SMS capability: an inbound text can still reach Twilio and incur applicable fees before the application discards it.

The code does not maintain a recipient database or implement its own STOP/START/HELP state machine. It appends `Reply STOP to opt out` to application-generated messages and relies on the deployer’s working Twilio/carrier keyword configuration. Verify Twilio’s current default long-code handling or a carefully configured [Messaging Service Advanced Opt-Out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out). Do not enable SMS until the actual STOP, START, and HELP replies match the campaign and public disclosures.

When the owner opts out, future operational alerts to that phone can be blocked until a valid opt-in. Voice forwarding remains independent. Treat that as a real tested user choice, not an error to bypass.

## Registration checklist

1. **Keep SMS disabled.** Complete the voice setup and tests first with `SMS_ENABLED=false`.
2. **Choose the correct customer and Brand type.** Twilio distinguishes direct businesses, sole proprietors/hobbyists, and ISVs. Do not use another deployer’s identity, tax information, Brand, or campaign.
3. **Create the deployer’s own customer profile and Brand.** Supply accurate current information that matches the registering person or entity.
4. **Create a dedicated Messaging Service and campaign.** Describe only the messages the deployment will actually send. Do not select an emergency-services or other special use case merely because this repository is named Emergency Line. `MESSAGE_BRAND` and sample messages must identify the real registered sender consistently.
5. **Provide truthful public disclosures.** If Twilio requests privacy, terms, and opt-in URLs, customize and host the templates in [`templates/legal`](../templates/legal/README.md). A template is not evidence that anyone opted in.
6. **Configure STOP, START, and HELP behavior.** The repository does not implement those responses itself. Ensure Twilio’s actual keyword handling, confirmation/help text, sender identity, and support route match the registration. Do not merely put `Reply STOP` in sample text. Be aware that enabling Advanced Opt-Out changes behavior for every sender in that Messaging Service and, according to Twilio’s current documentation, cannot be disabled without contacting support.
7. **Wait for the campaign to be approved.** A submitted or pending campaign is not ready to send.
8. **Add only the active sender to the campaign’s Messaging Service sender pool.** Twilio registers each number separately after campaign approval; wait until the number itself shows as registered. The synthetic voice-test number does not need to send owner alerts.
9. **Preserve the number webhook for inbound texts.** This application sets `/sms` on the phone number. Twilio documents the Messaging Service integration option as **Defer to sender’s webhook**; verify that the Service is not overriding the number webhook or auto-creating Conversations. See [Messaging Services incoming-message handling](https://www.twilio.com/docs/messaging/services#incoming-message-handling).
10. **Run the provider preflight.** With `SMS_ENABLED=false`, run `npm run sms-readiness`. It makes read-only Twilio API calls and requires exact human confirmation of campaign approval, individual sender registration, and webhook behavior. It makes no provider changes and is not proof of compliance.
11. **Enable deliberately.** Only after that preflight passes should the deployer set `SMS_ENABLED=true` and redeploy.
12. **Perform the real delivery tests.** Use two phones and inspect Twilio delivery status/errors:
    - from an external phone, text the active line and confirm that the application-generated forwarded copy reaches only the opted-in owner;
    - to test a missed-call/voicemail alert, call from the external phone, deliberately leave both owner dials unanswered, and leave a short non-sensitive recording after the notice; verify the alert and delete the test recording according to the retention policy;
    - from the owner phone, exercise HELP, then STOP and the blocked-delivery behavior, then START and restored delivery exactly as described in the campaign;
    - confirm no message goes to an unintended destination; and
    - check segment count and charges.

    A mobile carrier’s voicemail can answer a forwarded leg and cause Twilio to mark the dial completed before the application recorder/alert is reached. That is a known voice-path limitation, not an A2P-readiness success.

    If any test fails, immediately restore `SMS_ENABLED=false` and redeploy.
13. **Run the final readiness gate.** Run `npm run sms-readiness` again while enabled. It repeats the provider confirmations and requires exact confirmation of real outbound/inbound delivery plus HELP, STOP/blocked-delivery, and START/restored-delivery behavior. The command records no durable approval state; `SMS_ENABLED=true` is still just the operator-controlled runtime gate.

## Number changes

A replacement ten-digit long-code number is not automatically registered merely because the campaign was approved. Before `npm run swap`, set `SMS_ENABLED=false` and redeploy so the provisional sender cannot attempt application messages. Add the replacement sender, wait for its registered status, and repeat inbound/outbound/STOP/START/HELP tests before enabling SMS for it. Remove released numbers from sender pools.

## Ongoing obligations and costs

Campaign and message fees can continue even when traffic is low. Review Twilio’s current fees and the campaign status regularly. Keep consent and public disclosures accurate as behavior changes. Remove unused senders and cancel/deactivate unused campaign or Messaging Service resources through Twilio’s current process.

Never commit campaign/Brand/Messaging Service identifiers, screenshots containing personal information, legal identity records, phone numbers, or the generated public pages. Store them in ignored operator notes or provider-managed configuration.
