# Deployment Runbook

## GitHub Repository

Create the public repository:

```bash
cd /Users/youss/PAM/repos/pam-codebase-atlas
git init
git add .
git commit -m "Create PAM codebase atlas"
gh repo create pam-codebase-atlas --public --source=. --remote=origin --push
```

Protect `main` after the first push. The intended policy is:

- pull request required
- one approval required
- code-owner review required
- stale reviews dismissed after new pushes
- force pushes disabled
- branch deletion disabled

The code owner is declared in:

```text
.github/CODEOWNERS
```

## GitHub Secrets

Add repository secrets:

```text
OPENAI_API_KEY
RAILWAY_TOKEN_STAGING
RAILWAY_TOKEN_PRODUCTION
```

Add repository variables:

```text
OPENAI_MODEL=gpt-4.1
RAILWAY_PROJECT_ID=<railway project id>
RAILWAY_SERVICE_NAME=pam-codebase-atlas
```

## Railway

Create one Railway project with two persistent environments:

```text
staging
production
```

Create a `pam-codebase-atlas` service in both environments. The GitHub Actions workflows deploy with:

```bash
railway up --ci --project "$RAILWAY_PROJECT_ID" --environment "$RAILWAY_ENVIRONMENT" --service "$RAILWAY_SERVICE"
```

## Staging Flow

```text
PR approved and merged to main
  -> Deploy Staging workflow
  -> LLM manifest generation
  -> build
  -> Railway staging deploy
```

No manual action is required after merge.

## Production Flow

```text
GitHub Actions
  -> Promote Production
  -> choose ref
  -> Run workflow
  -> production environment approval if configured
  -> Railway production deploy
```

Production never deploys merely because `main` changed.

## Notes

- Do not put `OPENAI_API_KEY` in Railway variables.
- Do not call PAM runtime APIs from this service.
- If Railway CLI is not authenticated locally, create the Railway project in the dashboard and store project/service IDs as GitHub variables.
