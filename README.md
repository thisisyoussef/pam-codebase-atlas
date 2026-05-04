# PAM Codebase Atlas

PAM Codebase Atlas is a living onboarding website for engineers learning the PAM codebase.

The product turns one human-maintained Markdown file into an interactive site with:

- a live runtime map from caller input to provider side effects
- repo ownership and first-debugging-question guidance
- ticket intake and evidence-lane breakdowns
- DMS write-path safety warnings
- guided tours for common ticket families
- a generated, polished web surface for new engineers and reviewers

The goal is simple: engineers improve onboarding by editing Markdown, while new engineers get something richer than a static document.

## What You Edit

Most contributors only edit:

```text
content/onboarding.md
```

That file is the source of truth. Write it for a future engineer who needs to understand PAM while doing real ticket work.

Good edits include:

- clearer repo ownership explanations
- better runtime path descriptions
- reusable debugging heuristics
- safety boundaries
- eval and verification guidance
- generalized lessons from recent tickets

Avoid ticket-specific dumps. Promote the smallest durable lesson.

## What The System Builds

The website is generated from the Markdown by a private LLM factory.

```text
Pull request edits content/onboarding.md
  -> CI validates local deterministic generation
  -> maintainer approves and merges to main
  -> GitHub Actions runs the private LLM factory
  -> generated manifest is built into the app
  -> Railway staging deploys automatically
  -> Railway production deploys only from manual promotion
```

The public web app never calls the LLM. It only reads generated static JSON.

## Environments

### Staging

Staging updates automatically after approved changes land on `main`.

Workflow:

```text
.github/workflows/deploy-staging.yml
```

Staging is meant to show the newest approved Markdown-generated version immediately.

### Production

Production stays manual.

Workflow:

```text
.github/workflows/promote-production.yml
```

Use GitHub Actions -> Promote Production -> Run workflow. The workflow can promote `main` or a specific ref.

## Review Policy

`main` is protected.

Expected repository settings:

- require pull requests before merging
- require at least one approval
- require code owner review
- dismiss stale approvals after new pushes
- block force pushes and branch deletion

The code owner is declared in:

```text
.github/CODEOWNERS
```

## Runtime Boundary

The deployed Railway website is a normal React app served by Express.

It does not:

- call PAM runtime services
- call DMS providers
- schedule, cancel, or reschedule appointments
- store or expose the OpenAI key
- require a database

The LLM engine is insulated inside GitHub Actions.

## Required GitHub Secrets And Variables

Repository secrets:

```text
OPENAI_API_KEY
RAILWAY_API_TOKEN
```

`RAILWAY_API_TOKEN` is an account/workspace token for GitHub Actions deployments. For least privilege, replace it later with environment-scoped Railway project tokens named `RAILWAY_TOKEN_STAGING` and `RAILWAY_TOKEN_PRODUCTION`; the workflows already support those names.

Repository variables:

```text
OPENAI_MODEL=gpt-4.1
RAILWAY_PROJECT_ID=<railway project id>
RAILWAY_SERVICE_NAME=pam-codebase-atlas
```

Railway project tokens should be scoped narrowly when possible.

## Railway Setup

Create one Railway project with two persistent environments:

```text
staging
production
```

Create or duplicate the `pam-codebase-atlas` service in both environments.

The app uses `railway.toml` with:

```text
build: npm ci && npm run build
start: npm run start
healthcheck: /healthz
```

Deployments are performed by GitHub Actions with `railway up`.

## Local Development

```bash
npm install
npm run generate:local
npm run dev
```

Local generation does not need an LLM key. It creates a deterministic manifest so you can work on the UI and docs quickly.

To test the LLM generator locally:

```bash
OPENAI_API_KEY=... npm run generate
```

Build and run the production server locally:

```bash
npm run build
npm run start
```

Healthcheck:

```bash
curl http://localhost:4178/healthz
```

## Public Repository Safety

This repository is public. Treat every committed file as visible to the internet.

Do not commit:

- secrets, tokens, credentials, or `.env` files
- raw call transcripts, recordings, phone numbers, or customer data
- live dealership details that are not safe to publish
- internal incident evidence that belongs in a private ticket run folder
- instructions that could be used to perform live DMS writes

Use [CONTRIBUTING.md](./CONTRIBUTING.md) for content rules and [SECURITY.md](./SECURITY.md) for reporting sensitive content.

## Source Material

The first version of `content/onboarding.md` was seeded from the local PAM onboarding notes. Going forward, the public Markdown file is the reviewable shared source for the website.
