# Security

This repository is public by design. Treat every committed file as world-readable.

## Do Not Commit

- API keys, tokens, passwords, cookies, or `.env` files
- raw call transcripts or recordings
- customer data, phone numbers, appointment details, or dealership-private records
- live provider credentials or DMS write-path test instructions
- private infrastructure identifiers unless they are intentionally public

## LLM Boundary

The public Railway app must not receive `OPENAI_API_KEY`.

The LLM factory runs only inside GitHub Actions and produces a generated manifest during deployment. The generated app reads static JSON.

## Reporting

If you notice sensitive content in the repository, remove it in a private branch and notify the maintainer immediately. Do not open a public issue containing the sensitive value.
