#!/bin/sh
# =============================================================================
# Fleet frontend: publish dist/.bundle-new into the docroot, run as `fleet`.
#
#   sudo -u fleet sh publish-bundle.sh /srv/fleet/Fleet_frontend/dist <sha>
#
# Root reads this file from its mirror (never from the app tree) into a root-owned
# 0644 temp file; fleet runs it. Root never writes into the fleet-owned tree.
#
# The docroot serves the current generation UNION the previous one, so a tab
# opened before the deploy still finds its lazy chunks, and no request ever sees
# an index.html that references a file not there yet:
#   1. rotate .bundle-new -> .bundle-current -> .bundle-prev, only when the SHA
#      changes (a retry of the same SHA keeps both generations);
#   2. copy the current generation, index.html excepted, no delete: the new
#      hashed chunks appear next to the old ones;
#   3. add the previous generation's files that are missing;
#   4. index.html last, atomically (copy to index.html.new, then rename);
#   5. delete what is in neither generation (two deploys old, leftovers).
# Each generation dir carries .release (its SHA), never published.
# A generation holding a symlink is refused before any change.
# =============================================================================
set -eu
umask 027

DIST=${1:?usage: publish-bundle.sh <dist dir> <sha>}
SHA=${2:?usage: publish-bundle.sh <dist dir> <sha>}
case "$SHA" in
    *[!0-9a-f]*) echo "ERROR: bad sha '$SHA'" >&2; exit 2 ;;
esac
if [ "${#SHA}" -ne 40 ]; then
    echo "ERROR: bad sha '$SHA'" >&2; exit 2
fi

cd "$DIST"
DIST=$(pwd -P)
DOC=fleet-frontend/browser

# A built bundle holds no symlink. nginx (www-data, which reads every other
# site's /run/<app>/.env) must never be handed one: refuse, before any change.
# The vhost also sets disable_symlinks on.
no_symlinks() {
    for g do
        [ -d "$g" ] || continue
        links=$(find "$g" -type l | head -n 5)
        if [ -n "$links" ]; then
            echo "ERROR: symlink in $g, refusing to publish: $links" >&2; exit 1
        fi
    done
}
no_symlinks .bundle-new .bundle-current .bundle-prev

# --- 1. rotation (idempotent) ------------------------------------------------
if [ -d .bundle-current ]; then
    if [ "$(cat .bundle-current/.release 2>/dev/null || true)" = "$SHA" ]; then
        echo "[publish] $SHA is already current: no rotation"
        rm -rf .bundle-new
    else
        if [ ! -s .bundle-new/index.html ]; then
            echo "ERROR: .bundle-new/index.html missing or empty" >&2; exit 1
        fi
        rm -rf .bundle-prev
        mv .bundle-current .bundle-prev
    fi
fi
# A crash between the two mv leaves no .bundle-current: the retry only moves
# .bundle-new in and keeps .bundle-prev.
if [ -d .bundle-new ]; then
    if [ ! -s .bundle-new/index.html ]; then
        echo "ERROR: .bundle-new/index.html missing or empty" >&2; exit 1
    fi
    printf '%s\n' "$SHA" > .bundle-new/.release
    mv .bundle-new .bundle-current
fi
if [ ! -s .bundle-current/index.html ]; then
    echo "ERROR: no current bundle to publish" >&2; exit 1
fi

# --- 2-4. publish, index.html last -------------------------------------------
mkdir -p "$DOC"
# --checksum: a non-hashed file (i18n/*.json) changed at the same size and mtime
# would pass rsync's quick check and keep its old content.
rsync -rlt --checksum --exclude=/index.html --exclude=/.release .bundle-current/ "$DOC/"
if [ -d .bundle-prev ]; then
    rsync -rlt --ignore-existing --exclude=/index.html --exclude=/.release .bundle-prev/ "$DOC/"
fi
cp .bundle-current/index.html "$DOC/index.html.new"
mv -f "$DOC/index.html.new" "$DOC/index.html"

# --- 5. prune: keep only files of the current or the previous generation -----
cd "$DOC"
find . ! -type d -exec sh -c '
    d=$1; shift
    for f do
        case "$f" in ./.release) rm -f "$f"; continue ;; esac
        if [ -e "$d/.bundle-current/$f" ] || [ -e "$d/.bundle-prev/$f" ]; then continue; fi
        rm -f "$f"
    done' sh "$DIST" {} +
# One dir at a time (\;), depth first: a parent emptied by its child's rmdir
# is seen empty when find reaches it.
find . -mindepth 1 -depth -type d -empty -exec sh -c '
    d=$1; shift
    for f do
        if [ ! -d "$d/.bundle-current/$f" ] && [ ! -d "$d/.bundle-prev/$f" ]; then rmdir "$f"; fi
    done' sh "$DIST" {} \;

echo "[publish] $SHA published ($(cat "$DIST/.bundle-prev/.release" 2>/dev/null || echo none) kept as previous)"
