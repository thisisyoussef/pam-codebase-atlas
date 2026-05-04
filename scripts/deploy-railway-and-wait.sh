#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${RAILWAY_PROJECT_ID:-}" || -z "${RAILWAY_ENVIRONMENT:-}" || -z "${RAILWAY_SERVICE:-}" ]]; then
  echo "RAILWAY_PROJECT_ID, RAILWAY_ENVIRONMENT, and RAILWAY_SERVICE are required." >&2
  exit 1
fi

railway link "$RAILWAY_PROJECT_ID" >/dev/null

set +e
railway up \
  --ci \
  --no-gitignore \
  --project "$RAILWAY_PROJECT_ID" \
  --environment "$RAILWAY_ENVIRONMENT" \
  --service "$RAILWAY_SERVICE" 2>&1 | tee /tmp/railway-up.log
up_status=${PIPESTATUS[0]}
set -e

deployment_id="$(
  grep -Eo 'id=[0-9a-f-]+' /tmp/railway-up.log | tail -1 | cut -d= -f2
)"

if [[ -z "$deployment_id" ]]; then
  echo "Could not find Railway deployment id in railway up output." >&2
  exit "$up_status"
fi

echo "Waiting for Railway deployment $deployment_id in $RAILWAY_ENVIRONMENT..."

for _ in $(seq 1 90); do
  status="$(
    railway deployment list \
      --environment "$RAILWAY_ENVIRONMENT" \
      --service "$RAILWAY_SERVICE" \
      --limit 10 \
      --json |
      node -e '
        let input = "";
        process.stdin.on("data", chunk => input += chunk);
        process.stdin.on("end", () => {
          const deployments = JSON.parse(input);
          const target = deployments.find((deployment) => deployment.id === process.argv[1]);
          process.stdout.write(target?.status ?? "UNKNOWN");
        });
      ' "$deployment_id"
  )"

  echo "Railway deployment status: $status"

  case "$status" in
    SUCCESS)
      exit 0
      ;;
    FAILED|CRASHED|REMOVED)
      exit 1
      ;;
  esac

  sleep 10
done

echo "Timed out waiting for Railway deployment $deployment_id." >&2
exit 1
