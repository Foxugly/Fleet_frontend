# fleet.foxugly.com: the Fleet dashboard SPA (Angular), static files served by nginx.
#
# Installed by the deploy (.github/workflows/deploy.yml) from root's mirror
# /var/lib/fleet-deploy/Fleet_frontend.git as /etc/nginx/sites-available/fleet.foxugly.com,
# symlinked into sites-enabled, checked by `nginx -t` (rollback to .deploybak
# otherwise). Edit this file in the repo, never on the box.
#
# Shape of Facilitation_frontend's facilitation-frontend.conf, minus Turnstile and
# the WebSocket. TLS uses the shared wildcard lineage `foxugly.com`, never a
# per-subdomain certbot cert (§3.6). The bundle lives in /srv/fleet/Fleet_frontend
# (fleet:www-data, dirs 2750, files 640): nginx reads it through group www-data.
#
# Runtime config comes from SSM /fleet-frontend/prod via the snippet written by
# fleet-app-frontend-runtime-fetch (deploy/fetch-frontend-runtime-from-ssm.sh) and
# is injected into index.html as window.__FLEET__ (read by core/runtime-config.ts).
# The SPA calls fleet-api.foxugly.com cross-origin (CORS allowlisted there).

server {
    listen 80;
    server_name fleet.foxugly.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name fleet.foxugly.com;

    ssl_certificate     /etc/letsencrypt/live/foxugly.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/foxugly.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    root /srv/fleet/Fleet_frontend/dist/fleet-frontend/browser;
    index index.html;

    client_max_body_size 1m;

    # nginx does not merge add_header across levels: a location that sets any
    # header loses these, so every such location below repeats all five
    # (OPERATIONS.md §3.19). The SPA is never framed: X-Frame-Options DENY says
    # what CSP frame-ancestors 'none' says, for browsers that ignore CSP.
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Content-Type-Options    "nosniff" always;
    add_header X-Frame-Options           "DENY" always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy        "geolocation=(), microphone=(), camera=()" always;

    # Empty defaults so nginx -t passes and the page is served before the first
    # SSM fetch (the SPA then refuses to start without an API URL, by design).
    # The runtime-fetch snippet overrides the first four; the deploy writes
    # $fleet_version and $fleet_release, the full SHA used as Sentry release
    # (fleet-frontend-runtime-version.conf). The glob tolerates absent files.
    set $fleet_api_base       "";
    set $fleet_sentry_dsn     "";
    set $fleet_sentry_env     "production";
    set $fleet_csp_report     "";   # "; report-uri <sentry>" written by the fetch script
    set $fleet_version        "";
    set $fleet_release        "";
    include /etc/nginx/snippets/fleet-frontend-runtime*.conf;

    location / {
        try_files $uri /index.html;
    }

    location = /index.html {
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
        add_header X-Content-Type-Options    "nosniff" always;
        add_header X-Frame-Options           "DENY" always;
        add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy        "geolocation=(), microphone=(), camera=()" always;
        add_header Cache-Control             "no-store, no-cache, must-revalidate" always;
        expires 0;

        # Enforced nonce CSP (AOT build: no eval). The two inline scripts (anti-FOUC
        # theme, runtime config) carry $request_id as nonce, reused in the header.
        # style-src 'unsafe-inline': PrimeNG injects <style> elements at runtime.
        # inlineCritical is off in the build, so no CSS onload handler to allow.
        # connect-src: the API and Sentry ingest (errors only, no tracing/replay,
        # hence no worker-src).
        add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' 'nonce-$request_id'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://fleet-api.foxugly.com https://*.ingest.de.sentry.io; form-action 'self'$fleet_csp_report" always;

        gzip on;
        # The Angular build normalises the attribute to data-theme-init="" and
        # sub_filter compares literal strings: the bare form would match nothing.
        # sub_filter_once on: each of the two patterns is replaced once.
        sub_filter '<script data-theme-init="">' '<script nonce="$request_id">';
        sub_filter '</head>' '<script nonce="$request_id">window.__FLEET__={apiBaseUrl:"$fleet_api_base",sentry:{dsn:"$fleet_sentry_dsn",environment:"$fleet_sentry_env",release:"$fleet_release"}};window.__FLEET_VERSION="$fleet_version";</script></head>';
        sub_filter_once on;
    }

    # i18n catalogs are not content-hashed: revalidate on every load.
    location ~* ^/i18n/.+\.json$ {
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
        add_header X-Content-Type-Options    "nosniff" always;
        add_header X-Frame-Options           "DENY" always;
        add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy        "geolocation=(), microphone=(), camera=()" always;
        add_header Cache-Control "no-cache" always;
        etag on;
        try_files $uri =404;
    }

    # Hashed bundles: immutable long cache. No `always` on Cache-Control (and no
    # `expires`): a 404 for a missing chunk must not be cached for a year.
    # brotli_static/gzip_static fall back to the plain file when no .br/.gz exists.
    location ~* \.(?:js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico|webp)$ {
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
        add_header X-Content-Type-Options    "nosniff" always;
        add_header X-Frame-Options           "DENY" always;
        add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy        "geolocation=(), microphone=(), camera=()" always;
        brotli_static on;
        gzip_static on;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
        try_files $uri =404;
    }

    access_log /var/log/nginx/fleet-frontend-access.log;
    error_log  /var/log/nginx/fleet-frontend-error.log;
}
