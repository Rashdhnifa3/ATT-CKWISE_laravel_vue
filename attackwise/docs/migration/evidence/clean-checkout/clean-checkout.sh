#!/usr/bin/env bash
# Verifies RUNNING.md from a clean clone of the branch (lockfiles only, no files copied from the
# worktree). Logs to logs/clean-checkout/<step>.log and summary.txt. Uses the evidence caches.
set -u
EV=<evidence>
SRC=<original>           # repository that holds the branch (read-only use: git clone)
DEST=$EV/tmp/clean-checkout-$(date +%s)
L=$EV/logs/clean-checkout
mkdir -p "$L"; : > "$L/summary.txt"
export npm_config_cache=$EV/cache/npm COMPOSER_CACHE_DIR=$EV/cache/composer
export ATTACKWISE_CACHE_DIR=$EV/tmp/attack-cache
step() { local n=$1; shift; local t0=$SECONDS; ( "$@" ) > "$L/$n.log" 2>&1; echo "$n exit=$? seconds=$((SECONDS - t0))" | tee -a "$L/summary.txt"; }

step clone git clone --quiet --no-local --branch attackwise-vue-migration "$SRC" "$DEST"
echo "commit $(git -C "$DEST" rev-parse HEAD) dest=$DEST" >> "$L/summary.txt"
cd "$DEST/attackwise/backend"
step backend-composer-install composer install --no-interaction --no-progress
step backend-env cp .env.example .env
step backend-key php artisan key:generate --no-interaction
step backend-test php artisan test
step backend-pint vendor/bin/pint --test
# Differential unit tests import reference modules from nav-app/src, which need nav-app's own dependencies.
cd "$DEST/nav-app"
step nav-app-npm-ci npm ci --no-audit --no-fund
cd "$DEST/attackwise/frontend"
step frontend-npm-ci npm ci --no-audit --no-fund
step frontend-typecheck npm run typecheck
step frontend-typecheck-tests npm run typecheck:tests
step frontend-build npm run build
step frontend-unit npx vitest run
step frontend-spec-drift node scripts/sync-reference-specs.mjs --check
# Vue browser specs against this clean build on a separate port (webServer disabled by ATTACKWISE_VUE_URL).
( ATTACKWISE_API_PROXY=http://127.0.0.1:8001 npx vite preview --host 127.0.0.1 --port 4291 --strictPort > "$L/frontend-preview.log" 2>&1 & echo $! > "$L/preview.pid" )
for i in $(seq 1 60); do curl -sf http://127.0.0.1:4291/ > /dev/null && break; sleep 0.5; done
step frontend-e2e env ATTACKWISE_VUE_URL=http://127.0.0.1:4291 npx --no-install playwright test --project=vue --reporter=list
kill "$(cat "$L/preview.pid")" 2>/dev/null
echo done >> "$L/summary.txt"
