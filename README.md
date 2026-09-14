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

## Uploaded files

Profile images are stored in the clone's `uploads/` directory, bind-mounted into
the `app` container at `/app/uploads`, and nginx serves them at `/uploads/`.
The directory is gitignored, so the deploy's `git reset --hard` never touches it.
Create it once per clone, writable by the container's user:

```
mkdir uploads && sudo chown 1001:1001 uploads
```

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
