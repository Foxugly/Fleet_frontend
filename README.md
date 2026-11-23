# Fleet_frontend

Angular 21 SPA of `fleet.foxugly.com`: a single-operator dashboard over the Foxugly fleet.
UI library: Optimus UI (`@openng/optimus-ui`, the MIT fork of PrimeNG 21; PrimeNG >= 22 is banned in the fleet).
It talks to `Fleet_server` (`/api/v1/`), with a login (username + password + TOTP). Scaffolded from the
fleet reference app (`foxugly-ops/frontend-reference/foo-app`).

## Run locally (with Fleet_server)

The SPA needs the API. Run both apps on **127.0.0.1**: the refresh cookie is `SameSite=Lax`, so the SPA
and the API must be same-site. `localhost:4200` against `127.0.0.1:8000` is cross-site and breaks the
refresh (every reload signs you out).

1. API, in `Fleet_server` (env loaded into the shell first, see its README):

   ```bash
   # .env: STATE=DEV, AUTH_REFRESH_COOKIE_SECURE=false (plain http locally)
   python manage.py migrate
   python manage.py create_operator <user>    # then enrol TOTP at the first sign-in
   python manage.py seed_demo                 # DEV only: fake snapshots for every site
   python manage.py runserver 127.0.0.1:8000
   ```

2. SPA, here:

   ```bash
   npm install
   npx ng serve --host 127.0.0.1    # then open http://127.0.0.1:4200 (not localhost)
   ```

## Test and build

```bash
npx ng test --watch=false   # Vitest
npm run build               # production build (CI gate)
```

## API client

`src/app/api/` is generated from the vendored `openapi/fleet-api.yaml` (generator 7.21.0, `openapitools.json`).
After an API change in Fleet_server: copy its `openapi-schema.yaml` over `openapi/fleet-api.yaml`, then
run `npm run api:gen` and commit both.

## Environment

The API base URL comes from `window.__FLEET__.apiBaseUrl` (injected at deploy time; it must be an
absolute `http(s)://` URL). Only a dev build falls back to `http://127.0.0.1:8000`; a production build
without it fails at startup with a clear error. `window.__FLEET_VERSION` overrides the footer version.

## Languages

French (default) and English, catalogs in `public/i18n/<lang>.json`; a spec keeps their keys identical.

## Auth

Username + password, then a mandatory TOTP code (enrolment with a QR code at the first sign-in). The
access token lives in memory only (never web storage); the refresh token is an HttpOnly cookie that JS
cannot read, sent only to the auth endpoints (`X-Auth-Mode: cookie`). A reload restores the session
through that cookie; logout blacklists it on the server.
