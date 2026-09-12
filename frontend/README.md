# OficiosYa frontend

React + TypeScript + Vite frontend for OficiosYa.

## Local development

Start PostgreSQL and the Spring Boot API from the repository root:

```bash
docker compose up db app
```

Then start Vite from this directory:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` and `/ws` to the backend at
`http://localhost:8080`.

## Available scripts

```bash
npm run dev      # Start the Vite development server
npm run build    # Type-check and create a production build
npm run lint     # Run Oxlint
npm run preview  # Preview the production build locally
```

## Project structure

- `src/components/`: reusable UI components and their styles.
- `src/pages/`: page-level views and page-specific styles.
- `src/services/`: HTTP clients and backend integrations.
- `src/types/`: shared TypeScript domain and API types.
- `src/assets/`: static assets imported by the application.

## Code conventions

- Keep implementation names and comments in English.
- Keep user-facing product copy in Spanish, including the messages exchanged
  with the backend: API errors and notices are shown to the user as they arrive.
- Use four spaces for indentation and UTF-8 with LF line endings.
- Keep backend requests inside `src/services/` rather than calling `fetch`
  directly from page components.
