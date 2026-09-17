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
- `CreditGuard Requestor`
- `CreditGuard Reviewer`

CreditGuard roles are module-specific: they reference the CreditGuard product and are assigned once per user rather than per organisation. Both roles can open the workspace, product overview, and Requests only when the selected organisation has an active CreditGuard module assignment. Requestors can create and manage requests. Reviewers can review requests and open Reports. Application Setup remains limited to global and organisation administrators. Screen grants are navigation controls; guarded CreditGuard workflow endpoints introspect the bearer token through core and verify organisation membership because hiding navigation is not authorization.

Global role assignments have no organisation ID. Organisation authority is also represented by membership: `Owner`, `Admin`, or `Member`.

The sidebar is data-driven from `GET /api/menus/mine?orgId=...`. Menu trees contain route, icon, display order, product link, and optional `readonly`/`editable` access. Product-linked menus are returned only when the selected organisation has an active module assignment within its validity window. The frontend hides organisation-administration routes from ordinary members and global-only routes outside the global organisation. Backend guards remain the security boundary; hiding navigation is not authorization.

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
| `/app/product/CreditGuard/requests/:requestId/edit` | Edits Draft requests; Under Review is read-only except attachments, and Reviewed is fully read-only |
| `/app/product/CreditGuard/requests/:requestId/approvers` | Assigns one configured contact to each required approval role for a Reviewed request |
| `/app/product/CreditGuard/requests/:requestId/approval` | Selects request PDFs, sends a finalized approval chain to Signit, and displays the persisted envelope and approver actions |
| `/app/product/CreditGuard/reports` | Request counts and portfolio aggregates |
| `/app/product/CreditGuard/application-setup/business-entities` | Permission-aware business entity CRUD |
| `/app/product/CreditGuard/application-setup/module-users` | Organisation-scoped approver CRUD by default, plus a read-only, role-filterable view of eligible module users |
| `/app/product/CreditGuard/application-setup/integration` | Administrator-only Signit authorization-key configuration |
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
| `/admin/users` | Create local users without initial access; search, filter, bulk-status, and edit identity records |
| `/admin/user-assignments` | Status and global/org role assignments |
| `/admin/user-settings` | Preferences, effective access, activity |
| `/admin/organisations` | Organisation CRUD and status |
| `/admin/connections` | Encrypted product database connection settings |
| `/admin/licenses` | Organisation-product license assignment |
| `/admin/settings` | Default org, session timeout, branding/banner |
| `/admin/email-logs` | Global Administrator view of outbound module email attempts and delivery status |
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
| Users | `/users` | Global Administrator-only user creation and management, status, roles, settings, and effective access |
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

Request fields include request number, instrument type, applicant, beneficiary name, beneficiary address, amount, currency, status, requester, due/review dates, notes, and detailed company-guarantee fields. Beneficiary name remains on the request summary while beneficiary address is stored in `request_details.beneficiary_address`; the address column is nullable for compatibility with existing requests but required when request details are created or updated. Status values are `Draft`, `Under Review`, `Reviewed`, `Approved`, `Issued`, `Rejected`, and `Closed`. Amount is non-negative. The detailed form supports single- or multi-entity modes; single mode restricts each entity selection to one value.

New requests do not expose attachment controls. The request must first be saved as a Draft, after which PDF and DOCX documents can be uploaded from the edit form using the generated request ID. Attachment metadata is stored in `request_attachments`; binary content is stored through the configured local-filesystem or private Azure Blob provider. Users can open PDFs in a browser tab, download/open DOCX files through the configured desktop application, and delete attachments while the request is Draft or Under Review. Reviewed requests allow opening existing attachments but reject upload and deletion in both the UI and product API. A Draft cannot transition to `Under Review` without at least one attachment and an eligible Module User assigned the `CreditGuard Reviewer` role; the dedicated submit action saves current edits, records the reviewer snapshot, and atomically changes the CreditGuard request status. Uploads default to 10 MB per document and 10 documents per request, configurable through environment variables.

Attachment routes are `GET/POST /requests/:id/attachments`, `GET /requests/:id/attachments/:attachmentId/content`, and `DELETE /requests/:id/attachments/:attachmentId`. Every lookup includes the request and organisation identifier. Workflow identity endpoints use `ProductAuthGuard`, which forwards the bearer token to core `GET /auth/me` and `GET /organisations/mine`; `CORE_API_URL` configures that trusted core endpoint. Attachment reads and Under Review mutations still rely on the approved calling tier and organisation-scoped lookup, so the CreditGuard service must not be exposed directly.

Business entities contain job-code entity, segment, legal entity name, ledger, and inventory organisation metadata. `(jobCodeEntity, segment1, legalEntityName)` is unique. The page finds its own menu grant; `readonly` hides mutation controls.

Module Users is restricted to administrators with its Application Setup menu grant. The page opens on Approvers. Registered Users is read-only and can be filtered by assigned product role. Registered users come from the active team assigned to the organisation's CreditGuard module; when no team is assigned, all active organisation members are eligible. Core serves these rows and their product role assignments through `GET /organisations/:orgId/modules/:productId/users`, after verifying the authenticated administrator's organisation authority and active module assignment.

Integration is restricted to organisation Owners/Admins and Global Administrators with its CreditGuard Application Setup menu grant. Core routes `GET/PUT /organisations/:orgId/modules/:productId/integrations/signit` verify that authority and an active organisation module assignment. Configuration contains a required HTTP or HTTPS Signit Base URL and an authorization key encrypted with AES-256-GCM using `CONNECTION_SECRET_KEY`; the Base URL may be the server root or end in `/api/v2`, and both forms resolve to one `/api/v2/envelope/create` path. GET and PUT responses expose the non-secret Base URL, `authorizationKeyConfigured`, and update metadata. The browser never receives a saved key or ciphertext, a blank replacement retains an existing key, and an explicit clear operation removes it. Server-side consumers may decrypt the key only immediately before an outbound Signit request and must not log it. HTTPS remains recommended outside trusted local development networks.

The Edit Request reviewer list is served by authenticated core route `GET /notifications/reviewers?orgId=...&productId=...` and contains only active, same-organisation, team-eligible Module Users assigned the product's `CreditGuard Reviewer` role. Guarded CreditGuard route `POST /requests/:id/submit-for-review` permits only the requestor or an organisation/global administrator. For a Draft, it requires the exact generated `<request number> latest.pdf` attachment, stores the selected reviewer's user ID, name, and email snapshot, and sets `submitted_for_review_at` and status `Under Review` in one product-database transaction. Until review is completed, the same authorized actors may select a different eligible reviewer; the locked transaction keeps status `Under Review`, replaces the reviewer snapshot, refreshes `submitted_for_review_at`, and returns the previous reviewer ID. Request fields remain immutable while Under Review, but attachments remain editable. Core route `POST /notifications/reviewer-reassignment` resolves the former reviewer from organisation membership, revalidates the replacement against the active CreditGuard Reviewer role, and sends the former reviewer a pullback notice logged as `Review Reassignment`. The replacement separately receives the normal `Request Review` notification. A failure in either email is visible and logged without reverting the auditable reviewer change or suppressing the other delivery attempt.

The Attachments block action **Attach Request** calls guarded `POST /requests/:id/attach-request`, creating a new McDermott-branded PDF from persisted request and business-detail fields and storing it through the private document provider as `<request number> latest.pdf`. Each page header embeds the approved McDermott logo immediately before the McDermott name at the same visual height as the brand text. The generated document uses a compact form grid modeled on the controlled request form: related entity/date and contract fields share rows, labels are bold, and supporting narratives remain on page one when they fit or move together to a second page when more space is required. Selected Parent, Requesting, and Contracting entity identifiers are resolved server-side to legal entity names; generation fails if a referenced entity is no longer available. For a Draft, the frontend saves current form values before generation. Repeating the action atomically replaces the previous latest attachment and removes its old stored object after commit. The generated PDF does not contain approver identities, approval values, or approval dates. Requests already beyond Draft that predate this requirement and have no generated PDF receive a non-downloadable `previously attached` compatibility marker in attachment listings; no broken storage metadata is persisted. Guarded `POST /requests/:id/review-done` independently verifies active organisation membership and changes only an Under Review request assigned to the authenticated current reviewer to Reviewed, recording reviewer identity/time. A former reviewer loses completion authority immediately after reassignment. Existing uploaded files remain separate attachments. Generic request updates reject both Under Review and Reviewed records.

After the status transition, authenticated core route `POST /notifications/request-review` revalidates the reviewer against the organisation, active module allocation, assigned team, and `CreditGuard Reviewer` role. It sends base request identification through the default enabled SMTP configuration, falling back to enabled priority order. New SMTP profiles default Authentication to `None`, which uses an unauthenticated relay. Selecting `Username and password` requires both credential values; switching back to `None` removes the stored encrypted password. TLS certificates are verified by default. A Global Administrator can temporarily enable `Ignore TLS certificate errors (unsafe)` per SMTP profile; `NEXT_PRIVATE_SMTP_UNSAFE_IGNORE_TLS=true` is an emergency server-wide override for all profiles. Both options set Nodemailer's `tls.rejectUnauthorized` to `false` without disabling TLS itself. Installing the issuing CA through the runtime trust store remains the preferred fix. Delivery failure does not revert the auditable `Under Review` transition: the user receives a warning and Global Administrators can inspect the failed attempt. Core writes sent and failed attempts to `email_delivery_logs`, including module, event, request reference, recipient, subject, SMTP profile name, provider message ID, bounded safe error text, initiating user, and timestamps. Safe error details include the provider message, error code, SMTP status and response, SMTP command, and relevant network operation/server fields; credential-like values and credential-bearing URLs are redacted before storage. Passwords, stack traces, and message bodies are never logged. `GET /notifications/email-logs` is Global Administrator-only and returns the latest 200 attempts with optional module and status filters. Global Administrators can retry a failed attempt through `POST /notifications/email-logs/:id/retry`; the server uses the stored recipient and reference, rejects non-failed IDs, and creates a new immutable delivery-log row for the retry result.

Approvers are standalone CreditGuard contacts rather than platform user identities. `GET/POST /approvers`, `PATCH /approvers/:id`, and `DELETE /approvers/:id` require an organisation identifier, and every lookup and mutation is scoped by it. Approver email is unique within an organisation. After review, the requestor or an organisation/global administrator can use guarded `GET/PUT /requests/:id/approver-assignments` to maintain an ordered approval chain. New chains default required titles from instrument type, PCG language, and parent entity type; users may add, edit, delete, and reorder pending rows. Title-only rows persist before representatives are assigned. Persisted rows contain sequence, title, optional same-organisation representative, server-controlled approval status, action date, and approval link. Sequence values must be contiguous from one, titles must come from the supported list, and every assigned representative is revalidated against the request organisation.

The requestor or an administrator can finalize a saved, fully assigned chain through guarded `POST /requests/:id/approver-assignments/finalize` while the request is `Reviewed`. A warning requires confirmation before the server records `approvers_finalized_at` and `approvers_finalized_by_user_id`; finalized chains reject structural updates. Organisation Owners/Admins and Global Administrators can use guarded `POST /requests/:id/approver-assignments/modify` to clear finalization only while the request remains `Reviewed` and no approver has actioned the chain. Once any approver has approved or rejected, both UI and API permanently prevent structural changes to preserve audit evidence. `requested_by_user_id` is nullable for migration compatibility; an administrator must assign or finalize approvers for a legacy request with no attributable requestor identity. Migration `0016_milky_paladin.sql` adds nullable finalization audit columns without changing existing chains. Rollback removes the UI and endpoints first; retain the audit columns unless finalized-state evidence is no longer required and its loss has been approved.

For a selected `Reviewed` request, the Requests page shows `Initiate Approval`; after successful submission the same action is labeled `Approval Status`. Draft and Under Review requests do not expose this action. The approval screen lists request PDF attachments only, instrument type, beneficiary, the finalized ordered approvers, and their server-owned action status/date/link. Guarded `POST /requests/:id/initiate-approval` accepts selected attachment IDs, revalidates request ownership, `Reviewed` status, finalized and fully assigned pending approvers, and PDF ownership, then reads document bytes from private CreditGuard storage. The Signit title is `<instrument type> - <beneficiary>`, `externalId` is the CreditGuard request ID, `meta.signingOrder` is `SEQUENTIAL`, and each assigned representative becomes an `APPROVER` recipient whose numeric `signingOrder` equals the persisted contiguous approver sequence.

CreditGuard forwards the generated payload and selected PDFs to the authenticated core Signit broker while holding a row lock to prevent duplicate concurrent initiation. The broker requires both the user's bearer token and `CREDITGUARD_INTERNAL_API_KEY`, revalidates active organisation membership/module allocation and PDF content, decrypts the Signit authorization key only immediately before calling the normalized `/api/v2/envelope/create` endpoint, and never returns the key. After creation, core posts `{ envelopeId }` to `/api/v2/envelope/distribute` and requires the response envelope ID plus one unique HTTP(S) signing URL for every distinct requested recipient email. CreditGuard independently validates that complete email set, stores each URL in the matching approver assignment's `approval_link`, then records `signit_envelope_id`, `approval_initiated_by_user_id`, and `approval_initiated_at` and changes status to `Sent for Approval`. Failures return a bounded broker message, roll back CreditGuard persistence, and leave the request Reviewed. Sent requests are immutable through request, attachment, approver, and list-edit APIs. The Approval Status screen exposes Refresh, which calls guarded `POST /requests/:id/refresh-approval`; core retrieves `/api/v2/envelope/:envelopeId`, normalizes signed/approved/completed recipients to `approved`, rejected/declined recipients to `rejected`, and all other provider states to `pending`. CreditGuard requires exactly the request's approver email set before updating `approval_status` and valid provider action timestamps, leaving the request workflow status unchanged. Organisation Owners/Admins and Global Administrators can recall a sent request from its Approval Status screen. Guarded `POST /requests/:id/recall-approval` locks and revalidates the request before the core broker posts `{ envelopeId }` to Signit's normalized `/api/v2/envelope/delete`; only a Signit `{ success: true }` response clears `signit_envelope_id` and approver signing links and restores `Reviewed`, while initiation audit fields remain as historical evidence. Any rejection or ambiguous response leaves the request unchanged. Migration `0017_yellow_magneto.sql` adds nullable Signit audit fields. Deploy core and CreditGuard with the same long random service key before enabling initiation, refresh, or recall; rollback removes the Refresh UI and refresh endpoints first, with no data migration required.

Reports derive, in the browser, total/open request counts, counts by status/instrument, and amount totals grouped by currency.

## 10. Data ownership and relationships

### Core database

Key entities are users, organisations, organisation users, teams, products, organisation modules, module user designations, projects, project modules, user-project/module assignments, roles, user roles, menus, role menus, product database connections, sessions, app settings, SMTP configurations, email delivery logs, and user preferences.

Important relationships:

- Users and organisations are many-to-many through organisation membership.
- Organisation modules connect a tenant to a licensed product and seat count.
- Module user designations reference a core organisation, product, and eligible user.
- Project modules sub-allocate product seats.
- Sessions reference user, organisation, optional product, and optional project.
- Role-menu rows include access mode.
- Organisation product integrations store provider-specific, tenant-scoped configuration secrets encrypted by core.
- Cascades remove dependent assignments when their owner is deleted.

### Product databases

- CreditGuard stores requests, reviewer assignment snapshots, request details, business entities, attachments, organisation-scoped approver contacts, and Signit envelope initiation references.
- PRIME currently stores only a placeholder row type.
- Cross-database operations are not distributed transactions.

## 11. Seed behavior

The idempotent core seed:

1. Creates the three platform roles and the CreditGuard Requestor and Reviewer product roles.
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
| Core | `CORE_DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `B2C_TENANT_NAME`, `B2C_POLICY_NAME`, `B2C_CLIENT_ID`, optional `B2C_ISSUER`/`B2C_JWKS_URI`, `LOCAL_JWT_SECRET`, `LOCAL_JWT_EXPIRES_IN`, `CONNECTION_SECRET_KEY`, `CREDITGUARD_INTERNAL_API_KEY`, `SESSION_HEARTBEAT_WINDOW_SECONDS`, emergency-only `NEXT_PRIVATE_SMTP_UNSAFE_IGNORE_TLS`, seed admin values |
| CreditGuard | `CREDITGUARD_DATABASE_URL`, `CORE_API_URL`, `CREDITGUARD_INTERNAL_API_KEY`, `PORT`, `CORS_ORIGIN`, `DOCUMENT_STORAGE_PROVIDER`, `DOCUMENT_LOCAL_ROOT`, `DOCUMENT_MAX_FILE_SIZE_MB`, `DOCUMENT_MAX_FILES_PER_REQUEST`, `AZURE_STORAGE_ACCOUNT_NAME`, `AZURE_STORAGE_CONTAINER`, optional `AZURE_STORAGE_CONNECTION_STRING` |
| PRIME | `PRIME_DATABASE_URL`, `PORT`, `CORS_ORIGIN` |
| Frontend | `VITE_APP_NAME`, `VITE_API_BASE`, B2C tenant/policy/client/scope values |

## 13. Testing contract

Playwright tests use browser-level API interception and seeded local storage. Shared mocks reproduce authentication, organisation, products, menus, sessions, and product records. This exercises routing, React state, forms, network payloads, and error handling without external identity or database dependencies.

Core migrations `0022_thankful_lockjaw.sql` and `0023_secret_bill_hollister.sql` must be applied before the Integration route is enabled and the core seed rerun to add its menu grant. Rollback removes the route/menu grant and application code first; integration columns or the table should only be dropped after confirming that stored Signit configuration is no longer required.

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
