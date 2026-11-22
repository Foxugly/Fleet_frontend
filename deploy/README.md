# Fleet_frontend: deployment (fleet.foxugly.com)

Angular SPA served as static files by nginx at `fleet.foxugly.com`. It calls the API at
`fleet-api.foxugly.com` cross-origin (no WebSocket, no Turnstile). Fleet-wide rules:
`~/.claude/CLAUDE.md`, `OPERATIONS.md` §3.10/3.11/3.22. Backend side and box bootstrap
(user `fleet`, `/srv/fleet`, IAM, SSM): `Fleet_server/deploy/README.md`.

| What | Where | Owner / mode |
|---|---|---|
| Docroot | `/srv/fleet/Fleet_frontend/dist/fleet-frontend/browser` | `fleet:www-data`, dirs `2750`, files `640` |
| Bundle generations | `/srv/fleet/Fleet_frontend/dist/.bundle-{current,prev}` (+ `.release`) | same, outside the docroot |
| Root's mirror | `/var/lib/fleet-deploy/Fleet_frontend.git` | `root:root 700` |
| Runtime fetch | `/usr/local/sbin/fleet-app-frontend-runtime-fetch.sh` + `fleet-app-frontend-runtime-fetch.service` | `root:root` |
| Vhost | `/etc/nginx/sites-available/fleet.foxugly.com` (symlinked in `sites-enabled`) | `root:root 0644` |
| Runtime snippets | `/etc/nginx/snippets/fleet-frontend-runtime.conf` (SSM), `…-runtime-version.conf` (deploy) | `root:root 0644` |

`fleet` is not in `www-data`; nginx reads the bundle through the group, set by root at the
end of every deploy. Unit prefix `fleet-app-`: `fleet-` is reserved for box-wide units.

## How a deploy runs

Push to `main` → `deploy.yml` calls `ci.yml` (tests + build) → the `deploy` job
(`environment: production`, OIDC role `fleet-frontend-deploy`):

1. **Head guard**: a run whose SHA is no longer the head of `main` stops green; an unreadable
   answer from GitHub fails red.
2. `npm ci && npm run build`; the built `index.html` must contain `<script data-theme-init="">`
   and `</head>` (the strings the vhost's `sub_filter` matches); `tar` of
   `dist/fleet-frontend/browser` → `s3://foxugly-deploy/builds/fleet-frontend/<sha>.tar.gz`.
3. SSM `AWS-RunShellScript` (root, dash, `set -eu` first), the list in the workflow:
   - fetch the SHA into root's bare mirror; install the runtime-fetch script and unit **from the
     mirror only** (never from `/srv/fleet`);
   - root downloads the bundle into a private `mktemp -d`; **`fleet`** extracts it from stdin into
     `dist/.bundle-new`, then runs `deploy/publish-bundle.sh` (read from the mirror into a root-owned
     0644 temp file): rotation to `.bundle-current`/`.bundle-prev` only when the SHA changes
     (`.release` in each generation, so a retry keeps the previous one); current files except
     `index.html` (no delete), then the previous generation's missing files, then `index.html`
     last via `index.html.new` + `mv`, then a prune of what is in neither generation. No request
     sees an `index.html` referencing a missing file, and a tab opened before the deploy keeps its
     lazy chunks for one more deploy;
   - permissions as root: owner root and no "other" bits first (fleet locked out), `chgrp -R -h
     www-data`, dirs `2750`, files `640`, owner back to `fleet`;
   - vhost from the mirror with a `.deploybak` copy, rolled back if `nginx -t` fails; version
     snippet `set $fleet_version "<short sha> (<date>)"`;
   - restart `fleet-app-frontend-runtime-fetch`, then an explicit
     `nginx -t && systemctl reload nginx` (the fetch skips its reload when the snippet is unchanged).
4. Public check (3 tries, `--max-time 10`): `https://fleet.foxugly.com/` answers 200 with
   `window.__FLEET__={apiBaseUrl:"https://…`, the theme script nonced (no `data-theme-init` left)
   and `window.__FLEET_VERSION="<short sha> (`.

## Runtime config (SSM `/fleet-frontend/prod`, all String, public)

| Name | Example | Rule |
|---|---|---|
| `API_BASE_URL` | `https://fleet-api.foxugly.com` | required, an `https://` origin |
| `SENTRY_DSN` | `https://<key>@o….ingest.de.sentry.io/<id>` | optional (empty = Sentry off); project `fleet-frontend` |
| `SENTRY_ENV` | `production` | optional |

The fetch script refuses any value containing `"`, `\`, `'`, `$`, `;`, `<`, `>` or a control
character (newline included): each value lands in an nginx `set "…"` and in a JS string inside
`<script>`. A refused value writes nothing and fails the unit, so the deploy goes red. With a
DSN, it also writes `$fleet_csp_report` (`; report-uri https://<host>/api/<id>/security/?sentry_key=<key>`)
so CSP violations reach Sentry. The Sentry `release` is not an SSM value: the deploy writes the
full SHA (`$fleet_release`) in `fleet-frontend-runtime-version.conf`.

To change a value: edit SSM, then `sudo systemctl restart fleet-app-frontend-runtime-fetch`
(it reloads nginx itself when the snippet changed).

## First deploy on an empty box

The deploy creates `/srv/fleet` and `/srv/fleet/Fleet_frontend` itself, but **user `fleet` must
exist** (created by the Fleet_server bootstrap) and the SSM parameters above must be set, or the
runtime fetch fails and the run is red. Nothing else is needed on the box (no node, no clone).
GitHub environment `production` secrets: `AWS_DEPLOY_ROLE_ARN`, `EC2_INSTANCE_ID`.

## Checks on the box

```bash
sudo find /srv/fleet/Fleet_frontend ! -type l \( -perm /022 -o -perm /004 \)   # empty
sudo find /srv/fleet/Fleet_frontend -type d ! -perm 2750                       # empty
stat -c '%U:%G %a' /srv/fleet/Fleet_frontend                                   # fleet:www-data 2750
systemctl show fleet-app-frontend-runtime-fetch -p NoNewPrivileges -p ProtectSystem -p PrivateTmp
curl -s https://fleet.foxugly.com/ | grep -o 'window.__FLEET_VERSION="[^"]*"'
```
