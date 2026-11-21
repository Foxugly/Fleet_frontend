# Fleet_frontend

Angular 21 SPA of `fleet.foxugly.com`: a single-operator dashboard over the Foxugly fleet.
It talks to `Fleet_server` (`/api/v1/`), with a login (username + password + TOTP). Scaffolded from the
fleet reference app (`foxugly-ops/frontend-reference/foo-app`).

## Run

```bash
npm install
npm start            # http://localhost:4200, API on http://127.0.0.1:8000
```

## Test and build

```bash
npx ng test --watch=false   # Vitest
npm run build               # production build (CI gate)
```

## API client

`npm run api:gen` (generated client from `Fleet_server/openapi-schema.yaml`, generator 7.21.0) is added
with the API client task; it does not exist yet.

## Environment

The API base URL comes from `window.__FLEET__.apiBaseUrl` (injected at deploy time), falling back to
`http://127.0.0.1:8000`. `window.__FLEET_VERSION` overrides the footer version.

## Languages

French (default) and English, catalogs in `public/i18n/<lang>.json`; a spec keeps their keys identical.

## Auth note

Until the real auth task lands, login is a mock (any credentials work, in memory only).
