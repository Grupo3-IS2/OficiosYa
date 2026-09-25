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

- `tests/registration-pin.spec.ts`: the flow itself, through the API and through the page (Mailpit and the real backend).
- `tests/email-change.spec.ts`: changing the email from the profile, which works the same way (the code goes to the
  new address). It also checks that another user can't use or burn someone else's code.
- `tests/google.spec.ts`: sign-in with Google. A real Google account can't be driven from a test, so the API cases
  check what needs no Google (validation, "no session", an invalid token) and the page cases replace Google's script
  and the API answers with mocks. They need the frontend started with `VITE_GOOGLE_CLIENT_ID`; `playwright.config.ts` sets it
  when it starts the dev server, and against one started without it those cases skip.
- `tests/work-zone-map.spec.ts`: the map of a professional's zone (OpenStreetMap, drawn with Leaflet). Nominatim, the map's
  tiles and the profile are mocked, so it needs no backend and no internet: it checks what the page asks Nominatim for, how it
  answers (a saved street falls back to the neighbourhood when OpenStreetMap doesn't know it), the mouse wheel zoom, and
  that the map carries only the credit that OpenStreetMap's licence asks for.
- `tests/work-zone-picker.spec.ts`: choosing the zone on the map when registering as a professional: the suggestions that
  appear while typing (from Photon: after a pause, from three letters, one search per pause and not per key, nothing that
  is not a zone), picking one, tapping the map, zoom with the buttons and the wheel, street-level names, the precision of
  the address asked for according to the zoom, and what is sent when the account is registered. Also fully mocked.
- `tests/work-zone-edit-profile.spec.ts`: the same picker in "Editar perfil": it opens on the saved zone, choosing another
  fills the field, and saving sends it. Also fully mocked. The map publishes its zoom level in `data-zoom`, which these
  specs read to check the zoom. `blockExternalMaps` (in `support/ui.ts`) answers Nominatim, Photon and the tiles with empty
  responses in every spec that doesn't test the map, so none of them reaches the internet.
- The other specs replace Google's script with an inert one (`blockGoogleIdentity`) and the map's tiles with a blank one
  (`blockExternalMaps`), so the suite never reaches accounts.google.com nor OpenStreetMap.
