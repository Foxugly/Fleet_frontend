# CLAUDE.md

Fleet_frontend: Angular 21 SPA (standalone components, signals, PrimeNG 21 Aura/emerald, Transloco).
Single-operator dashboard over `Fleet_server`. Fleet-wide rules: `~/.claude/CLAUDE.md`, `OPERATIONS.md`.

## Layout

- `src/app/core/`: `auth` (cookie-mode service with mandatory TOTP, interceptor, guards), `i18n` (HTTP loader, switcher), `layout` (topmenu, footer,
  user-menu, main/public layouts), `theme`, `title` (« {page} — Fleet »), `runtime-config.ts`.
- `src/app/shared/components/`: `auth-card`, `page-header`, `empty-state`.
- `src/app/features/`: `auth` (login, mfa, shared `auth-flow.ts`: error mapping + `safeReturnUrl`), `overview`, `site` (detail + per-source `sections/`), `box`.
- `public/i18n/{fr,en}.json`: catalogs; `i18n-parity.spec.ts` keeps their keys identical.

## Commands (Windows)

- Dev server: `npx ng serve --host 127.0.0.1`, open http://127.0.0.1:4200 (same-site with the API on
  127.0.0.1:8000, else the SameSite=Lax refresh cookie breaks; local two-app run in `README.md`).
- Tests: `npx ng test --watch=false`; build: `npm run build`; API client: `npm run api:gen` from `openapi/fleet-api.yaml`.
- Install: `npm install` (CI uses `npm ci`).

## Conventions

- Copied from the fleet reference app `foo-app`: re-sync chrome, tokens and shared components when
  `STANDARD-frontend-layout.md` changes. Fabric's frontend is not a reference.
- Never store the access token in web storage (memory only); the refresh token is a cookie JS cannot read.
- No hard-coded label or `aria-label`: Transloco keys, formal « vous ». Every new key goes in fr and en.
- API base URL only through `runtimeConfig()` (dev-only fallback, absolute URL required); all API paths start with `/api/v1/`.
- Fleet has no public pages, so no Privacy page or footer link, no register/forgot-password.
