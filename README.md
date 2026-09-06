# OficiosYa
Digital platform that connects customers with tradespeople and home-service professionals (locksmithing, gardening, air conditioning, plumbing, etc.), letting them filter by area, price, rating and availability, with an urgent request option for immediate attention.

# Requirements

- Docker + Docker Compose

Only needed to run the backend outside Docker:
- Java 25
- Maven

# Running locally

```
cp .env.example .env                       # set DB_PASSWORD
docker compose --profile dev up --build
```

- Frontend (Vite + hot reload): http://localhost:5173 (proxies /api and /ws to the backend)
- PostgreSQL and the Spring Boot API start too; without `--profile dev` only those two run.

The app always runs on PostgreSQL (the `db` service). In production the host's
nginx serves the React build and proxies /api and /ws to the `app` container;
see `nginx/` and `.github/workflows/deploy.yml`.

# Coding standards

These are the conventions the codebase follows. New code is expected to match
them; when you touch old code that does not, fix it in the same commit.

## Language

Everything inside the repository is written in **English**: class and variable
names, comments, log messages, API error messages, commit messages and branch
names. Only user-facing product copy may be in Spanish.

## Formatting

- 4 spaces, no tabs. UTF-8. LF line endings.

## Git

- Work branches off `dev`; `main` only receives releases.
- Branch names: `feat/<short-description>`, `fix/<short-description>`.
- Merge into `dev`/`main` through a pull request, reviewed by someone else.
