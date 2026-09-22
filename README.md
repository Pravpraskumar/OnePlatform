# Designer Platform

Designer Platform is an enterprise, multi-tenant SaaS monorepo. It provides a shared administration plane, organisation and user management, concurrent-seat licensing, and independently deployable product services. CreditGuard is the first implemented product; PRIME currently exposes a placeholder service.

For a visual overview of the technology stack, service boundaries, data ownership, security, deployment, and key workflows, see [Architecture Guide](docs/ARCHITECTURE.md). For a model-oriented description of routes, state, APIs, data ownership, and business rules, see [Application Logic](docs/APPLICATION_LOGIC.md). For the interactive identity, organisation, role, product, project, and session access model, open the [User Access Guide](docs/USER_ACCESS_GUIDE.html).

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

2. Create the single root environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

   The frontend, all services, and database scripts read their application settings from this root `.env`. The optional `infra/.env` described below remains separate because it is consumed by Docker Compose.

3. Replace the example secrets. In particular, set a strong `LOCAL_JWT_SECRET` and a base64-encoded 32-byte `CONNECTION_SECRET_KEY`.

4. Start PostgreSQL:

   ```bash
   docker compose -f infra/docker-compose.yml up -d
   ```

   The PostgreSQL container creates `platform_core`, `creditguard`, and `prime`. To also start the local SQL Server connection target for PRIME, create untracked `infra/.env` from `infra/.env.example`, set a new strong `MSSQL_SA_PASSWORD`, and enable its Compose profile:

   ```bash
   docker compose -f infra/docker-compose.yml --profile mssql up -d
   ```

   Compose creates the SQL Server `prime` database after the container is healthy. Starting Compose without the profile remains PostgreSQL-only.

   Connect to the running SQL Server without placing its password in command history:

   ```powershell
   docker exec -it mssql_server /bin/bash -lc '/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C'
   ```

   The 2022 image uses `/opt/mssql-tools18/bin/sqlcmd`; the older `/opt/mssql-tools/bin/sqlcmd` path is not used by this configuration.

5. Generate/apply the required Drizzle migrations, then seed the core database:

   ```bash
   npm run db:generate:all
   npm run db:setup
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

Optional OIDC login is configured in the root `.env` with `OIDC_WELL_KNOWN`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `OIDC_PROVIDER_LABEL`. Register `http://localhost:4000/api/auth/oidc/callback` with the provider for local development. `OIDC_SKIP_VERIFY=true` is development-only and skips ID-token signature checks; it is ignored when `NODE_ENV=production`.

The selected organisation is persisted in `localStorage`. Core data is scoped by organisation membership, while product data is isolated in each product database. Product access also opens a licensed session; a heartbeat keeps the concurrent-seat lease active.

## Common commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start all services and the frontend |
| `npm run dev:frontend` | Start only Vite |
| `npm run dev:core` | Start only the core API |
| `VITE_HOST=0.0.0.0` | Bind frontend development and production preview to all interfaces for IP/LAN access |
| `VITE_CORE_API_URL=http://<server-ip>:4000` | Configure the frontend core API proxy target |
| `VITE_CREDITGUARD_API_URL=http://<server-ip>:4101` | Configure the frontend CreditGuard proxy target |
| `VITE_API_BASE=http://<server-ip>:4000/api` | Use the absolute core API URL when serving the production frontend directly |
| `VITE_CREDITGUARD_API_BASE=http://<server-ip>:4101/api` | Use the absolute CreditGuard API URL when serving the production frontend directly |

When opening the frontend with an IP address, add the matching origin to `CORS_ORIGIN` in the backend `.env` files, for example `http://192.168.1.25:5173`. Rebuild the frontend after changing `VITE_API_BASE` or `VITE_CREDITGUARD_API_BASE`, because Vite embeds these values into the static bundle.
| `npm run start:prod` | Start the built core API, CreditGuard, PRIME, and frontend in production mode |
| `npm run start:prod:core` | Start only the built core API in production mode |
| `npm run start:prod:creditguard` | Start only the built CreditGuard API in production mode |
| `npm run start:prod:prime` | Start only the built PRIME API in production mode |
| `npm run start:prod:frontend` | Serve the built frontend with Vite preview |
| `npm run build` | Build/type-check all workspaces through Turborepo with dependency ordering and caching |
| `npm run lint` | Lint workspaces that define a lint script through Turborepo |
| `npm run db:core:migrate` | Apply core database migrations |
| `npm run db:core:seed` | Converge core data to McDermott IT, assign all modules and users, and seed roles, menus, and settings |
| `npm run db:generate:all` | Generate Drizzle migrations for every database workspace |
| `npm run db:migrate:all` | Apply pending migrations to core, CreditGuard, and PRIME databases |
| `npm run db:setup` | Apply all migrations and seed the core database |
| `npm run db:reset` | Destructively reset all three database schemas, migrate, and seed; requires `DB_RESET_CONFIRM=YES` |
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

## CreditGuard document storage

CreditGuard request attachments support PDF and DOCX files. Development defaults to local storage under `apps/creditguard-service/src/documents`; generated content in that directory is ignored by Git. Set `DOCUMENT_STORAGE_PROVIDER=azure` in production to use a private Azure Blob container. Azure authentication prefers the hosting identity through `DefaultAzureCredential`; grant that identity Blob Data Contributor access to the configured container. `AZURE_STORAGE_CONNECTION_STRING` is available for controlled environments but must be supplied through an approved secret store and never committed.

Applying the attachment migration creates `request_attachments`. Do not enable attachment uploads until the migration has been reviewed and applied in the target environment. Product-service authentication must also be hardened before the CreditGuard API is directly exposed.

CreditGuard review submission uses the enabled global SMTP configuration maintained under Global Administration settings. Core owns outbound delivery and `email_delivery_logs`; CreditGuard owns the reviewer snapshot and request status transition. Apply both core and CreditGuard migrations before enabling review submission. SMTP delivery failures leave the request Under Review and are visible to Global Administrators under Email Delivery Logs.

The Edit Request Attachments block provides **Attach Request** while attachments remain editable. It saves current Draft values, creates a new McDermott-branded Parent Company Guarantee PDF from persisted request details, and stores it through the configured private document provider as `<request number> latest.pdf`. Repeating the action replaces the previous latest PDF. The document excludes approver and approval details, and generation is independent of **Review done**.

