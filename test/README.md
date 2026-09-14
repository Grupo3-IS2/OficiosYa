# Test

Playwright suite covering the SCRUM 9-14 stories. Most cases drive the REST API
directly (`request` fixture); one case loads the React app in Chromium.

# Requirements

- Node.js 22 LTS or newer (CI uses `lts/*`)
- The backend and the database running on http://localhost:8080

The frontend does **not** need to be started by hand: `playwright.config.ts`
declares a `webServer` that runs `npm install && npm run dev` in `../frontend`
and waits for http://localhost:5173. `reuseExistingServer` is on, so an already
running dev server is reused instead.

# Setup

Start the stack from the repository root:

```
docker compose up            # db + Spring Boot API on :8080
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

Both base URLs can be overridden with environment variables:

| Variable            | Default                 | Used for                        |
|---------------------|-------------------------|---------------------------------|
| `API_BASE_URL`      | `http://localhost:8080` | REST calls made by the tests    |
| `FRONTEND_BASE_URL` | `http://localhost:5173` | the browser case                |

```
API_BASE_URL=http://localhost:8081 npm run test:e2e
```