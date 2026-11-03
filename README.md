# OficiosYa
Digital platform that connects customers with tradespeople and home-service professionals (locksmithing, gardening, air conditioning, plumbing, etc.), letting them filter by area, price, rating and availability, with an urgent request option for immediate attention.

# Requirements

- Docker + Docker Compose

Only needed to run the backend outside Docker:
- Java 25
- Maven

# Running locally

```
cp .env.example .env                                  # set DB_PASSWORD
mkdir -p uploads && sudo chown 1001:1001 uploads      # the app container (uid 1001) writes profile images here
docker compose --profile dev up --build
```

- Frontend (Vite + hot reload): http://localhost:5173 (proxies /api, /ws and /uploads to the backend)
- PostgreSQL and the Spring Boot API start too; without `--profile dev` only those two run.
- Mailpit, a fake inbox where the emails the app sends land (registration verification codes): http://localhost:8025. Nothing reaches a real address.

# API docs

The backend exposes an OpenAPI spec via springdoc:

- Swagger UI: http://localhost:8080/swagger-ui.html
- OpenAPI JSON: http://localhost:8080/v3/api-docs

The app always runs on PostgreSQL (the `db` service). In production the deploy
lives entirely in a clone under `~/storage/oficios-ya/<release|dev>`: the
`frontend-build` service compiles `frontend/dist`, the host's nginx serves that
directory and proxies /api and /ws to the `app` container. Nothing runs npm
outside Docker. See `nginx/` and `.github/workflows/deploy.yml`.

To build the frontend by hand (what the deploy does):

```
docker compose run --rm frontend-build
```

## Email

The app sends emails (verification codes) through SMTP. In local development the
`mailpit` service (`--profile dev`) catches them, and the app container points at
it by default. Anywhere else, set the `SMTP_*` and `MAIL_FROM` variables in `.env`
to a real provider, or nothing will be delivered.

## Uploaded files

Profile images are stored in the clone's `uploads/` directory, bind-mounted into
the `app` container at `/app/uploads`, and nginx serves them at `/uploads/`.
Create it once per clone, writable by the container's user:

```
mkdir uploads && sudo chown 1001:1001 uploads
```

## Payments (Mercado Pago)

With `MP_ACCESS_TOKEN` empty, payments are off and jobs complete without being paid.
To try them locally:

1. In Mercado Pago's *Tus integraciones → Cuentas de prueba*, create a test seller and
   a test buyer. Logged in as the seller, copy the app's production access token
   (`APP_USR-...`) into `MP_ACCESS_TOKEN` and the *Webhooks → Clave secreta* into
   `MP_WEBHOOK_SECRET`.
2. Mercado Pago confirms payments through a webhook, which can't reach `localhost`.
   Open a Cloudflare quick tunnel to the backend (no account needed):

   ```
   docker run --rm --network host cloudflare/cloudflared tunnel --url http://localhost:8080
   ```

   It prints an `https://<random>.trycloudflare.com` address, a new one every run.
3. Set `MP_NOTIFICATION_URL=https://<random>.trycloudflare.com/api/v1/payments/webhook`
   in `.env` and restart the backend: `docker compose up -d app`.
4. Pay as the test buyer. Without the tunnel the payment goes through, but the job
   never turns *retained*.

Notes:
- Locally the site isn't https, so Mercado Pago doesn't redirect back by itself:
  click *Volver al sitio*.
- Mercado Pago's API refuses refunds for test sellers ("Unauthorized use of live
  credentials"). Refund the payment from the seller's Mercado Pago account first,
  then cancel the job in the app.
- Split payments (OAuth): with `MP_CLIENT_ID` and `MP_CLIENT_SECRET` set (same app,
  *Credenciales de producción*), professionals must link their Mercado Pago account by
  logging in to it before accepting jobs. Clients then pay straight into that account and
  Mercado Pago sends OficiosYa's commission (`PAYMENT_COMMISSION_PERCENT`) to the
  `MP_ACCESS_TOKEN` account as `marketplace_fee`; there is nothing left to transfer by hand.
  Add `https://<host>/api/v1/payments/mercado-pago/callback` as the app's *URL de
  redireccionamiento*; locally the host is the Cloudflare tunnel's, set as
  `MP_OAUTH_REDIRECT_URL`. `MP_NOTIFICATION_URL` is required: each payment's notification
  carries `?job=` to know whose account to read it from.
- Testing split payments: test users' apps have no Client ID/Secret, so the app is your
  real account's, with `MP_OAUTH_TEST_TOKENS=true` (linking returns `TEST-` tokens and
  checkouts open on the sandbox) and its *test* access token as `MP_ACCESS_TOKEN`. The
  professional links with a seller test user, and a buyer test user pays. Cancelling a paid job refunds it from the
  professional's account, so it needs the money still there.

# Coding standards

These are the conventions the codebase follows. New code is expected to match
them; when you touch old code that does not, fix it in the same commit.

## Language

Code is written in **English**: class and variable names, comments, log
messages, commit messages and branch names.

Everything the user reads is in **Spanish**, and that includes the messages
exchanged between the backend and the frontend: API error and success messages
(the `error`, `details` and `message` fields of the responses) must be written
in Spanish, because the frontend shows them to the user as they arrive.

## Formatting

- 4 spaces, no tabs. UTF-8. LF line endings.

## Git

- Work branches off `dev`; `main` only receives releases.
- Branch names: `feat/<short-description>`, `fix/<short-description>`.
- Merge into `dev`/`main` through a pull request, reviewed by someone else.
