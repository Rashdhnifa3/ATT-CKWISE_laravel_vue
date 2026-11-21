#!/usr/bin/env bash
# Final verification run (after the last source change). Every step logs to logs/final/<step>.log
# and appends "<step> exit=<code> seconds=<n>" to logs/final/summary.txt. Steps continue on failure.
set -u
EV=<evidence>
WT=<worktree>
L=$EV/logs/final
mkdir -p "$L"
: > "$L/summary.txt"
export ATTACKWISE_CACHE_DIR=$EV/tmp/attack-cache
export npm_config_cache=$EV/cache/npm
export COMPOSER_CACHE_DIR=$EV/cache/composer
export CHROME_BIN=/usr/bin/google-chrome
# Port 8000 is taken by another session's server (not ours); our API runs on 8001.
export ATTACKWISE_API_URL=http://127.0.0.1:8001
export ATTACKWISE_API_PROXY=http://127.0.0.1:8001

step() {
  local name=$1; shift
  local t0=$SECONDS
  ( "$@" ) > "$L/$name.log" 2>&1
  local rc=$?
  echo "$name exit=$rc seconds=$((SECONDS - t0))" | tee -a "$L/summary.txt"
}

{ date -Is; git -C "$WT" rev-parse HEAD; git -C "$WT" status --short; node --version; npm --version; php --version | head -1; npx --no-install --prefix "$WT/attackwise/frontend" playwright --version; } > "$L/env.txt" 2>&1

# Reference (Angular) — same commands as the baseline, from nav-app.
cd "$WT/nav-app"
step ref-build npm run build
step ref-karma npm test -- --watch=false --browsers=ChromeHeadlessCI
step ref-playwright-list npx --no-install playwright test --list
step ref-e2e npm run test:e2e -- --reporter=list

# Vue
cd "$WT/attackwise/frontend"
step vue-typecheck npm run typecheck
step vue-typecheck-tests npm run typecheck:tests
step vue-build npm run build
step vue-unit npx vitest run --reporter=verbose
step vue-reference-specs-drift node scripts/sync-reference-specs.mjs --check
step vue-e2e npx --no-install playwright test --project=vue --reporter=list
step vue-legacy-ui npx --no-install playwright test --project=reference-legacy-ui --reporter=list
step vue-compat npx --no-install playwright test --project=compat --reporter=list

# Laravel
cd "$WT/attackwise/backend"
step laravel-test php artisan test
step laravel-pint vendor/bin/pint --test
echo done >> "$L/summary.txt"
