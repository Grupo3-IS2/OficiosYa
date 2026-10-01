# E2E Tests

Playwright tests for the React frontend and Spring API. The suite is kept in one `tests/` directory
so existing paths and references remain stable; files are grouped below by responsibility. Shared
registration, Mailpit, Google, and map helpers live in `tests/support/`.

## Layout

| Area | Specs | Coverage |
| --- | --- | --- |
| `auth/` | `auth-ui.spec.ts`, `email-change.spec.ts`, `google.spec.ts`, `registration-pin.spec.ts`, `session-logout.spec.ts` | Field validation, registration, email verification/change, login, Google, and session lifecycle. |
| `scrum/` | `oficiosya.spec.ts` | Cross-feature Scrum/API coverage, categories, profiles, filters, and UI regressions. |
| `professional/` | `professional-profile.spec.ts`, `professional-search.spec.ts`, `schedules.spec.ts` | Trades, prices, description limits, discovery, agenda, and reservation privacy. |
| `work-zone/` | `work-zone-edit-profile.spec.ts`, `work-zone-map.spec.ts`, `work-zone-picker.spec.ts` | Public map, geocoding, selection during registration/profile editing, and persisted location. |

`support/registration.ts` completes real email-code registration through Mailpit. `support/ui.ts`
contains reusable stubs for Google Identity, home API responses, and external map services.

## Requirements

- Node.js 22 LTS or newer.
- Docker Compose backend and database at `http://localhost:8080`.
- Mailpit at `http://localhost:8025` for registration and email-change flows.
- Playwright Chromium installed locally.

The Playwright config starts Vite on port 5173 when it is not already running. Google and map
integrations are stubbed in tests; no real Google account or external map service is required.

## Setup

From the repository root, start the API, database, and Mailpit:

```sh
docker compose --profile dev up -d app mailpit
```

Then install the test dependencies and browser once:

```sh
cd test
npm ci
npx playwright install chromium
```

For a full run, set these values in the backend `.env` before starting it. CI applies them in its
Playwright workflow:

| Setting | Value | Purpose |
| --- | --- | --- |
| `RATE_LIMIT_AUTH_PER_MINUTE` | `100000` | Prevents the shared test IP from hitting the default 10-request limit. |
| `VERIFICATION_RESEND_COOLDOWN_SECONDS` | `3` | Allows the resend-after-cooldown case to run; with the default 60 seconds it skips. |

Recreate the backend after changing `.env` so the container receives the new values.

## Run

Run every spec:

```sh
npm run test:e2e:all
```

Run a group:

```sh
npm run test:e2e:auth
npm run test:e2e:scrum
npm run test:e2e:professionals
npm run test:e2e:zones
```

Run one spec or a title match:

```sh
npx playwright test tests/professional/schedules.spec.ts
npx playwright test --grep "SCRUM-18"
```

Open the interactive runner or the last HTML report:

```sh
npm run test:e2e:ui
npm run test:e2e:report
```

## URLs

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_BASE_URL` | `http://localhost:8080` | API used by Playwright's request fixture. |
| `FRONTEND_BASE_URL` | `http://localhost:5173` | Frontend used by browser tests. |
| `MAIL_BASE_URL` | `http://localhost:8025` | Mailpit API used to read verification codes. |
