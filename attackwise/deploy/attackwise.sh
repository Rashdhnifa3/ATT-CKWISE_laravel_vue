#!/usr/bin/env bash
# ATT&CKWISE release control script. Run it from an extracted release directory on the server.
#
#   ./attackwise.sh init            first install only: create the config file and APP_KEY (once)
#   ./attackwise.sh load            verify SHA256SUMS and `docker load` this release's images
#   ./attackwise.sh up              start / update to this release (keeps config, key and cache)
#   ./attackwise.sh verify [URL]    health check through the public address (default: local port)
#   ./attackwise.sh status | logs | down | version
#
# Rollback = run `./attackwise.sh up` from the previous release directory. Nothing here deletes
# volumes, the config file or browser data; there is no `down -v`.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${ATTACKWISE_CONFIG_FILE:-/opt/attackwise/config/attackwise.env}"
export ATTACKWISE_CONFIG_FILE="$CONFIG_FILE"

die() { echo "attackwise: $*" >&2; exit 1; }
info() { echo "attackwise: $*"; }

# shellcheck disable=SC1091
[ -f "$HERE/release.env" ] || die "release.env not found next to this script (run from the release directory)."
# shellcheck source=/dev/null
. "$HERE/release.env"
export ATTACKWISE_VERSION

conf() { # value of KEY in the config file (last occurrence), without sourcing it
    [ -f "$CONFIG_FILE" ] || return 0
    sed -n "s/^$1=//p" "$CONFIG_FILE" | tail -n 1
}

compose() {
    local files=(-f "$HERE/compose.yaml")
    [ "$(conf ATTACKWISE_TLS)" = "builtin" ] && files+=(-f "$HERE/compose.tls.yaml")
    docker compose --project-directory "$HERE" --env-file "$HERE/release.env" --env-file "$CONFIG_FILE" "${files[@]}" "$@"
}

require_config() {
    [ -f "$CONFIG_FILE" ] || die "config file $CONFIG_FILE missing. First install: ./attackwise.sh init"
    [ -n "$(conf APP_KEY)" ] || die "APP_KEY is empty in $CONFIG_FILE. First install: ./attackwise.sh init"
}

cmd_load() {
    command -v sha256sum > /dev/null || die "sha256sum is required"
    (cd "$HERE" && sha256sum --quiet -c SHA256SUMS) || die "checksum mismatch: the release files are damaged or modified."
    for img in "$HERE"/images/*.tar.gz; do
        info "loading $(basename "$img")"
        gunzip -c "$img" | docker load
    done
    docker image inspect "attackwise-web:$ATTACKWISE_VERSION" "attackwise-api:$ATTACKWISE_VERSION" > /dev/null \
        || die "images attackwise-web/api:$ATTACKWISE_VERSION not present after load"
    info "images ready: attackwise-web:$ATTACKWISE_VERSION attackwise-api:$ATTACKWISE_VERSION"
}

cmd_init() {
    docker image inspect "attackwise-api:$ATTACKWISE_VERSION" > /dev/null 2>&1 || cmd_load
    if [ ! -f "$CONFIG_FILE" ]; then
        install -d -m 0750 "$(dirname "$CONFIG_FILE")"
        install -m 0600 "$HERE/attackwise.env.example" "$CONFIG_FILE"
        info "created $CONFIG_FILE from the template"
    fi
    if [ -n "$(conf APP_KEY)" ]; then
        info "APP_KEY already set in $CONFIG_FILE — left unchanged."
    else
        local key
        key="$(docker run --rm --network none --entrypoint php "attackwise-api:$ATTACKWISE_VERSION" -r 'echo "base64:".base64_encode(random_bytes(32));')"
        [[ "$key" == base64:* ]] || die "could not generate APP_KEY"
        local tmp="$CONFIG_FILE.tmp.$$"
        awk -v k="$key" 'BEGIN{d=0} /^APP_KEY=/{ if(!d){print "APP_KEY=" k; d=1}; next } {print} END{ if(!d) print "APP_KEY=" k }' "$CONFIG_FILE" > "$tmp"
        chmod 0600 "$tmp" && mv "$tmp" "$CONFIG_FILE"
        info "APP_KEY generated once and stored in $CONFIG_FILE (not printed). Back this file up."
    fi
    info "edit $CONFIG_FILE (APP_URL, publishing mode), then run: ./attackwise.sh up"
}

wait_healthy() {
    local i state
    for i in $(seq 1 60); do
        state="$(docker inspect -f '{{.State.Health.Status}}' attackwise-api-1 2>/dev/null || true)/$(docker inspect -f '{{.State.Health.Status}}' attackwise-web-1 2>/dev/null || true)"
        [ "$state" = "healthy/healthy" ] && return 0
        sleep 2
    done
    compose ps >&2
    die "services not healthy after 120 s (state: $state). See ./attackwise.sh logs"
}

cmd_up() {
    require_config
    docker image inspect "attackwise-web:$ATTACKWISE_VERSION" "attackwise-api:$ATTACKWISE_VERSION" > /dev/null 2>&1 || cmd_load
    compose up -d --remove-orphans
    wait_healthy
    info "running release $ATTACKWISE_VERSION"
    cmd_verify
}

# Health check through HTTP exactly as a browser would use the site.
cmd_verify() {
    local base="${1:-}"
    CURL_EXTRA=()
    if [ -z "$base" ]; then
        # Default: the local published port. With built-in TLS the certificate names the public
        # domain, so the local check skips name verification (-k); pass the https URL to check it.
        local bind port
        bind="$(conf ATTACKWISE_HTTP_BIND)"; port="$(conf ATTACKWISE_HTTP_PORT)"
        if [ -z "$bind" ] || [ "$bind" = "0.0.0.0" ]; then bind=127.0.0.1; fi
        base="http://${bind}:${port:-8080}"
        if [ "$(conf ATTACKWISE_TLS)" = "builtin" ]; then
            port="$(conf ATTACKWISE_HTTPS_PORT)"
            base="https://127.0.0.1:${port:-443}"
            CURL_EXTRA=(-k)
        fi
    fi
    base="${base%/}"
    local fails=0 tmp; tmp="$(mktemp -d)"
    # shellcheck disable=SC2317
    check() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; fails=$((fails + 1)); fi; }
    get() { curl -sS --max-time "${3:-30}" "${CURL_EXTRA[@]}" -D "$tmp/$2.h" -o "$tmp/$2.b" -w '%{http_code}' "$base$1" 2>/dev/null || echo 000; }
    hdr() { tr -d '\r' < "$tmp/$1.h" | grep -i "^$2:" | tail -n 1 | cut -d' ' -f2- ; }
    echo "verify $base (release $ATTACKWISE_VERSION)"

    local s; s="$(get / home)"
    check "GET / → 200 Vue app shell" '[ "$s" = 200 ] && grep -q "attackwise-frontend\" content=\"vue" "$tmp/home.b"'
    check "index.html revalidates (Cache-Control: no-cache)" '[ "$(hdr home cache-control)" = "no-cache" ]'
    local js; js="$(grep -o '/assets/index-[A-Za-z0-9_-]*\.js' "$tmp/home.b" | head -n 1)"
    s="$(get "$js" js)"
    check "GET $js → JavaScript, cached immutable" '[ "$s" = 200 ] && hdr js content-type | grep -q javascript && hdr js cache-control | grep -q immutable && ! head -c 200 "$tmp/js.b" | grep -qi "<!doctype"'
    s="$(get /assets/index-00000000.js missing)"
    check "missing asset → 404 (not index.html)" '[ "$s" = 404 ] && ! grep -qi "attackwise-frontend" "$tmp/missing.b"'
    s="$(get /version.json version)"
    check "version.json = $ATTACKWISE_VERSION" '[ "$s" = 200 ] && grep -q "\"version\":\"$ATTACKWISE_VERSION\"" "$tmp/version.b"'
    s="$(get /api/v1/health health)"
    check "GET /api/v1/health → {\"data\":{\"status\":\"ok\"}}" '[ "$s" = 200 ] && grep -q "\"status\":\"ok\"" "$tmp/health.b"'
    s="$(get /api/v1/attack/index index 120)"
    check "GET /api/v1/attack/index → collection index" '[ "$s" = 200 ] && grep -q "\"collections\"" "$tmp/index.b"'
    s="$(get /api/v1/does-not-exist nope)"
    check "unknown API path → 404 JSON error.code=not_found" '[ "$s" = 404 ] && hdr nope content-type | grep -q application/json && grep -q "\"code\":\"not_found\"" "$tmp/nope.b"'
    if [ "${ATTACKWISE_VERIFY_BUNDLE:-1}" = 1 ]; then
        # Newest Enterprise major listed first in the index (same rule as the app).
        local major; major="$(grep -o 'enterprise-attack-[0-9]*\.[0-9]*\.json' "$tmp/index.b" | head -n 1 | sed 's/enterprise-attack-\([0-9]*\)\..*/\1/')"
        s="$(get "/api/v1/attack/bundles/enterprise-attack/$major" bundle 300)"
        check "GET /api/v1/attack/bundles/enterprise-attack/$major → STIX bundle (X-Attack-Version $(hdr bundle x-attack-version))" '[ "$s" = 200 ] && head -c 4096 "$tmp/bundle.b" | grep -q "\"type\": *\"bundle\""'
    fi
    rm -rf "$tmp"
    [ "$fails" = 0 ] && echo "verify: all checks passed" || { echo "verify: $fails check(s) failed" >&2; return 1; }
}

case "${1:-}" in
    init) cmd_init ;;
    load) cmd_load ;;
    up) cmd_up ;;
    verify) shift; cmd_verify "${1:-}" ;;
    status) compose ps ;;
    logs) shift; compose logs --tail=200 "$@" ;;
    down) compose down ;;   # stops and removes containers only; volume and config are kept
    version) echo "$ATTACKWISE_VERSION ($ATTACKWISE_COMMIT)" ;;
    *) sed -n '2,12p' "$0"; exit 2 ;;
esac
