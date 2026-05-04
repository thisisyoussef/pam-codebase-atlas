# Architecture

## Public Runtime

The Railway service is a React app served by a small Express process. It reads only static files from `dist/`, including the generated onboarding manifest.

No LLM key is present at runtime.

## Private Factory

The LLM factory lives in GitHub Actions:

```text
.github/workflows/deploy-staging.yml
.github/workflows/promote-production.yml
```

The factory runs after Markdown changes are reviewed and merged. It installs dependencies, calls `scripts/generate-onboarding-manifest.mjs`, validates the result through a Zod schema, builds the app, and deploys the generated workspace to Railway.

The factory does not commit generated JSON back into `main`. That keeps `main` review-protected while allowing staging to update directly after merge.

## Deployment Shape

```text
content/onboarding.md
  -> GitHub PR review
  -> merge to main
  -> staging factory workflow
  -> generated manifest in CI workspace
  -> Railway staging

manual workflow_dispatch
  -> production factory workflow
  -> generated manifest in CI workspace
  -> Railway production
```

## Why Generate In CI?

1. The public website never receives the LLM secret.
2. The rendered app is fast and cacheable.
3. Branch protection can require human approval for Markdown changes.
4. Staging can update directly after merge without bypassing protected `main`.
5. Production can stay manual through a separate workflow.
6. The factory can fail safely before public deployment.

## Source References

- Railway CLI deployment: https://docs.railway.com/cli/up
- Railway environments: https://docs.railway.com/reference/environments
- Railway config as code: https://docs.railway.com/reference/config-as-code
- GitHub Actions path filters and permissions: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- GitHub Actions secrets: https://docs.github.com/en/actions/concepts/security/secrets
- OpenAI structured outputs: https://platform.openai.com/docs/guides/structured-outputs
