# Designer Platform

Designer Platform is an enterprise, multi-tenant SaaS monorepo. It provides a shared administration plane, organisation and user management, concurrent-seat licensing, and independently deployable product services. Capture-Pro is the active frontend product; the CreditGuard backend and local data remain in the repository without frontend screens. PRIME currently exposes a placeholder service.

Authenticated users can open the in-application Help Center from any screen. The Help action opens documentation for the current platform or Capture-Pro workflow, while `/app/help` provides searchable access to available topics. CreditGuard frontend screens are retired; its local backend service and data remain untouched.

For a visual overview of the technology stack, service boundaries, data ownership, security, deployment, and key workflows, see [Architecture Guide](docs/ARCHITECTURE.md). For a model-oriented description of routes, state, APIs, data ownership, and business rules, see [Application Logic](docs/APPLICATION_LOGIC.md). For the interactive identity, organisation, role, product, project, and session access model, open the [User Access Guide](docs/USER_ACCESS_GUIDE.html).

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/frontend` | React 18 + Vite single-page application |
| `apps/core-backend` | NestJS control plane for identity, organisations, roles, projects, settings, products, and sessions |
| `apps/creditguard-service` | Retained legacy source and local data; excluded from active npm workspaces |
| `apps/capture-pro-service` | NestJS Capture-Pro commercial-intelligence API and database |
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

   The PostgreSQL container creates `platform_core`, `creditguard`, `prime`, and `capturepro`. Existing PostgreSQL volumes do not rerun initialization scripts; provision `capturepro` separately or recreate only a disposable local volume. To also start the local SQL Server connection target for PRIME, create untracked `infra/.env` from `infra/.env.example`, set a new strong `MSSQL_SA_PASSWORD`, and enable its Compose profile:

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
   npm run db:capturepro:create
   npm run db:generate:all
   npm run db:setup
   ```

   `db:capturepro:create` is idempotent and is needed when an existing PostgreSQL volume predates the Capture-Pro initialization script. It uses `CAPTUREPRO_DATABASE_URL` and does not reset existing databases.

6. Start the admin frontend, Core API, and Capture-Pro API:

   ```bash
   npm run dev:capturepro
   ```

| Application | Default URL |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Core API | `http://localhost:4000/api` |
| PRIME API | `http://localhost:4102/api` |
| Capture-Pro API | `http://localhost:4103/api` |
| PostgreSQL | `localhost:5432` |

The seed defaults to `admin@global.local` / `ChangeMe123!`. Change that password outside local development.

## Authentication and tenancy

The SPA supports Azure AD B2C and local email/password authentication. Local sessions use a JWT in `localStorage`; B2C sessions use MSAL. API requests prefer the local token, then fall back to an MSAL token.

Optional OIDC login is configured in the root `.env` with `OIDC_WELL_KNOWN`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `OIDC_PROVIDER_LABEL`. Register `http://localhost:4000/api/auth/oidc/callback` with the provider for local development. `OIDC_SKIP_VERIFY=true` is development-only and skips ID-token signature checks; it is ignored when `NODE_ENV=production`.

New OIDC users are provisioned as active Members of McDermott IT with the `General User` role. This basic role does not grant access to products or modules; a product-scoped role must be assigned separately.

The selected organisation is persisted in `localStorage`. Core data is scoped by organisation membership, while product data is isolated in each product database. Product access also opens a licensed session; a heartbeat keeps the concurrent-seat lease active.

## Common commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the frontend, Core API, and Capture-Pro API (same as `dev:capturepro`) |
| `npm run dev:capturepro` | Start the frontend, Core API, and Capture-Pro API |
| `npm run dev:frontend` | Start only Vite |
| `npm run dev:core` | Start only the core API |
| `npm run dev:service:capturepro` | Start only the Capture-Pro API |
| `VITE_HOST=0.0.0.0` | Bind frontend development and production preview to all interfaces for IP/LAN access |
| `VITE_CORE_API_URL=http://<server-ip>:4000` | Configure the frontend core API proxy target |
| `VITE_CAPTUREPRO_API_URL=http://<server-ip>:4103` | Configure the frontend Capture-Pro proxy target |
| `VITE_API_BASE=http://<server-ip>:4000/api` | Use the absolute core API URL when serving the production frontend directly |
| `VITE_CAPTUREPRO_API_BASE=http://<server-ip>:4103/api` | Use the absolute Capture-Pro API URL when serving the production frontend directly |

When opening the frontend with an IP address, add the matching origin to `CORS_ORIGIN` in the backend `.env` files, for example `http://192.168.1.25:5173`. Rebuild the frontend after changing a `VITE_*_API_BASE` value, because Vite embeds these values into the static bundle.
| `npm run start:prod` | Start the built Core API, Capture-Pro API, and frontend in production mode |
| `npm run start:prod:core` | Start only the built core API in production mode |
| `npm run start:prod:prime` | Start only the built PRIME API in production mode |
| `npm run start:prod:capturepro` | Start only the built Capture-Pro API in production mode |
| `npm run start:prod:frontend` | Serve the built frontend with Vite preview |
| `npm run build` | Build/type-check all workspaces through Turborepo with dependency ordering and caching |
| `npm run lint` | Lint workspaces that define a lint script through Turborepo |
| `npm run db:core:migrate` | Apply core database migrations |
| `npm run db:core:seed` | Converge core data to McDermott IT, assign all modules and users, and seed roles, menus, and settings |
| `npm run db:capturepro:create` | Idempotently create the configured local Capture-Pro PostgreSQL database |
| `npm run db:generate:all` | Generate Drizzle migrations for active database workspaces |
| `npm run db:migrate:all` | Apply pending migrations to active workspaces; the retained CreditGuard database is untouched |
| `npm run db:setup` | Apply all migrations and seed the core database |
| `npm run db:reset` | Destructively reset the three active workspace databases, migrate, and seed; requires `DB_RESET_CONFIRM=YES` |
| `npm run test:e2e` | Run all mocked Playwright flows |
| `npm run test:e2e:ui` | Open Playwright UI mode |

## Capture-Pro integrations

Open **Capture-Pro > Integrations** to configure Salesforce OAuth 2.0 Client Credentials (Access Token URL, Client ID, Client Secret) and Spinergie (API Key only). Access requires the Capture-Pro Module Administrator role or existing Global Administrator / organisation Owner/Admin authority, with an active Capture-Pro assignment.

Core stores credentials encrypted using the existing `CONNECTION_SECRET_KEY`; saved secrets are never returned to the browser. For an existing local installation, register the role/menu without rerunning the broad core seed:

```powershell
npm.cmd run db:core:seed:capturepro-integrations
```

This idempotent command accepts only a local loopback PostgreSQL connection and rejects production mode. It registers the Integrations menu and the **Capture-Pro > Salesforce** submenu with **Opportunities**, **Accounts**, **Competitors**, **Bid Budget Data**, **Fabrication Yard**, **Vessel Data**, and **Sync & Health** (deactivating the former separate menu) with their role grants; it does not change users, organisation memberships, product assignments, licences, or credentials. Global Administrators and organisation Owners/Admins do not need the new module role. Assign it explicitly only to other users who should configure integrations. Refresh the browser after registration and select an organisation with an active Capture-Pro assignment. If the menu is missing, its direct route is `/app/product/Capture-Pro/integrations`; backend permission checks still apply.

The full core seed remains available for reviewed initial setup but has broader organisation-convergence effects. Saving settings does not contact either provider.

### Salesforce opportunity sync

Current Capture-Pro navigation keeps **Opportunity Workspace** separate from the read-only **Salesforce** data submenu. **Sync & Health** is the final direct Capture-Pro item, immediately below **Integrations**, at `/app/product/Capture-Pro/salesforce-sync`; it is no longer inside Salesforce. Existing viewer roles can inspect health and logs, while sync actions retain their existing administrator restrictions. After the menu/grant change receives its required security review, apply the local-only registration command above and refresh navigation. See [workspace and navigation behavior](docs/APPLICATION_LOGIC.md#personal-opportunity-workspace-and-pre-itt).

**Capture-Pro > Salesforce > Sync & Health** lets integration administrators run **Sync opportunities now**, which imports Salesforce opportunities using the market-analyst Power Query rules into the Capture-Pro database (`capturepro`): the subsea record-type/business-line filter, stage replacements, `TBA` sub-category, and Floater/Subsea classification. A separate **Sync accounts now** imports all Salesforce Accounts (Id, Name, Type, Company Short Name; up to 50,000) for **Capture-Pro > Salesforce > Accounts**, and **Sync competitors now** imports all Project Competitor Details for **Capture-Pro > Salesforce > Competitors**, which shows linked opportunity numbers and account names where those records are synced. **Sync bid budgets now** imports all Opportunity Bid Budget records for **Capture-Pro > Salesforce > Bid Budget Data**, linked to synced opportunities where available. **Sync fabrication yards now** describes the Salesforce `Fabrication_Yard__c` object and imports every queryable field for **Capture-Pro > Salesforce > Fabrication Yard**, and **Sync vessels now** does the same for `Vessel__c` on **Capture-Pro > Salesforce > Vessel Data**. Every Salesforce screen shows a **Data source: Salesforce** badge with the Salesforce object name. The same screen shows per-type connection health derived from recorded sync runs, the last run of each type, and a log of the latest 50 runs with a Type column. Apply the additive Capture-Pro migrations `0002_salesforce_accounts.sql`, `0003_salesforce_competitors.sql`, `0004_salesforce_bid_budgets.sql`, `0005_salesforce_fabrication_yards.sql`, and `0006_salesforce_vessels.sql` with `npm.cmd run db:migrate --workspace @platform/capture-pro-service` before the first account, competitor, bid budget, fabrication yard, or vessel sync. Managers and Analysts can view it read-only. Existing Capture-Pro opportunities are never created or changed. Capture-Pro Managers, Analysts, and administrators can review the results on **Capture-Pro > Salesforce > Opportunities**, which replaces the former Opportunities screen; manual opportunity creation is no longer offered in the UI. The screen shows key columns by default, has a column chooser for all 50 synced fields, provides a filter for each visible column, and opens a details panel with every field when a row is selected. The table fills the available page height, so its horizontal scrollbar and pagination remain visible. Records that later leave the extract are retained and labelled.

Before the first sync:

1. Add a long random `CAPTUREPRO_INTERNAL_API_KEY` to the root `.env`. Core and Capture-Pro both read it.
2. Save the Salesforce **My Domain** token URL, such as `https://<domain>.my.salesforce.com/services/oauth2/token`. Salesforce does not support Client Credentials through `login.salesforce.com`.
3. Apply the additive Capture-Pro migration and restart core and Capture-Pro:

   ```powershell
   npm.cmd run db:migrate --workspace @platform/capture-pro-service
   ```

Core requires outbound HTTPS access to Salesforce. See [Application Logic](docs/APPLICATION_LOGIC.md#salesforce-opportunity-sync) for the flow, stored data, security controls, deployment, and rollback.

Run the integration tests after building core and Capture-Pro:

```powershell
npm.cmd run build --workspace @platform/core-backend
npm.cmd run build --workspace @platform/capture-pro-service
node --test apps\core-backend\test\capture-pro-integrations.spec.cjs apps\core-backend\test\capture-pro-integration-menu.spec.cjs apps\capture-pro-service\test\salesforce-opportunities.spec.cjs
npx.cmd playwright test 'capture-pro-integrations\.spec\.ts' 'capture-pro-salesforce-opportunities\.spec\.ts' 'capture-pro-salesforce-sync\.spec\.ts' 'capture-pro-salesforce-accounts\.spec\.ts' 'capture-pro-salesforce-competitors\.spec\.ts' 'capture-pro-salesforce-bid-budgets\.spec\.ts' 'capture-pro-salesforce-fabrication-yards\.spec\.ts' 'capture-pro-salesforce-vessels\.spec\.ts'
```

These tests use mocked PostgreSQL queries, mocked Salesforce and core responses, and ephemeral test keys. They do not load the root environment file or contact Salesforce.

## Spinergie vessel specifications

Activated locally on 2026-10-24: **Capture-Pro > Spinergie > Vessel Specifications** uses the saved integration API key server-side to retrieve the fixed Spinergie `/base/api/vessel/specs` endpoint. It stores organisation-scoped vessel specifications and run history separately from Salesforce, with a read-only browser and an independent panel in **Sync & Health**. The key never goes to the browser or product database. The first successful local sync imported 2,240 vessels; the browser displayed 100 rows per page across 23 pages without alerts.

The additive Capture-Pro migration `0007_eminent_toro.sql` and local-only menu registration were applied after the user confirmed required activation reviews and release checks. No automated tests were run by the agent; tests remain paused at the user's request. Other environments still require their own approved release process. On this Windows host, core's Node runtime requires its approved system CA trust (`--use-system-ca`) for Spinergie's certificate chain. Keep that flag on future core starts; do not disable TLS verification. The initial certificate-related failed run remains in the audit history. See [Spinergie application logic](docs/APPLICATION_LOGIC.md#spinergie-vessel-specifications-active-locally) for deployment ordering, menu registration, and non-destructive rollback.

## Spinergie vessel charters

**Capture-Pro > Spinergie > Vessel Charters** is active locally at `/app/product/Capture-Pro/spinergie-charters`, with read-only search/filter/column controls, record details and pagination. It uses the same saved integration key server-side for the fixed `/base/api/vessel/charters` endpoint, but has separate charter storage and Sync & Health history. Migration `0008_cloudy_thunderbird.sql` and the new read-only menu grants were applied after explicit approval.

The first sync received 4,375 source rows and stored 4,354 unique snapshots (21 identical source rows deduplicated). Because the provider supplies no charter ID, source snapshots use a canonical JSON hash rather than collapsing rows by vessel ID. Rates, currencies and numeric date/duration fields retain provider values without inferred units or financial calculations. Backend builds and frontend type-check passed; test suites remain paused and were not run. See [charter data, activation and rollback](docs/APPLICATION_LOGIC.md#spinergie-vessel-charters-active-locally). TLS verification stays enabled.

## Foundry agent chat

The existing **Capture-Pro > Agent Workspace** route (`/app/product/Capture-Pro/agents`) now contains Chat and Agent overview views. Chat has per-user/per-organisation conversation history, plain-text responses, provider source labels, and optional explicit opportunity/vessel/charter context. It is server-backed, not a simulated chatbot. Capture-Pro owns chat storage; core owns the Azure credential and Classic Foundry connection. Existing plan-agent jobs remain queued and are not executed by chat.

Local storage migration `0009_far_may_parker.sql` is applied after approved Level 3 scope. The project endpoint and agent name are configured only in untracked local `.env`; `.env.example` contains disabled placeholders. **Live Foundry responses are not verified or enabled:** Azure CLI was not installed at inspection time. Install it through the approved machine setup, run `az login` directly, and ensure the signed-in identity has approved project access. Run the metadata-only `Inspect approved Foundry agent metadata` task to resolve the supplied name to an existing Classic `asst_` identifier and review its tools. No API key or access token should be pasted into chat or browser settings. A new-style named Foundry agent requires its appropriate API adapter rather than assuming Classic compatibility.

For deployment use an approved managed identity via `FOUNDRY_IDENTITY=managed-identity`; do not use the developer's CLI identity in production. Keep TLS verification enabled and configure trusted certificates. The local application session also expired during browser verification and requires normal sign-in. Backend builds and frontend type-check passed; authored security tests were not run because tests remain paused. Runtime npm audit reported 1 critical, 6 high and 9 moderate findings, including moderate Azure Identity/MSAL/UUID findings; no automatic fixes were applied. See [Foundry boundaries, status and rollback](docs/APPLICATION_LOGIC.md#foundry-agent-workspace-chat).

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
   `-- /capturepro-api/* --> Capture-Pro Service --------> capturepro

PRIME Service -----------------------------------------> prime
```

Vite proxies `/api` to port 4000 and rewrites `/capturepro-api` to Capture-Pro on port 4103. The retained CreditGuard API is not proxied by the frontend. The core API owns identities, permissions, tenant configuration, and license sessions. Product services own product-specific records.

## Security notes

- Never commit `.env` files, JWT secrets, connection keys, or database passwords.
- Product database passwords are encrypted by the core service before storage.
- Product services currently do not independently validate bearer tokens; they trust the calling tier and supplied organisation identifier. Treat this as a deployment boundary and harden it before exposing product services directly.
- Menu access mode is used by the UI but is not a substitute for server-side authorization.

