# Contributing

Thank you for helping improve Emergency Line. Small, reviewable changes with tests and clear safety implications are easiest to accept.

## Before opening a change

1. Read the warnings and limitations in [README.md](README.md).
2. For a bug or feature discussion, search existing issues before opening a new one.
3. For a vulnerability or exposed private value, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Local development

```bash
npm ci
npm test
```

The automated test suite must be offline. Use dependency-injected fakes; do not call Twilio, ring a real phone, send a real message, buy a number, or release a resource from a test.

Before submitting:

```bash
npm test
npm audit
git diff --check
```

Update the README and related operations documentation whenever a change affects configuration, costs, provider mutations, safety, monitoring coverage, carrier registration, or teardown.

## Pull-request expectations

- Explain the user-visible outcome and the failure modes considered.
- Include tests for new behavior and destructive/error paths.
- Keep setup, swap, and `release-numbers` dry-run and confirmation behavior intact.
- Do not weaken the voice-only default or enable SMS implicitly.
- Do not claim that a synthetic test verified a physical phone.
- Do not include real phone numbers, credentials, provider IDs, live URLs, personal compliance records, or logs containing those values.
- Use fake North American example numbers in the reserved `+1 555` range.

By submitting a contribution, you agree that it may be distributed under the repository’s [MIT License](LICENSE).
