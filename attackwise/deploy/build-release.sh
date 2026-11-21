#!/usr/bin/env bash
# Builds an ATT&CKWISE release package from a COMMITTED revision (default HEAD):
#   attackwise/deploy/build-release.sh [--out DIR] [--rev REV]
# The Docker build context is a `git archive` export of attackwise/ at that revision, so local
# node_modules, vendor, dist, .env files or uncommitted edits can never enter the images.
# Output (outside Git): DIR/attackwise-<version>-linux-amd64/ and its .tar.gz + .sha256.
set -euo pipefail

OUT="${HOME}/attackwise-releases"
REV=HEAD
while [ $# -gt 0 ]; do
    case "$1" in
        --out) OUT="$2"; shift 2 ;;
        --rev) REV="$2"; shift 2 ;;
        *) echo "usage: $0 [--out DIR] [--rev REV]" >&2; exit 2 ;;
    esac
done

REPO="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
COMMIT="$(git -C "$REPO" rev-parse --verify "$REV^{commit}")"
SHORT="$(git -C "$REPO" rev-parse --short=7 "$COMMIT")"
VERSION="${ATTACKWISE_VERSION:-$(git -C "$REPO" show -s --format=%cd --date=format:%Y.%m.%d "$COMMIT")-$SHORT}"
PLATFORM=linux/amd64
NAME="attackwise-$VERSION-linux-amd64"
PKG="$OUT/$NAME"

if [ "$REV" = HEAD ] && [ -n "$(git -C "$REPO" status --porcelain -- attackwise)" ]; then
    echo "note: uncommitted changes under attackwise/ are NOT part of this build (building $COMMIT)." >&2
fi
[ -e "$PKG" ] && { echo "$PKG already exists; remove it or set ATTACKWISE_VERSION." >&2; exit 1; }
command -v docker > /dev/null || { echo "docker is required" >&2; exit 1; }

CTX="$(mktemp -d)"
trap 'rm -rf "$CTX"' EXIT
git -C "$REPO" archive --format=tar "$COMMIT" attackwise | tar -x -C "$CTX"
B="$CTX/attackwise"

build() { # name dockerfile
    docker build --pull=false --platform "$PLATFORM" -f "$B/deploy/docker/$2" \
        --build-arg ATTACKWISE_VERSION="$VERSION" --build-arg ATTACKWISE_REVISION="$COMMIT" \
        -t "$1:$VERSION" "$B"
}
echo "== building attackwise-web:$VERSION and attackwise-api:$VERSION from $COMMIT"
build attackwise-web web.Dockerfile
build attackwise-api api.Dockerfile

mkdir -p "$PKG/images" "$PKG/nginx" "$PKG/proxy"
echo "== saving images"
docker save "attackwise-web:$VERSION" | gzip -n -6 > "$PKG/images/attackwise-web-$VERSION-linux-amd64.tar.gz"
docker save "attackwise-api:$VERSION" | gzip -n -6 > "$PKG/images/attackwise-api-$VERSION-linux-amd64.tar.gz"

D="$B/deploy"
install -m 0755 "$D/attackwise.sh" "$PKG/attackwise.sh"
install -m 0644 "$D/compose.yaml" "$D/compose.tls.yaml" "$D/attackwise.env.example" "$D/DEPLOYMENT.md" "$PKG/"
install -m 0644 "$D/nginx/tls.conf" "$PKG/nginx/"
install -m 0644 "$D/proxy/"*.example "$PKG/proxy/"
install -m 0644 "$B/LICENSE.txt" "$B/NOTICE.txt" "$PKG/"
printf 'ATTACKWISE_VERSION=%s\nATTACKWISE_COMMIT=%s\n' "$VERSION" "$COMMIT" > "$PKG/release.env"

base_digest() { grep -o 'FROM [^ ]*' "$D/docker/$1" | cut -d' ' -f2 | sort -u | sed 's/^/    /'; }
{
    echo "ATT&CKWISE release $VERSION"
    echo "commit:    $COMMIT"
    echo "built:     $(date -u +%Y-%m-%dT%H:%M:%SZ) on $(uname -m), docker $(docker version --format '{{.Server.Version}}')"
    echo "platform:  $PLATFORM (images run only on x86_64 / amd64 servers)"
    echo
    for i in web api; do
        echo "image attackwise-$i:$VERSION"
        echo "  id:   $(docker image inspect -f '{{.Id}}' "attackwise-$i:$VERSION")"
        echo "  arch: $(docker image inspect -f '{{.Os}}/{{.Architecture}}' "attackwise-$i:$VERSION")"
        echo "  size: $(docker image inspect -f '{{.Size}}' "attackwise-$i:$VERSION") bytes (uncompressed)"
        echo "  base images (tag@digest):"
        base_digest "$i.Dockerfile"
    done
    echo
    echo "runtime: nginx $(docker run --rm --entrypoint nginx "attackwise-web:$VERSION" -v 2>&1 | sed 's/.*nginx\///'),"\
         "PHP $(docker run --rm --network none --entrypoint php "attackwise-api:$VERSION" -r 'echo PHP_VERSION;'),"\
         "Laravel $(docker run --rm --network none --entrypoint php "attackwise-api:$VERSION" -r 'require "vendor/autoload.php"; echo Composer\InstalledVersions::getPrettyVersion("laravel/framework");')"
    echo
    echo "files:"
    (cd "$PKG" && find . -type f ! -name MANIFEST.txt ! -name SHA256SUMS | sort | sed 's/^\.\//  /')
} > "$PKG/MANIFEST.txt"
(cd "$PKG" && find . -type f ! -name SHA256SUMS | sort | sed 's/^\.\///' | xargs sha256sum > SHA256SUMS)

# No secrets or development files in the package or the images.
echo "== scanning package for secrets"
if grep -rIlE 'APP_KEY=base64:|BEGIN [A-Z ]*PRIVATE KEY' "$PKG" --exclude-dir=images; then echo "secret-like content found" >&2; exit 1; fi
# Development files that must not exist in the runtime images.
for i in web api; do
    found="$(docker run --rm --network none --user 0 --entrypoint sh "attackwise-$i:$VERSION" -c '
        find / -xdev \( -name ".env" -o -name ".env.*" -o -name "*.map" -o -name node_modules -o -name package-lock.json \
                       -o -name "*.key" -o -name "phpunit.xml" \) 2>/dev/null | grep -v "^/proc/"
        for f in /usr/local/bin/composer /usr/local/bin/node /usr/bin/node /var/www/html/tests /var/www/html/.env; do [ -e "$f" ] && echo "$f"; done
        true')"
    if [ -n "$found" ]; then echo "unexpected files in attackwise-$i:" >&2; echo "$found" >&2; exit 1; fi
done

tar -C "$OUT" -czf "$OUT/$NAME.tar.gz" "$NAME"
(cd "$OUT" && sha256sum "$NAME.tar.gz" > "$NAME.tar.gz.sha256")
echo "== release ready"
echo "  $OUT/$NAME.tar.gz"
cat "$OUT/$NAME.tar.gz.sha256"
