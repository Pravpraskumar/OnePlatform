# Designer Platform

Designer Platform is an enterprise, multi-tenant SaaS monorepo. It provides a shared administration plane, organisation and user management, concurrent-seat licensing, and independently deployable product services. CreditGuard is the first implemented product; PRIME currently exposes a placeholder service.

For a model-oriented description of routes, state, APIs, data ownership, and business rules, see [Application Logic](docs/APPLICATION_LOGIC.md).

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/frontend` | React 18 + Vite single-page application |
| `apps/core-backend` | NestJS control plane for identity, organisations, roles, projects, settings, products, and sessions |
| `apps/creditguard-service` | NestJS CreditGuard domain API and database |
| `apps/prime-service` | NestJS PRIME placeholder service and database |
| `packages/shared` | Types shared by the frontend and services |
| `infra` | Local PostgreSQL Docker Compose setup and Azure Bicep infrastructure |
| `tests/e2e` | Playwright browser tests with deterministic API mocks |

## Prerequisites

- Node.js 20 or newer
- npm
- Docker Desktop (for local databases)

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy each example environment file:

   ```powershell
   Copy-Item apps\core-backend\.env.example apps\core-backend\.env
   Copy-Item apps\creditguard-service\.env.example apps\creditguard-service\.env
   Copy-Item apps\prime-service\.env.example apps\prime-service\.env
   Copy-Item apps\frontend\.env.example apps\frontend\.env
   ```

3. Replace the example secrets. In particular, set a strong `LOCAL_JWT_SECRET` and a base64-encoded 32-byte `CONNECTION_SECRET_KEY`.

4. Start PostgreSQL:

   ```bash
   docker compose -f infra/docker-compose.yml up -d
   ```

   The container creates `platform_core`, `creditguard`, and `prime`.

5. Generate/apply the required Drizzle migrations, then seed the core database:

   ```bash
   npm run db:generate --workspace @platform/core-backend
   npm run db:migrate --workspace @platform/core-backend
   npm run db:generate --workspace @platform/creditguard-service
   npm run db:migrate --workspace @platform/creditguard-service
   npm run db:generate --workspace @platform/prime-service
   npm run db:migrate --workspace @platform/prime-service
   npm run db:core:seed
   ```

6. Start all applications:

   ```bash
   npm run dev
   ```

| Application | Default URL |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Core API | `http://localhost:4000/api` |
| CreditGuard API | `http://localhost:4101/api` |
| PRIME API | `http://localhost:4102/api` |
| PostgreSQL | `localhost:5432` |

The seed defaults to `admin@global.local` / `ChangeMe123!`. Change that password outside local development.

## Authentication and tenancy

The SPA supports Azure AD B2C and local email/password authentication. Local sessions use a JWT in `localStorage`; B2C sessions use MSAL. API requests prefer the local token, then fall back to an MSAL token.

The selected organisation is persisted in `localStorage`. Core data is scoped by organisation membership, while product data is isolated in each product database. Product access also opens a licensed session; a heartbeat keeps the concurrent-seat lease active.

## Common commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start all services and the frontend |
| `npm run dev:frontend` | Start only Vite |
| `npm run dev:core` | Start only the core API |
| `npm run build` | Build/type-check all workspaces |
| `npm run lint` | Lint workspaces that define a lint script |
| `npm run db:core:migrate` | Apply core database migrations |
| `npm run db:core:seed` | Seed roles, admin, global organisation, products, menus, and settings |
| `npm run test:e2e` | Run all mocked Playwright flows |
| `npm run test:e2e:ui` | Open Playwright UI mode |

## End-to-end tests

Install the browser once:

```bash
npx playwright install chromium
```

Then run:

```bash
npm run test:e2e
```

The Playwright configuration starts the frontend automatically. Tests mock REST calls in the browser, so normal E2E runs do not require PostgreSQL, Azure AD B2C, or any backend service. This keeps authentication, navigation, CRUD, licensing, and error-flow checks repeatable. To debug:

```bash
npx playwright test --headed
npx playwright test --debug
```

Failure artifacts are written to `test-results/`; the HTML report is written to `playwright-report/`.

## Architecture summary

```text
Browser (React/Vite)
  |-- /api/* ------------> Core Backend (NestJS) ------> platform_core
  `-- /creditguard-api/* -> CreditGuard Service -------> creditguard

PRIME Service -----------------------------------------> prime
```

Vite proxies `/api` to port 4000 and rewrites `/creditguard-api` to the CreditGuard service on port 4101. The core API owns identities, permissions, tenant configuration, and license sessions. Product services own product-specific records.

## Security notes

- Never commit `.env` files, JWT secrets, connection keys, or database passwords.
- Product database passwords are encrypted by the core service before storage.
- Product services currently do not independently validate bearer tokens; they trust the calling tier and supplied organisation identifier. Treat this as a deployment boundary and harden it before exposing product services directly.
- Menu access mode is used by the UI but is not a substitute for server-side authorization.

