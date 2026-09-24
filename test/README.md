# Test

Playwright suite covering the SCRUM 9-14 stories. Most cases drive the REST API
directly (`request` fixture); one case loads the React app in Chromium.

# Requirements

- Node.js 22 LTS or newer (CI uses `lts/*`)
- The backend and the database running on http://localhost:8080
- Mailpit running on http://localhost:8025: registration emails a code, and the tests read it
  from this fake inbox (`docker compose --profile dev up mailpit`)

The frontend does **not** need to be started by hand: `playwright.config.ts`
declares a `webServer` that runs `npm install && npm run dev` in `../frontend`
and waits for http://localhost:5173. `reuseExistingServer` is on, so an already
running dev server is reused instead.

# Setup

Start the stack from the repository root:

```
docker compose --profile dev up app mailpit   # db + Spring Boot API on :8080 + the fake inbox on :8025
```

Then, in this directory:

```
npm ci
npx playwright install chromium
```

`npx playwright install` only has to be run once per machine (and again after a
Playwright version bump).

```
docker run --rm --network host -v "$PWD":/work -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble npx playwright test
```

# Running

```
npm run test:e2e:ui          # interactive UI mode, for debugging
npm run test:e2e:report      # open the HTML report of the last run
```

A single file, or a single case by title:

```
npx playwright test tests/oficiosya.spec.ts
npx playwright test -g "SCRUM-10"
```

# Configuration

The base URLs can be overridden with environment variables:

| Variable            | Default                 | Used for                        |
|---------------------|-------------------------|---------------------------------|
| `API_BASE_URL`      | `http://localhost:8080` | REST calls made by the tests    |
| `FRONTEND_BASE_URL` | `http://localhost:5173` | the browser cases               |
| `MAIL_BASE_URL`     | `http://localhost:8025` | Mailpit, where the codes are read |

```
API_BASE_URL=http://localhost:8081 npm run test:e2e
```

# Registration with an emailed code, and the backend settings the suite needs

Registering creates nothing until the code that is mailed is verified, so every case that needs an
account goes through the whole flow (`tests/support/registration.ts`: start, read the code from
Mailpit, verify). Two backend settings matter, set in the `.env` at the repository root before
starting the backend (CI does it in `.github/workflows/playwright.yml`):

| Setting                                | Why                                                                              |
|----------------------------------------|----------------------------------------------------------------------------------|
| `RATE_LIMIT_AUTH_PER_MINUTE=100000`    | The suite registers dozens of accounts from one IP; the default (10 a minute) would answer 429 to most of it. |
| `VERIFICATION_RESEND_COOLDOWN_SECONDS=3` | The cases that resend a code wait out the cooldown. With the default (60 s) they skip, saying why. |

- `tests/registro-pin.spec.ts`: the flow itself, through the API and through the page (Mailpit and the real backend).
- `tests/google.spec.ts`: sign-in with Google. A real Google account can't be driven from a test, so the API cases
  check what needs no Google (validation, "no session", an invalid token) and the page cases replace Google's script
  and the API answers with mocks. They need the frontend started with `VITE_GOOGLE_CLIENT_ID`; `playwright.config.ts` sets it
  when it starts the dev server, and against one started without it those cases skip.
- The other specs replace Google's script with an inert one (`blockGoogleIdentity`), so the suite never reaches accounts.google.com.
