# Contributing

Thanks for improving the PAM Codebase Atlas.

Most contributors should edit only:

```text
content/onboarding.md
```

That Markdown file is the human source. The website is generated from it.

## Contribution Flow

1. Create a branch.
2. Edit `content/onboarding.md`.
3. Open a pull request into `main`.
4. Wait for CI and code-owner approval.
5. Merge after approval.

After merge, staging deploys automatically. Production promotion is manual.

## What Belongs In The Markdown

Add information that helps a new engineer understand:

- the runtime path
- repo ownership
- evidence lanes
- common debugging splits
- safety boundaries
- verification flow
- reusable lessons from real work

Prefer concise, durable system lessons over ticket-specific detail.

## What Does Not Belong

Do not add:

- secrets, tokens, API keys, credentials, or private URLs
- customer names, phone numbers, call recordings, raw transcripts, or live call IDs
- dealership-specific details unless they are already safe to publish
- speculative debugging notes
- instructions that could trigger live DMS writes

When in doubt, keep ticket-specific evidence in the private ticket run folder and promote only the generalized lesson.
