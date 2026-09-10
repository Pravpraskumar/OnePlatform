# Application Logic Reference

This document is the canonical compact context for engineers and AI models working on Designer Platform. It describes implemented behavior, ownership boundaries, request flows, and important invariants. Read the source before changing behavior when this document and code differ.

## 1. System purpose

Designer Platform is a multi-tenant control plane plus product modules:

- **Core platform:** users, authentication, organisations, memberships, teams, projects, roles, menus, product assignment, settings, and concurrent sessions.
- **CreditGuard:** financial-security requests, business entities, reports, and a process guide.
- **PRIME:** service/database scaffolding only.
- **Frontend:** one SPA for public, workspace, product, organisation, and global-administration experiences.

Each product has its own service and database. The core database stores assignment and connection metadata but not CreditGuard request data.

## 2. Runtime topology

| Runtime | Port | Prefix | Database |
| --- | ---: | --- | --- |
| Frontend | 5173 | `/` | none |
| Core backend | 4000 | `/api` | `platform_core` |
| CreditGuard | 4101 | `/api` | `creditguard` |
| PRIME | 4102 | `/api` | `prime` |

The frontend calls relative paths. Vite forwards `/api/*` to core and rewrites `/creditguard-api/*` to CreditGuard `/api/*`.

All Nest applications enable CORS. Core uses a global validation pipe with property whitelisting and DTO transformation. Core routes are protected by global authentication and role guards unless marked public.

## 3. Frontend provider and state model

The provider order is significant:

```text
QueryClientProvider
  ApiProvider
    SessionProvider
      ThemeProvider
        OrgProvider
          RouterProvider
```

- `ApiProvider` creates the authenticated core API client.
- `SessionProvider` owns local user state and JWT expiry.
- `ThemeProvider` loads site banner and personal theme after authentication.
- `OrgProvider` persists the full selected organisation object under `selectedOrgId`.
- `RequireAuth` permits either a local token or an authenticated MSAL account.

Local storage keys:

| Key | Meaning |
| --- | --- |
| `platformAuthToken` | Local JWT |
| `platformAuthUser` | Serialized authenticated user |
| `selectedOrgId` | Serialized selected organisation (legacy name; value is an object) |
| `rememberedEmail` | Optional sign-in form convenience |

## 4. Authentication lifecycle

### Local registration/login

1. `/signup` posts `{ displayName, email, password }` to `/api/auth/register`, or `/signin` posts `{ email, password }` to `/api/auth/login`.
2. Core validates credentials and returns `{ accessToken, user }`.
3. The SPA stores both values and navigates to `/app/dashboard`.
4. `SessionProvider` decodes the JWT `exp` claim and schedules session-expiry notification.
5. Logout or account deletion clears the local token and user.

The signup password minimum is eight characters. Duplicate registration maps HTTP 409 to a specific message. Sign-in failures use a generic invalid-credentials message.

### Azure AD B2C

Microsoft sign-in uses MSAL redirect. For API requests, the client first checks the local JWT, then calls `acquireTokenSilent`, and finally `acquireTokenPopup`. Core validates B2C tokens using issuer/JWKS configuration and performs just-in-time provisioning. If a user with the same email already exists, first B2C login links the B2C object identifier to that record.

### API failure behavior

An authenticated core request receiving HTTP 401 emits a session-expired event once. Other authenticated failures emit a generic system error notification and throw `API <status>: <body>` to the caller.

## 5. Authorisation and navigation

Core role names seeded by default:

- `Global Administrator`
- `Organisation Administrator`
- `General User`

Global role assignments have no organisation ID. Organisation authority is also represented by membership: `Owner`, `Admin`, or `Member`.

The sidebar is data-driven from `GET /api/menus/mine?orgId=...`. Menu trees contain route, icon, display order, product link, and optional `readonly`/`editable` access. The frontend hides organisation-administration routes from ordinary members and global-only routes outside the global organisation. Backend guards remain the security boundary; hiding navigation is not authorization.

## 6. Route inventory

### Public

| Route | Behavior |
| --- | --- |
| `/` | Marketing landing page |
| `/about` | Product/platform overview |
| `/signin` | Local or B2C sign-in |
| `/signup` | Local or B2C registration |

### Workspace and product

| Route | Behavior |
| --- | --- |
| `/app` | Redirects to dashboard |
| `/app/dashboard` | Selected organisation summary |
| `/app/products` | Products assigned to selected organisation |
| `/app/product/:code` | Product lookup, project selection, license acquisition, product landing |
| `/app/product/CreditGuard/requests` | Request list, filtering, sorting, configurable columns, Notes-only inline editing, request-number links to full editing, and delete |
| `/app/product/CreditGuard/requests/new` | Initial company guarantee form; saves a server-controlled Draft without approval fields |
| `/app/product/CreditGuard/requests/:requestId/edit` | Loads and updates the complete saved request, including requesting-division and approval fields |
| `/app/product/CreditGuard/reports` | Request counts and portfolio aggregates |
| `/app/product/CreditGuard/application-setup/business-entities` | Permission-aware business entity CRUD |
| `/app/resources` | Shared resources |
| `/account/settings` | Profile, password, account deletion |

### Organisation administration

| Route | Behavior |
| --- | --- |
| `/org/settings` | Selected organisation details |
| `/org/teams` | Team CRUD, membership, module-to-team assignment |
| `/org/members` | Member CRUD, membership/status, project assignment |
| `/org/projects` | Allocate licensed product seats to projects |
| `/org/admin` | Organisation administration landing |

### Global administration

| Route | Behavior |
| --- | --- |
| `/admin/users` | Identity records, search/filter, bulk status, edit |
| `/admin/user-assignments` | Status and global/org role assignments |
| `/admin/user-settings` | Preferences, effective access, activity |
| `/admin/organisations` | Organisation CRUD and status |
| `/admin/connections` | Encrypted product database connection settings |
| `/admin/licenses` | Organisation-product license assignment |
| `/admin/settings` | Default org, session timeout, branding/banner |
| `/admin/roles` | Role CRUD and menu access modes |
| `/admin/sessions` | Active session monitoring |
| `/admin/projects` | Global project CRUD |

Unknown routes redirect to `/`.

## 7. Organisation and product context

The selected organisation drives menus, products, administration leases, and all tenant-scoped calls. Products are loaded with `GET /api/products?orgId=<id>`.

Before a product opens:

1. Resolve the product by case-insensitive code.
2. Load `/organisations/:orgId/modules/:productId/projects`.
3. If project context is required, wait for a valid project.
4. Persist project changes to `.../last-project`.
5. Open a session with `{ orgId, productId, projectId? }`.
6. Send a heartbeat every 30 seconds.
7. Release the session after the last component lease unmounts.

Non-product authenticated pages similarly share one administration session per organisation. A short deferred release prevents React route transitions from unnecessarily closing/reopening a lease.

Concurrent session creation is transactional. Core locks the organisation-module allocation, counts active sessions, rejects exhausted capacity, and inserts the new session. Idle sessions are closed by the scheduled reaper. The UI maps seat-limit and unlicensed errors to product-specific messages.

## 8. Core API domains

| Domain | Base path | Responsibilities |
| --- | --- | --- |
| Auth/account | `/auth`, `/account` | login, registration, current user, profile, password, deletion, theme |
| Users | `/users` | users, status, roles, settings, effective access |
| Organisations | `/organisations` | tenants, membership, teams, modules, project allocations |
| Products | `/products` | catalog and encrypted connection configuration |
| Projects | `/projects` | global project catalog and managers |
| Roles | `/roles` | role definitions and menu assignments |
| Menus | `/menus` | menu catalog and current-user tree |
| Sessions | `/sessions` | product/admin leases, heartbeats, active usage |
| Settings | `/settings` | global defaults, timeout, header, banner |
| Health | `/health` | public liveness |

All tenant-sensitive queries must be scoped by organisation and checked against the authenticated user's authority. New APIs must not trust a client-provided organisation ID without authorization.

## 9. CreditGuard logic

CreditGuard requests belong to an organisation and may belong to a project. The list flow opens a valid product session before querying `/creditguard-api/requests?orgId=...&projectId=...`.

Request fields include request number, instrument type, applicant, beneficiary name, beneficiary address, amount, currency, status, requester, due/review dates, notes, and detailed company-guarantee fields. Beneficiary name remains on the request summary while beneficiary address is stored in `request_details.beneficiary_address`; the address column is nullable for compatibility with existing requests but required when request details are created or updated. Status values are `Draft`, `Under Review`, `Approved`, `Issued`, `Rejected`, and `Closed`. Amount is non-negative. The detailed form supports single- or multi-entity modes; single mode restricts each entity selection to one value. The legacy Attachments text field is not shown during New Request creation.

Business entities contain job-code entity, segment, legal entity name, ledger, and inventory organisation metadata. `(jobCodeEntity, segment1, legalEntityName)` is unique. The page finds its own menu grant; `readonly` hides mutation controls.

Reports derive, in the browser, total/open request counts, counts by status/instrument, and amount totals grouped by currency.

## 10. Data ownership and relationships

### Core database

Key entities are users, organisations, organisation users, teams, products, organisation modules, projects, project modules, user-project/module assignments, roles, user roles, menus, role menus, product database connections, sessions, app settings, and user preferences.

Important relationships:

- Users and organisations are many-to-many through organisation membership.
- Organisation modules connect a tenant to a licensed product and seat count.
- Project modules sub-allocate product seats.
- Sessions reference user, organisation, optional product, and optional project.
- Role-menu rows include access mode.
- Cascades remove dependent assignments when their owner is deleted.

### Product databases

- CreditGuard stores requests, request details, and business entities.
- PRIME currently stores only a placeholder row type.
- Cross-database operations are not distributed transactions.

## 11. Seed behavior

The idempotent core seed:

1. Creates the three default roles.
2. Creates or updates the local admin and password hash.
3. Creates the Global Organisation and owner membership.
4. Creates CreditGuard and PRIME products.
5. Creates the public, workspace, product, global-admin, and organisation-admin menu trees.
6. Grants role-menu access.
7. Creates default application settings.

Seed reruns restore seeded role-menu grants. A route rename may leave an obsolete menu if identity matching no longer finds it.

## 12. Environment variables

| Application | Variables |
| --- | --- |
| Core | `CORE_DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `B2C_TENANT_NAME`, `B2C_POLICY_NAME`, `B2C_CLIENT_ID`, optional `B2C_ISSUER`/`B2C_JWKS_URI`, `LOCAL_JWT_SECRET`, `LOCAL_JWT_EXPIRES_IN`, `CONNECTION_SECRET_KEY`, `SESSION_HEARTBEAT_WINDOW_SECONDS`, seed admin values |
| CreditGuard | `CREDITGUARD_DATABASE_URL`, `PORT`, `CORS_ORIGIN` |
| PRIME | `PRIME_DATABASE_URL`, `PORT`, `CORS_ORIGIN` |
| Frontend | `VITE_APP_NAME`, `VITE_API_BASE`, B2C tenant/policy/client/scope values |

## 13. Testing contract

Playwright tests use browser-level API interception and seeded local storage. Shared mocks reproduce authentication, organisation, products, menus, sessions, and product records. This exercises routing, React state, forms, network payloads, and error handling without external identity or database dependencies.

When adding a user-visible route or mutation:

1. Add/update the route inventory above.
2. Add a route rendering case.
3. Add a success-flow assertion that verifies method and payload.
4. Add validation or relevant server-failure coverage.
5. Keep selectors accessible (`role`, label, text, or explicit `aria-label`).

## 14. Known constraints

- Product services currently lack independent token guards and must not be publicly exposed as trusted APIs.
- Menu access mode is not a complete backend edit-permission model.
- Invalid stored product database credentials are accepted until connection use.
- Browser termination can hold a seat until the session reaper runs.
- Distributed transactions do not exist across core and product databases.
- PRIME domain behavior remains to be implemented.
