# Application Logic Reference

This document is the canonical compact context for engineers and AI models working on Designer Platform. It describes implemented behavior, ownership boundaries, request flows, and important invariants. Read the source before changing behavior when this document and code differ.

## 1. System purpose

Designer Platform is a multi-tenant control plane plus product modules:

- **Core platform:** users, authentication, organisations, memberships, teams, projects, roles, menus, product assignment, settings, and concurrent sessions.
- **CreditGuard:** financial-security requests, business entities, reports, and a process guide.
- **Capture-Pro:** upcoming-bid intake, governed Commercial Intelligence source metadata, versioned 14-section capture plans, agent-run records, and audit evidence.
- **PRIME:** service/database scaffolding only.
- **Frontend:** one SPA for public, workspace, product, organisation, and global-administration experiences.

Each product has its own service and database. The core database stores assignment and connection metadata but not CreditGuard request data.

CreditGuard frontend screens, navigation, help topics, and API proxy wiring have been removed. Its backend service, Core integration endpoints, database, and stored documents remain in the repository and are not changed by this frontend retirement. The generic email log can still display historical CreditGuard deliveries.

## 2. Runtime topology

| Runtime | Port | Prefix | Database |
| --- | ---: | --- | --- |
| Frontend | 5173 | `/` | none |
| Core backend | 4000 | `/api` | `platform_core` |
| CreditGuard | 4101 | `/api` | `creditguard` |
| PRIME | 4102 | `/api` | `prime` |
| Capture-Pro | 4103 | `/api` | `capturepro` |

The frontend calls relative paths. Vite forwards `/api/*` to core and rewrites `/capturepro-api/*` to Capture-Pro `/api/*`. No CreditGuard frontend proxy or workflow routes are mounted.

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
- `OrgProvider` loads the authenticated user's active memberships from `GET /api/organisations/mine`, validates persisted context, and stores the full selected organisation object under `selectedOrgId`.
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
4. `OrgProvider` automatically selects an authorised organisation when exactly one membership is returned. With multiple memberships, the authenticated shell blocks tenant-scoped content until the user explicitly selects an organisation. A persisted selection is restored only when it remains in the authorised membership list.
5. `SessionProvider` decodes the JWT `exp` claim and schedules session-expiry notification.
6. Logout or account deletion clears the local token and user.

The signup password minimum is eight characters. Duplicate registration maps HTTP 409 to a specific message. Sign-in failures use a generic invalid-credentials message.

### Azure AD B2C

Microsoft sign-in uses MSAL redirect. For API requests, the client first checks the local JWT, then calls `acquireTokenSilent`, and finally `acquireTokenPopup`. Core validates B2C tokens using issuer/JWKS configuration and performs just-in-time provisioning. If a user with the same email already exists, first B2C login links the B2C object identifier to that record.

### Optional OIDC

When `OIDC_WELL_KNOWN`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` are configured, `/signin` shows a button labeled with `OIDC_PROVIDER_LABEL`. The browser starts the authorization-code flow at `/api/auth/oidc/start`; the backend validates a short-lived state cookie, exchanges the code at the provider token endpoint, validates the ID token against the discovered issuer, audience, and JWKS, provisions or links the user, and issues the existing platform-local JWT. A newly provisioned external identity receives an active `Member` membership in **McDermott IT** and the global `General User` role only; it receives no product role, team, project, module designation, or licence allocation. The default callback is `http://localhost:4000/api/auth/oidc/callback`, and the callback returns the JWT only in the frontend URL fragment before the SPA stores the normal local session. `OIDC_SKIP_VERIFY=true` is limited to non-production environments and skips ID-token signature validation; it must not be enabled for production authentication.

### API failure behavior

An authenticated core request receiving HTTP 401 emits a session-expired event once. Other authenticated failures emit a generic system error notification and throw `API <status>: <body>` to the caller.

## 5. Authorisation and navigation

Core role names seeded by default:

- `Global Administrator`
- `Organisation Administrator`
- `General User`
- `CreditGuard Requestor`
- `CreditGuard Reviewer`

CreditGuard roles remain defined for the retained backend and data. Its frontend routes redirect to `/app/products`, its product is omitted from the product list, and its sidebar menus are hidden. This UI removal does not disable or remove backend endpoints; screen hiding is not authorization.

Global role assignments have no organisation ID. Organisation authority is also represented by membership: `Owner`, `Admin`, or `Member`. The default seeded tenant is **McDermott IT**; the core seed converges the database to that single organisation, assigns every product module to it, and places all existing users in it. New local and B2C-provisioned users, as well as users created through global administration, receive an active McDermott IT membership by default.

The sidebar is data-driven from `GET /api/menus/mine?orgId=...`. Menu trees contain route, icon, display order, product link, and optional `readonly`/`editable` access. Product-linked menus are returned only when the selected organisation has an active module assignment within its validity window. The frontend hides organisation-administration routes from ordinary members and global-only routes outside the global organisation. Backend guards remain the security boundary; hiding navigation is not authorization.

The authenticated header exposes Help on every screen. It maps the current pathname to the nearest available platform or Capture-Pro topic and passes the originating URL so users can return directly to their work. Help content is static frontend documentation and does not reveal inaccessible application records or grant access to documented screens.

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
| `/app/product/CreditGuard/*` | Redirects to `/app/products`; CreditGuard frontend screens are retired |
| `/app/product/Capture-Pro` | Capture-Pro command center and pursuit lifecycle |
| `/app/product/Capture-Pro/opportunities` | Salesforce Opportunities extract (read-only) |
| `/app/product/Capture-Pro/accounts` | Salesforce Accounts extract (read-only) |
| `/app/product/Capture-Pro/competitors` | Salesforce Project Competitor Details with linked opportunity and account names (read-only) |
| `/app/product/Capture-Pro/bid-budgets` | Salesforce Opportunity Bid Budget records with linked opportunity names (read-only) |
| `/app/product/Capture-Pro/fabrication-yards` | Salesforce Fabrication Yard records with every queryable field discovered from Salesforce (read-only) |
| `/app/product/Capture-Pro/vessels` | Salesforce Vessel records with every queryable field discovered from Salesforce (read-only) |
| `/app/product/Capture-Pro/salesforce-sync` | Salesforce sync actions, per-type connection health, and run log |
| `/app/product/Capture-Pro/data-library` | Governed TG3 source metadata and freshness catalog |
| `/app/product/Capture-Pro/agents` | Specialist-agent responsibilities and orchestration boundaries |
| `/app/product/Capture-Pro/plans` | Capture-plan commissioning and list |
| `/app/product/Capture-Pro/plans/:planId` | Version, 14 section states, run history, and plan audit evidence |
| `/app/product/Capture-Pro/governance` | Tenant-scoped Capture-Pro audit trail and control summary |
| `/app/help` | Searchable platform and Capture-Pro documentation grouped into isolated topics |
| `/app/help/:topicId` | Direct contextual help for a specific screen or workflow |
| `/app/resources` | Compatibility redirect to `/app/help` |
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
| `/admin/connections` | Encrypted PostgreSQL or Microsoft SQL Server product database connection settings |
| `/admin/licenses` | Organisation-product license assignment |
| `/admin/settings` | Default org, session timeout, branding/banner |
| `/admin/email-logs` | Global Administrator view of outbound module email attempts and delivery status |
| `/admin/email-templates` | Global Administrator editor for product email event subjects and bodies |
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

Request fields include request number, instrument type, applicant, beneficiary name, beneficiary address, amount, currency, status, requester, due/review dates, notes, and instrument-specific details. Letter of Comfort and Parent Company Guarantee retain the company-guarantee entity, liability, obligations, narrative, and PCG-language controls. The request-list response projects the nullable detail `parentEntityType`; its Instrument column displays `Parent Company Guarantee - MIL` when that value is `mil`, while all other instrument labels remain unchanged. Standby Letter of Credit, Bank Guarantee, and Documentary Letter of Credit instead require the bank-instrument fields from the controlled LC/BG request form: US-bank acceptance and conditional country, language source, new/amendment issue type, instrument value and dates, one purpose, beneficiary contacts, issued-on-behalf entity, billing and contract details, and delivery method. Other purpose, amendment, non-US-bank, and other-delivery fields are required only when their controlling selection applies. For these three bank instruments, request `amount` is the Instrument Value, `due_date` is Date Instrument Required, and Contract Value and Expiry Date are stored separately. Beneficiary name remains on the request summary while beneficiary address is stored in `request_details.beneficiary_address`. Status values are `Draft`, `Under Review`, `Reviewed`, `Approved`, `Issued`, `Rejected`, and `Closed`; amount and stored contract/amendment amounts are non-negative.

Migration `0019_nasty_absorbing_man.sql` adds the LC/BG fields to `request_details` as nullable columns so existing requests remain valid. The service applies conditional completeness and enum validation only to the three named bank instrument types; LOC/PCG validation is unchanged. Rollback requires deploying the previous frontend, service validation, and PDF generator before dropping these columns in a separately approved destructive migration. Existing bank-instrument records must be exported or migrated before any column removal.

New requests do not expose attachment controls. The request must first be saved as a Draft, after which PDF and DOCX documents can be uploaded from the edit form using the generated request ID. Attachment metadata is stored in `request_attachments`; binary content is stored through the configured local-filesystem or private Azure Blob provider. Users can open PDFs in a browser tab, download/open DOCX files through the configured desktop application, and delete attachments while the request is Draft or Under Review. Reviewed requests allow opening existing attachments but reject upload and deletion in both the UI and product API. A Draft cannot transition to `Under Review` without at least one attachment and an eligible Module User assigned the `CreditGuard Reviewer` role; the dedicated submit action saves current edits, records the reviewer snapshot, and atomically changes the CreditGuard request status. Uploads default to 10 MB per document and 10 documents per request, configurable through environment variables.

Attachment routes are `GET/POST /requests/:id/attachments`, `GET /requests/:id/attachments/:attachmentId/content`, and `DELETE /requests/:id/attachments/:attachmentId`. Every lookup includes the request and organisation identifier. Workflow identity endpoints use `ProductAuthGuard`, which forwards the bearer token to core `GET /auth/me` and `GET /organisations/mine`; `CORE_API_URL` configures that trusted core endpoint. Attachment reads and Under Review mutations still rely on the approved calling tier and organisation-scoped lookup, so the CreditGuard service must not be exposed directly.

Business entities contain job-code entity, segment, legal entity name, ledger, and inventory organisation metadata. `(jobCodeEntity, segment1, legalEntityName)` is unique. The page finds its own menu grant; `readonly` hides mutation controls.

Module Users is restricted to administrators with its Application Setup menu grant. The page opens on Approvers. Registered Users is read-only and can be filtered by assigned product role. Registered users come from the active team assigned to the organisation's CreditGuard module; when no team is assigned, all active organisation members are eligible. Core serves these rows and their product role assignments through `GET /organisations/:orgId/modules/:productId/users`, after verifying the authenticated administrator's organisation authority and active module assignment.

Integration is restricted to organisation Owners/Admins and Global Administrators with its CreditGuard Application Setup menu grant. Core routes `GET/PUT /organisations/:orgId/modules/:productId/integrations/signit` verify that authority and an active organisation module assignment. Configuration contains a required HTTP or HTTPS Signit Base URL and an authorization key encrypted with AES-256-GCM using `CONNECTION_SECRET_KEY`; the Base URL may be the server root or end in `/api/v2`, and both forms resolve to one `/api/v2/envelope/create` path. GET and PUT responses expose the non-secret Base URL, `authorizationKeyConfigured`, and update metadata. The browser never receives a saved key or ciphertext, a blank replacement retains an existing key, and an explicit clear operation removes it. Server-side consumers may decrypt the key only immediately before an outbound Signit request and must not log it. HTTPS remains recommended outside trusted local development networks.

The Edit Request reviewer list is served by authenticated core route `GET /notifications/reviewers?orgId=...&productId=...` and contains only active, same-organisation, team-eligible Module Users assigned the product's `CreditGuard Reviewer` role. Guarded CreditGuard route `POST /requests/:id/submit-for-review` permits only the requestor or an organisation/global administrator. For a Draft, it requires the exact generated `<request number> latest.pdf` attachment, stores the selected reviewer's user ID, name, and email snapshot, and sets `submitted_for_review_at` and status `Under Review` in one product-database transaction. Until review is completed, the same authorized actors may select a different eligible reviewer; the locked transaction keeps status `Under Review`, replaces the reviewer snapshot, refreshes `submitted_for_review_at`, and returns the previous reviewer ID. Request fields remain immutable while Under Review, but attachments remain editable. Core route `POST /notifications/reviewer-reassignment` resolves the former reviewer from organisation membership, revalidates the replacement against the active CreditGuard Reviewer role, and sends the former reviewer a pullback notice logged as `Review Reassignment`. The replacement separately receives the normal `Request Review` notification. A failure in either email is visible and logged without reverting the auditable reviewer change or suppressing the other delivery attempt.

The Attachments block action **Attach Request** calls guarded `POST /requests/:id/attach-request`, creating a new McDermott-branded PDF from persisted request and business-detail fields and storing it through the private document provider as `<request number> latest.pdf`. Each page header embeds the approved McDermott logo immediately before the McDermott name at the same visual height as the brand text. LOC/PCG documents preserve the compact company-guarantee grid; the three bank instrument types use an LC/BG layout containing their instrument, beneficiary, contract, conditional amendment, and delivery fields. Selected entity identifiers are resolved server-side to legal entity names; generation fails if a referenced entity is no longer available. For a Draft, the frontend saves current form values before generation. Repeating the action atomically replaces the previous latest attachment and removes its old stored object after commit. The generated PDF does not contain approver identities, approval values, or approval dates. Requests already beyond Draft that predate this requirement and have no generated PDF receive a non-downloadable `previously attached` compatibility marker in attachment listings; no broken storage metadata is persisted. Guarded `POST /requests/:id/review-done` independently verifies active organisation membership and changes only an Under Review request assigned to the authenticated current reviewer to Reviewed, recording reviewer identity/time. A former reviewer loses completion authority immediately after reassignment. Existing uploaded files remain separate attachments. Generic request updates reject both Under Review and Reviewed records.

After the status transition, authenticated core route `POST /notifications/request-review` revalidates the reviewer against the organisation, active module allocation, assigned team, and `CreditGuard Reviewer` role. It sends base request identification through the default enabled SMTP configuration, falling back to enabled priority order. New SMTP profiles default Authentication to `None`, which uses an unauthenticated relay. Selecting `Username and password` requires both credential values; switching back to `None` removes the stored encrypted password. TLS certificates are verified by default. A Global Administrator can temporarily enable `Ignore TLS certificate errors (unsafe)` per SMTP profile; `NEXT_PRIVATE_SMTP_UNSAFE_IGNORE_TLS=true` is an emergency server-wide override for all profiles. Both options set Nodemailer's `tls.rejectUnauthorized` to `false` without disabling TLS itself. Installing the issuing CA through the runtime trust store remains the preferred fix. Delivery failure does not revert the auditable `Under Review` transition: the user receives a warning and Global Administrators can inspect the failed attempt. Core writes sent and failed attempts to `email_delivery_logs`, including module, event, request reference, recipient, subject, SMTP profile name, provider message ID, bounded safe error text, initiating user, and timestamps. Safe error details include the provider message, error code, SMTP status and response, SMTP command, and relevant network operation/server fields; credential-like values and credential-bearing URLs are redacted before storage. Passwords, stack traces, and message bodies are never logged. `GET /notifications/email-logs` is Global Administrator-only and returns the latest 200 attempts with optional module and status filters. Global Administrators can retry a failed attempt through `POST /notifications/email-logs/:id/retry`; the server uses the stored recipient and reference, rejects non-failed IDs, and creates a new immutable delivery-log row for the retry result.

Approvers are standalone CreditGuard contacts rather than platform user identities. `GET/POST /approvers`, `PATCH /approvers/:id`, and `DELETE /approvers/:id` require an organisation identifier, and every lookup and mutation is scoped by it. Approver email is unique within an organisation. After review, the requestor or an organisation/global administrator can use guarded `GET/PUT /requests/:id/approver-assignments` to maintain an ordered approval chain. New chains default required titles from instrument type, PCG language, and parent entity type; users may add, edit, delete, and reorder pending rows. Title-only rows persist before representatives are assigned. Persisted rows contain sequence, title, optional same-organisation representative, server-controlled approval status, action date, and approval link. Sequence values must be contiguous from one, titles must come from the supported list, and every assigned representative is revalidated against the request organisation.

The requestor or an administrator can finalize a saved, fully assigned chain through guarded `POST /requests/:id/approver-assignments/finalize` while the request is `Reviewed`. A warning requires confirmation before the server records `approvers_finalized_at` and `approvers_finalized_by_user_id`; finalized chains reject structural updates. Organisation Owners/Admins and Global Administrators can use guarded `POST /requests/:id/approver-assignments/modify` to clear finalization only while the request remains `Reviewed` and no approver has actioned the chain. Once any approver has approved or rejected, both UI and API permanently prevent structural changes to preserve audit evidence. `requested_by_user_id` is nullable for migration compatibility; an administrator must assign or finalize approvers for a legacy request with no attributable requestor identity. Migration `0016_milky_paladin.sql` adds nullable finalization audit columns without changing existing chains. Rollback removes the UI and endpoints first; retain the audit columns unless finalized-state evidence is no longer required and its loss has been approved.

For a selected `Reviewed` request, the Requests page shows `Initiate Approval`; after successful submission the same action is labeled `Approval Status`. Draft and Under Review requests do not expose this action. The approval screen lists request PDF attachments only, instrument type, beneficiary, the finalized ordered approvers, and their server-owned action status/date/link. Guarded `POST /requests/:id/initiate-approval` accepts selected attachment IDs, revalidates request ownership, `Reviewed` status, finalized and fully assigned pending approvers, and PDF ownership, then reads document bytes from private CreditGuard storage. The Signit title is `<instrument type> - <beneficiary>`, `externalId` is the CreditGuard request ID, `meta.signingOrder` is `SEQUENTIAL`, and each assigned representative becomes an `APPROVER` recipient whose numeric `signingOrder` equals the persisted contiguous approver sequence.

CreditGuard forwards the generated payload and selected PDFs to the authenticated core Signit broker while holding a row lock to prevent duplicate concurrent initiation. The broker requires both the user's bearer token and `CREDITGUARD_INTERNAL_API_KEY`, revalidates active organisation membership/module allocation and PDF content, decrypts the Signit authorization key only immediately before calling the normalized `/api/v2/envelope/create` endpoint, and never returns the key. After creation, core posts `{ envelopeId }` to `/api/v2/envelope/distribute` and requires the response envelope ID plus one unique HTTP(S) signing URL for every distinct requested recipient email. CreditGuard independently validates that complete email set, stores each URL in the matching approver assignment's `approval_link`, then records `signit_envelope_id`, `approval_initiated_by_user_id`, and `approval_initiated_at` and changes status to `Sent for Approval`. Failures return a bounded broker message, roll back CreditGuard persistence, and leave the request Reviewed. Sent requests are immutable through request, attachment, approver, and list-edit APIs. The Approval Status screen exposes Refresh, which calls guarded `POST /requests/:id/refresh-approval`; core retrieves `/api/v2/envelope/:envelopeId`, normalizes signed/approved/completed recipients to `approved`, rejected/declined recipients to `rejected`, and all other provider states to `pending`. CreditGuard requires exactly the request's approver email set before updating `approval_status` and valid provider action timestamps, leaving the request workflow status unchanged. Organisation Owners/Admins and Global Administrators can recall a sent request from its Approval Status screen. Guarded `POST /requests/:id/recall-approval` locks and revalidates the request before the core broker posts `{ envelopeId }` to Signit's normalized `/api/v2/envelope/delete`; only a Signit `{ success: true }` response clears `signit_envelope_id` and approver signing links and restores `Reviewed`, while initiation audit fields remain as historical evidence. Any rejection or ambiguous response leaves the request unchanged. Migration `0017_yellow_magneto.sql` adds nullable Signit audit fields. Deploy core and CreditGuard with the same long random service key before enabling initiation, refresh, or recall; rollback removes the Refresh UI and refresh endpoints first, with no data migration required.

Reports derive, in the browser, total/open/approved request counts, counts by status and instrument, amount totals grouped by currency, active guarantees grouped by guaranteeing entity, and upcoming reviews across four calendar quarters. Instrument counts split MIL Parent Company Guarantees into `Parent Company Guarantee - MIL`; other Parent Company Guarantees retain the base instrument label.

For approval refreshes, workflow status remains unchanged only while one or more assigned recipient is pending or rejected. When the complete normalized recipient set is approved, CreditGuard atomically changes the request from `Sent for Approval` to `Approved` in the same transaction that records recipient actions. The Approval Status screen reflects this transition immediately and remains available from the Requests page for completed approvals.

Approved requests are immutable audit records. Request PATCH and deletion, generated or uploaded attachment creation, attachment deletion, inline notes editing, and repeated completed webhook writes are blocked after approval. Attachment upload and deletion lock the request row and recheck status in the metadata transaction so they cannot race the transition to `Approved`; existing attachment content remains viewable for audit.

Signit calls the public organisation/module webhook with `X-Documenso-Secret`. Core processes `DOCUMENT_SIGNED` and `DOCUMENT_COMPLETED`; other event names are authenticated and acknowledged without changing application state. For supported events, `payload.id` is the positive numeric document ID and `payload.envelopeId` is the non-empty envelope identifier linked to CreditGuard. Required document fields are `id`, `envelopeId`, `status`, `title`, `source: "DOCUMENT"`, and a non-empty `recipients` array. Completion also requires a valid `completedAt`. Each recipient requires a positive `id`, the same `envelopeId`, valid `email`, non-empty `name`, `role`, `readStatus`, `signingStatus`, and `sendStatus`; actioned recipients require a valid `signedAt`. Duplicate recipient emails, mismatched envelope IDs, or a completed document with unsigned recipients are rejected. After payload validation, supported webhook events invoke the same authoritative Signit envelope-status fetch used by the Approval Status Refresh action, then forward that normalized result to CreditGuard's internal status action. The legacy `X-Webhook-Token` plus top-level `envelopeId` contract remains accepted during migration and uses the same refresh path.

### Email templates

Global Administrators manage product event templates through `GET /notifications/email-templates` and `PUT /notifications/email-templates/:id`. Subjects and bodies accept `{{variableName}}` placeholders from an event-specific allowlist. Updates reject unknown placeholders, and delivery fails explicitly when a runtime value is unavailable. Seeded CreditGuard events are `request-review` and `review-reassignment`; repeat seeds add missing defaults without overwriting administrator edits.

Rendered bodies are excluded from delivery-log responses and retained only as AES-256-GCM ciphertext using `CONNECTION_SECRET_KEY`, allowing failed delivery retries to resend the exact original content. Legacy rows without ciphertext retain the generic retry fallback. Rollback removes the route and event-template reads first, then reverts core migration `0026_brave_norrin_radd.sql`; retaining the encrypted retry column during a forward recovery avoids losing retry fidelity.

## 10. Capture-Pro logic

Capture-Pro is registered in core as a licensed product with product-scoped `Capture-Pro Manager`, `Capture-Pro Analyst`, and `Capture-Pro Module Administrator` roles. Global and organisation administrators retain administrative access. Its menu contains Overview, a **Salesforce** submenu with **Opportunities**, **Accounts**, and **Sync & Health**, Data Library, Agent Workspace, Capture Plans, Governance, and administrator-only Integrations. Core continues to own identities, role assignments, organisation membership, product assignment, project allocation, and concurrent-seat sessions.

The Capture-Pro service owns Capture-Pro domain records in the `capturepro` PostgreSQL database. Every domain endpoint requires a bearer token, introspects identity and active organisation memberships through core, and rejects an `orgId` outside the authenticated user's memberships. Product menu visibility is not backend authorization. The service must remain behind the approved calling tier until independent token verification and product-role enforcement are hardened.

An opportunity records preliminary Pre-ITT pursuit information and is unique by opportunity number within an organisation. The `/app/product/Capture-Pro/opportunities` screen now shows Salesforce Opportunities, and the UI no longer offers manual opportunity creation. Existing Capture-Pro opportunity records, their `GET/POST /api/opportunities` API, and Capture Plans commissioning from those records are unchanged. One capture plan may be commissioned per opportunity. Commissioning creates version 1 and CP-01 through CP-14 in one transaction. Versions, sections, runs, and audit events are separate records so later refinement preserves evidence instead of overwriting it.

Capture-Pro domain routes are guarded and organisation-scoped:

| Method and route | Behavior |
| --- | --- |
| `GET /api/overview` | Tenant metrics and recent opportunities |
| `GET/POST /api/opportunities` | List or create preliminary Capture-Pro opportunities; creation is retained in the API but no longer offered in the UI |
| `GET /api/data-sets` | List and idempotently initialize the TG3 metadata catalog |
| `GET/POST /api/data-sets/:dataSetId/documents` | List or register metadata-only HTTPS source references |
| `GET/POST /api/plans` | List or commission one plan per opportunity |
| `GET /api/plans/:planId` | Current version, sections, queued runs, and audit evidence |
| `GET /api/plans/:planId/source-documents` | General and opportunity-specific governed citation sources |
| `PATCH /api/plans/:planId/sections/:sectionCode` | Update current-version content, citations, and section status |
| `POST /api/plans/:planId/versions` | Copy current sections and citations into the next version transactionally |
| `POST /api/plans/:planId/agent-runs` | Record a validated queued run; does not execute a model |
| `PATCH /api/plans/:planId/status` | Apply a valid plan workflow transition and record audit evidence |
| `GET /api/audit` | Latest tenant audit evidence |
| `POST /api/salesforce-opportunities/sync` | Integration administrators import the Salesforce opportunity extract (see below) |
| `GET /api/salesforce-opportunities` | Capture-Pro viewers list stored Salesforce opportunities, including all synced fields; `includeRemoved=true` adds records no longer in the extract |
| `GET /api/salesforce-opportunities/sync-status` | Capture-Pro viewers read the latest sync run |
| `GET /api/salesforce-opportunities/sync-runs` | Capture-Pro viewers read per-type connection health, each type's last run, and the latest 50 runs with their type |
| `POST /api/salesforce-accounts/sync` | Integration administrators import all Salesforce Accounts (see below) |
| `GET /api/salesforce-accounts` | Capture-Pro viewers list stored Salesforce Accounts; `includeRemoved=true` adds accounts no longer returned |
| `POST /api/salesforce-competitors/sync` | Integration administrators import all Salesforce Project Competitor Details (see below) |
| `GET /api/salesforce-competitors` | Capture-Pro viewers list stored competitor records with linked opportunity and account names; `includeRemoved=true` adds records no longer returned |
| `POST /api/salesforce-bid-budgets/sync` | Integration administrators import all Salesforce Opportunity Bid Budget records (see below) |
| `GET /api/salesforce-bid-budgets` | Capture-Pro viewers list stored bid budget records with linked opportunity names; `includeRemoved=true` adds records no longer returned |
| `POST /api/salesforce-fabrication-yards/sync` | Integration administrators describe and import all Salesforce Fabrication Yard records (see below) |
| `GET /api/salesforce-fabrication-yards` | Capture-Pro viewers list stored fabrication yards and their discovered field definitions; `includeRemoved=true` adds records no longer returned |
| `POST /api/salesforce-vessels/sync` | Integration administrators describe and import all Salesforce Vessel records (see below) |
| `GET /api/salesforce-vessels` | Capture-Pro viewers list stored vessels, the Salesforce object name, and discovered field definitions; `includeRemoved=true` adds records no longer returned |

Valid plan transitions are Draft to In Review, In Review to Draft or Authorised, and Authorised to Archived. Only organisation Owners/Admins and Global Administrators may authorise or archive a plan. Authorised and archived plans reject section edits, new versions, and agent-run requests. Citation document IDs must resolve to the active organisation. Creating a successor version locks the plan row, copies the current version, increments `current_version`, and writes audit evidence in one transaction.

The Data Library is a tenant-scoped metadata catalog derived from the supplied TG3 Commercial Intelligence mock. It records data-set names, source counts, source location, freshness policy, and manually registered HTTPS source-document references. Dataset and optional opportunity ownership are revalidated against the active organisation, and source registration creates audit evidence. Capture-Pro does not copy SharePoint files or credentials. Microsoft 365 ingestion requires an approved application identity, least-privilege site access, retention and data-classification review, and licensed-source review. The disabled-by-default metadata-only design and approved target are documented in [Capture-Pro SharePoint setup](CAPTUREPRO_SHAREPOINT_SETUP.md).

The Agent Workspace describes specialist responsibilities behind one orchestrator. A user may queue a validated run record for one of the five named agents from a plan, but this release does not execute that run or claim a model runtime is configured. Deterministic calculations, controlled rates, and FX remain validated-service outputs. Bid and vessel commitments remain human-authorised decisions.

Migration `apps/capture-pro-service/drizzle/0000_overconfident_doctor_spectrum.sql` creates four enums and eight additive tables: opportunities, data sets, source documents, capture plans, plan versions, plan sections, agent runs, and audit events. It creates tenant and ownership indexes only inside `capturepro`; it does not modify other product schemas. Deployment order is: provision `capturepro`, apply its migration, deploy Capture-Pro, deploy core and run the idempotent seed, then deploy the frontend. Rollback is: remove route and menu access, stop Capture-Pro traffic, revert application deployments, and retain the database for audit and recovery. Dropping tables or the database requires separate owner and DBA approval.

### Foundry Agent Workspace chat

**Placement and status:** the existing licensed Capture-Pro Agent Workspace route `/app/product/Capture-Pro/agents` now defaults to Chat and retains Agent overview. No global assistant or new menu grant is introduced. This is the best initial location because its viewers, organisation selection, product assignment and licensed-session boundary already exist. Contextual entry points from opportunity and vessel screens can be added separately; an application-wide assistant would require its own multi-product permission and data-classification design. The five plan-agent roles and queued plan-run workflow remain separate; chat does not execute queued jobs or update plans, opportunities, approvals or financial controls.

**Current local state:** implementation and storage are deployed locally, but live Foundry access is blocked and unverified. The user supplied a Classic project endpoint and the agent name `opportunity-test-praveen`, not a Classic `asst_` ID. `FoundryClient` can resolve one exact existing name through bounded agent listing; it will not create or modify an agent. The metadata-only diagnostic failed at Azure authentication because Azure CLI is not installed. No prompt, selected application data or user conversation was sent to Foundry and no successful model response is claimed. The shared application session also expired during browser verification; normal application sign-in is required. After approved Azure CLI installation and `az login` on the server, rerun the diagnostic to verify identity access, actual agent API type, unique identity and tools. If it is a new-style named agent rather than Classic, use the correct API instead of inventing a Classic identifier. Classic Agent Service is deprecated according to current Microsoft documentation; assess migration before broader deployment.

**Configuration and identity:** server-only settings are `FOUNDRY_ENABLED`, `FOUNDRY_PROJECT_ENDPOINT`, `FOUNDRY_AGENT_ID` or `FOUNDRY_AGENT_NAME`, `FOUNDRY_ORGANISATION_ID`, `FOUNDRY_IDENTITY` (`azure-cli` locally or `managed-identity` for deployment) and optional `FOUNDRY_MANAGED_IDENTITY_CLIENT_ID`. Disabled-by-default placeholders are in `.env.example`; approved non-secret local values are in ignored `.env`. One configured project/agent is restricted to one explicitly approved organisation. Azure Identity 4.11.1 is reused from the repository's existing supported SDK version; there are no browser keys or tokens. Core accepts only an HTTPS `*.services.ai.azure.com/api/projects/<project>` endpoint without userinfo, query, fragment or alternate port, blocks redirects, and refuses operation when TLS verification is disabled. Use approved system CA trust on this Windows host. Credential/token failures and provider errors are sanitized, not logged with secrets, prompts or message content.

**Boundaries and access:** product routes are `GET /agent-chat/status`, `GET/POST /agent-chat/conversations`, `GET /agent-chat/conversations/:id`, and `POST /agent-chat/conversations/:id/messages`; each uses the existing bearer guard, active organisation membership, Capture-Pro viewer role and core product-access check. Conversation identifiers are local UUIDs. Every conversation/history lookup includes organisation and owner, and another user's conversation returns not found, including for administrators. Only core-to-product internal requests may carry Foundry thread references: the browser cannot submit one. Internal core routes under `/organisations/:orgId/modules/:productId/agent-chat` require bearer plus the existing Capture-Pro service key, core product access, current valid assignment and configured organisation. No authentication bypass, new role, changed membership or altered seat/session policy is introduced.

**Storage and privacy:** additive migration `0009_far_may_parker.sql` creates product-owned `foundry_conversations` and `foundry_messages`, two owner/organisation indexes and one conversation foreign key. It was generated, reviewed and applied to the verified loopback Capture-Pro database with no changes to existing domain tables. Core identity is not moved into the product database; owner IDs are references, not copied accounts. Conversations store only an opaque agent-binding hash, remote thread reference, title, state and timestamps; messages store user/assistant text, completion status and provider source labels. Messages and source-derived model output may contain approved confidential data; retain access controls, database encryption/backup controls and the agreed data classification. Remote Foundry threads retain prompts and explicitly attached context under the project's policies. This change does not implement automatic retention deletion or claim compliance certification; retention/export/deletion requirements need approved procedures. No prompt text or provider reply is added to audit logs; successful responses record safe conversation and selected-source-kind metadata only.

**Context and reliability:** attachments are opt-in selections of at most one opportunity, one vessel and one charter per message. The product service resolves each ID in the authorised organisation, requires it to be in the current extract, and rejects unavailable/cross-tenant records. Browser-supplied record payloads are never accepted. No whole portfolio is automatically sent. Context is bounded at 32,000 characters, user messages at 8,000; source values and last-seen time are included without fabricated units or calculations. Charter context includes rates and counterparties and is visibly flagged to the user. Retrieved text is explicitly treated as untrusted data rather than instructions. Agent responses request supporting evidence and uncertainty, but model correctness is not guaranteed. Citations are shown only when actually returned by the provider; no invented citations or simulated successful answers are rendered. Response text and source labels are React-escaped plain text, not executable HTML or unchecked links.

**Execution controls:** only reviewed `file_search` and `azure_ai_search` tools are allowed; all other tool types block readiness. Runs pin that reviewed tool list, use Classic API version `2025-05-01`, cap prompt/completion budgets at 16,000/4,096 tokens, and have a 90-second overall run deadline with bounded per-request responses. `requires_action`, failed, incomplete and oversized responses are failures, not successful replies; the app never submits function-tool actions or makes business commitments. Thread mappings are persisted before prompts are sent. One in-flight request per user is enforced with an advisory transaction lock; a daily cap of 100 user messages and conversation cap of 100 stored messages bound costs/history. Ambiguous failures and server crashes leave the conversation blocked and require a new conversation, preventing blind duplicate prompt/run retries. Old messages may still be retained remotely; do not assume retries or UI navigation delete them.

**Approval, validation and blockers:** this is **Level 3**. The user confirmed security/service-owner review and local activation approval for identity, user/organisation-isolated storage and external transfer of user messages, approved knowledge, selected opportunity data, selected vessel specifications and selected charter commercial data. No production operation or cloud resource/role creation occurred. Both backend builds and frontend type-check completed; synthetic client/tenant-isolation regressions were authored but not run under the continuing test pause. Live metadata verification returned `ready: false` with an Azure CLI/authentication prerequisite, so end-to-end response accuracy, tools, citations, model behavior and actual agent identity remain unverified. Runtime npm audit reported **1 critical, 6 high, 9 moderate (16 total)** findings: the critical package is `proxy-addr` in the existing HTTP graph; other high findings include existing Nest/Express dependencies, Drizzle, Lodash and Nodemailer. The reused Azure Identity chain has moderate MSAL/UUID findings. No audit fix or unrelated upgrade was attempted, no clean security gate is claimed, and these require dedicated review/remediation before broader release.

**Operations and rollback:** build using the existing core/product TypeScript tasks and frontend type-check workaround; migrate the product database before deploying product routes, then deploy core and frontend. Metadata-only task `Inspect approved Foundry agent metadata` executes `node --use-system-ca --require tsx/cjs apps/core-backend/src/db/inspect-foundry-agent.ts` without prompts or cloud writes. Local migration used `node apps/capture-pro-service/dist/db/migrate.js`. Restart core/product after configuration changes. To roll back, set `FOUNDRY_ENABLED=false`, restore the prior Agent Workspace route, stop new remote requests and retain conversation/message/audit tables; do not drop data or delete remote threads/agents automatically. Other products, Spinergie imports and Salesforce contracts remain unchanged.

### Integration configuration

`/app/product/Capture-Pro/integrations` is inside the existing licensed Capture-Pro route. The core backend, not the product service, owns its API connection settings in the existing `organisation_product_integrations` table. No new table, migration, or product-service trust boundary is introduced.

The same screen now includes a separate, disabled-by-default **Connect SharePoint** action after the existing integration-administrator API check succeeds. An isolated single-tenant MSAL SPA client redirects to Microsoft 365, requests delegated Graph `Sites.Selected`, and keeps tokens in memory without changing platform login. `VITE_SHAREPOINT_ENABLED`, `VITE_SHAREPOINT_TENANT_ID`, `VITE_SHAREPOINT_CLIENT_ID`, and `VITE_SHAREPOINT_ORGANISATION_ID` must identify an approved app and matching organisation. Graph enforces the account's permissions and the explicit site grant; frontend organisation matching is not a security boundary. The fixed destination is the `SPMATTeam` site's `Shared Documents/General/SMAT Documents/Project Setup/McDermott_CIS_Test` folder. The app verifies folder resolution after sign-in and creates synthetic `sample.json` only after a separate user confirmation, rejecting conflicts rather than overwriting. No application-data/XLSX export, ingestion, scheduled worker, database change, or credential persistence is introduced. See [SharePoint setup](CAPTUREPRO_SHAREPOINT_SETUP.md#delegated-test-folder-connection) for approval, threat analysis, deployment, tests, remaining security review, and rollback.

The core endpoint prefix is `/api/organisations/:orgId/modules/:productId/integrations/capture-pro`:

| Method and suffix | Behavior |
| --- | --- |
| `GET /` | Read Salesforce metadata and credential-configured flags; never return secrets |
| `PUT /salesforce` | Save OAuth 2.0 Client Credentials settings and an encrypted Client Secret |
| `PUT /spinergie` | Save or replace an encrypted API Key; no other fields are accepted |
| `DELETE /salesforce` | Remove only the selected organisation's Salesforce configuration |
| `DELETE /spinergie` | Remove only the selected organisation's Spinergie configuration |

Every endpoint requires the normal core bearer authentication and checks the exact active Capture-Pro product, active organisation, and module validity window. Global Administrators may manage the selected active assignment. Other callers must have active membership in that organisation and either Owner/Admin membership or a `Capture-Pro Module Administrator` role assigned to the exact product, globally or within the selected organisation. A similarly named role for another product, an organisation administrator role without the required membership, and Manager/Analyst roles alone do not authorize credential access. Sidebar grants do not replace these checks. The seed creates the new role and menu idempotently; it does not assign the administrator role to users.

Salesforce accepts `authType: "OAuth2.0"`, `grantType: "client_credentials"`, `accessTokenUrl`, `clientId`, and optional `clientSecret`. Token URLs must use HTTPS on a Salesforce subdomain and the `/services/oauth2/token` path, without user information, nonstandard ports, queries, or fragments. Initial configuration requires a secret. Omitting it keeps the saved secret only when the client ID and URL are unchanged; changing either requires a replacement secret. Spinergie accepts only `apiKey`. Unknown, blank, null, oversized, or unsupported inputs are rejected. Backend DTOs follow the core workspace's local contract pattern because its current `rootDir` does not allow importing TypeScript source from the shared workspace.

Salesforce client credentials are stored together as an AES-256-GCM encrypted payload; its token URL remains in `base_url`. Spinergie uses the encrypted secret column with no base URL. Both use the existing `CONNECTION_SECRET_KEY`; missing or invalid key configuration fails rather than storing plaintext. Only configured flags, Salesforce client ID/token URL, and update timestamps are returned, with `Cache-Control: no-store`. Browser secret fields are password inputs, clear after successful writes, and are not stored in browser storage. Changing organisation unmounts the form and discards pending UI results and entered credentials. Safe server logs record provider, organisation, product, and actor identifiers, never credentials.

Saving configuration does not contact either provider. A configured flag means credentials are saved, not that a live connection was verified. Spinergie credentials are stored only; no Spinergie data is retrieved yet. Threat controls cover cross-tenant access, role/product substitution, secret disclosure, unsafe token URLs, and credential rotation.

Deployment: confirm the existing integration table migrations are applied and core's approved encryption key is configured; deploy core, apply the role/menu seed through the normal reviewed seed process, assign the new role explicitly through administration, then deploy the frontend. For an existing local installation, `npm run db:core:seed:capturepro-integrations` performs only the registration transaction against a loopback PostgreSQL connection, rejecting production mode and connection-target query overrides. It requires an existing Capture-Pro product, active parent menu, and base administrator roles, refuses conflicting role/menu ownership, and serializes repeat setup with a transaction advisory lock. It creates or repairs the Integrations menu and grants it and its parent to the existing global/organisation administrator roles and the dedicated module administrator role; no user role assignments, memberships, licences, products, or connection secrets are changed. It verifies the resulting menu through the existing menu resolver for a registered Global Administrator and currently valid organisation assignments, logging only safe counts. The full seed reuses the same registration helper. Refresh the sidebar after running it; an active Capture-Pro organisation assignment is still required. The full core seed also performs broader organisation convergence, so inspect its documented effects before running it against any shared environment. There is no data backfill or schema change. Rollback: revert these application changes, remove only the new menu/role grants through approved administration, and retain encrypted configuration rows and the encryption key for forward recovery. Do not reset databases or remove unrelated user work.

### Proposed Cosmos DB connection

The root `.env.example` defines a **proposed**, disabled-by-default server-side Azure Cosmos DB for NoSQL export connection. These settings are documentation/configuration placeholders only: no runtime code consumes them, no SDK is added, no cloud resources are provisioned, and no Salesforce data is transferred. PostgreSQL remains Capture-Pro's source of truth; core identity, tenancy, licensing, and connection secrets must not be copied to Cosmos.

| Setting | Definition |
| --- | --- |
| `CAPTUREPRO_COSMOS_ENABLED` | `false`; setting it to `true` does not activate a connection until an approved connector is implemented |
| `CAPTUREPRO_COSMOS_ENDPOINT` | Approved account URI, such as `https://<account>.documents.azure.com:443/`; do not include keys, credentials, or query parameters |
| `CAPTUREPRO_COSMOS_DATABASE` | Name of the existing approved NoSQL database |
| `CAPTUREPRO_COSMOS_CONTAINER` | Name of the existing approved destination container |
| `CAPTUREPRO_COSMOS_PARTITION_KEY_PATH` | Proposed `/organisationId`; must match the container's actual partition-key definition, not change it |
| `CAPTUREPRO_COSMOS_MANAGED_IDENTITY_CLIENT_ID` | Empty for system-assigned managed identity, or the non-secret client UUID of an approved user-assigned managed identity |

These are backend-only settings, not `VITE_*` variables. The local root `.env` is not modified by this definition and must remain untracked. Managed identity is provided by the Azure host, not by entering a client ID alone. Local development needs a separately approved developer Entra identity and local credential flow; Microsoft OIDC application login and Graph tokens do not authorize Cosmos operations. Do not add account keys, connection strings, client secrets, or tokens to these settings.

The proposed deployment identity needs an approved Cosmos **data-plane** role scoped to the destination container; an Azure management-plane Contributor role alone is insufficient. Prefer a custom role limited to account metadata reads and required item operations. The built-in Cosmos DB Built-in Data Contributor role also allows deletion and queries and should be used only if that broader access is approved. Do not automatically create databases, containers, roles, networks, or identity assignments. Endpoint reachability, allowed network paths, account region/data residency, throughput/cost, retention, and data-owner approval must be reviewed before activation.

For a future connector, backend authorization must resolve the organisation and approved dataset/field allowlist before export. Partitioning is not authorization: every read/write must use the authorised organisation value, never a client-supplied ownership field. Use stable, organisation-and-object-qualified Salesforce record IDs for idempotent writes; review existing container partitioning and uniqueness before implementing this contract. Export only approved domain fields, never credentials or core platform data. Begin with a bounded manual export and explicit per-run success/partial-failure reporting; do not couple external writes to PostgreSQL transactions or silently claim cross-database atomicity.

Classification of this definition: **Level 1**, non-executable configuration documentation. The actual connector, identity/role configuration, external copying of commercially confidential Salesforce data, and any cloud provisioning remain **Level 3**, requiring explicit scope approval, security review, and relevant platform/data-owner approvals. Required implementation tests include denied identity, cross-organisation attempts, duplicate exports, throttling, oversized records, network failure, partial writes, and verification that Salesforce sync behavior is unchanged. Rollback of this definition is limited to removing the proposed settings and documentation; no runtime, cloud, or data rollback is necessary. Future connector rollback must stop exports, revoke its data-plane grant if required, and retain exported records until the data owner authorizes cleanup.

### Salesforce opportunity sync

An integration administrator starts a manual sync with **Sync opportunities now** on **Capture-Pro > Salesforce > Sync & Health** (`/app/product/Capture-Pro/salesforce-sync`). Integrations now contains only Salesforce and Spinergie credential settings and links to that screen. There is no scheduled sync. The flow keeps credentials in core and Salesforce domain data in Capture-Pro:

1. Capture-Pro `POST /api/salesforce-opportunities/sync` requires active organisation membership and Global Administrator, organisation Owner/Admin, or `Capture-Pro Module Administrator`. It obtains the Capture-Pro product ID from core `GET /api/products?orgId=...`, which enforces the active assignment, team restriction, and product-role binding. It never accepts a product ID from the client.
2. Capture-Pro calls core `POST /api/organisations/:orgId/modules/:productId/integrations/capture-pro/salesforce/opportunities/extract` with the user's bearer token and `X-CapturePro-Service-Key`. Core compares the service key with `CAPTUREPRO_INTERNAL_API_KEY` in constant time before reading data, then reapplies the integration-administrator and active-assignment checks.
3. Core decrypts the saved credentials, requests an OAuth 2.0 Client Credentials token from the saved My Domain token URL, and runs a fixed SOQL query through REST API `v63.0`. The query selects the same 49 Opportunity fields as the Power Query extract. Client input never reaches SOQL. Core accepts only an HTTPS `*.salesforce.com` instance URL with no credentials, port override, or path; follows only relative `nextRecordsUrl` query cursors; disables redirects; applies 30-second request timeouts; and stops after 500 pages or 50,000 records. It returns only the selected scalar fields and never returns the access token or provider error bodies. Use the My Domain token URL, such as `https://<domain>.my.salesforce.com/services/oauth2/token`, because Salesforce does not support Client Credentials through `login.salesforce.com`.
4. The SOQL filter is a superset: `Exclude_from_Market_Analyst_Reports1__c = false`, non-null `priority__c` and `Opportunity_Number__c`, and `RecordTypeId = '0120e000000UPzPAAW' OR Service_Agreement_Business_Line__c = 'Subsea & Floating Facilities'`. Capture-Pro then applies the exact case-sensitive Power Query rules. It excludes opportunity numbers beginning with uppercase `Q` or `M`, applies the four StageName replacements in order, replaces only null `Sub_Category_Product_Type__c` values with `TBA`, and derives `ProductTypeSubCategory` as `Floater` when the sub-category starts with `Floating`; otherwise, it is `Subsea`.

Capture-Pro stores the results in its own database, separately from manually entered Capture-Pro opportunities, which are never created or changed:

| Table | Contents |
| --- | --- |
| `salesforce_opportunities` | One row per organisation and Salesforce `Id` (unique). Typed display columns, the transformed and original StageName, numeric financial values, all 49 transformed fields plus `ProductTypeSubCategory` in `fields`, and extract-tracking timestamps |
| `salesforce_sync_runs` | Per-attempt status, actor, timing, received/matched/inserted/updated/removed counts, and a sanitized failure reason |

A successful sync runs in one transaction, guarded by a per-organisation advisory lock. It records the run, upserts matched records in batches, and marks previously current records that were not returned as `in_extract = false` with `removed_from_extract_at`. It never deletes them. A record that reappears is marked current again. Audit events contain the run ID and counts only, not opportunity or financial values. A failed attempt records a `Failed` run and audit event and leaves stored opportunities unchanged. A rejected bearer token records nothing.

Viewing requires active membership, core's Capture-Pro product check, and Global Administrator, organisation Owner/Admin, `Capture-Pro Module Administrator`, `Capture-Pro Manager`, or `Capture-Pro Analyst`. The list returns typed display columns plus the transformed `fields` payload for all 49 Salesforce fields and `ProductTypeSubCategory`. It excludes organisation and sync-run identifiers and uses `Cache-Control: no-store`. The **Opportunities** screen under the Salesforce menu (route unchanged, page title Salesforce Opportunities) shows key columns by default and has a column chooser for every field and a details panel for each record. The details panel shows all fields with their API names, the Salesforce stage before rule adjustments, and extract status. The table fills the remaining page height and scrolls independently, so its horizontal scrollbar, sticky headers, and pagination footer stay visible. Each visible column has a filter: yes/no fields and short picklists use dropdowns, including blank values; numeric fields accept `>`, `>=`, `<`, `<=`, `=`, or `a..b` ranges; identifier and free-text fields use contains matching. Filters on hidden columns are cleared. Users can combine search and filters, include records no longer in the extract, and page through results 100 at a time. All data is held in memory in the browser. Forecasted revenue, gross profit, competitor bid prices, and contract values are commercially confidential.

Migration `apps/capture-pro-service/drizzle/0001_salesforce_opportunities.sql` is additive. It creates the two tables, their organisation indexes, and a foreign key from opportunities to the last sync run. It does not alter existing tables. The core helper `registerCaptureProSalesforceMenus` creates or repairs the **Salesforce** submenu under the Capture-Pro menu at display order 2. It requires exactly one active Capture-Pro parent menu and moves an existing Salesforce group, including an earlier top-level one, into place while preserving its ID. Missing Capture-Pro parent grants are added read-only for the five roles, and existing parent grants are left unchanged. It moves the existing `/app/product/Capture-Pro/opportunities` menu into the group in place as **Opportunities**, preserving its ID, then adds **Accounts** (`/app/product/Capture-Pro/accounts`, order 2), **Competitors** (`/app/product/Capture-Pro/competitors`, order 3), **Bid Budget Data** (`/app/product/Capture-Pro/bid-budgets`, order 4), **Fabrication Yard** (`/app/product/Capture-Pro/fabrication-yards`, order 5), **Vessel Data** (`/app/product/Capture-Pro/vessels`, order 6), and **Sync & Health** (order 7). All five viewer and administrator roles receive read-only grants on the group, Opportunities, Accounts, Competitors, Bid Budget Data, Fabrication Yard, and Vessel Data. On Sync & Health, Global Administrator, Organisation Administrator, and `Capture-Pro Module Administrator` receive editable grants, while Managers and Analysts receive read-only grants. The frontend shows the sync action only for editable access; the backend still enforces the integration-administrator check. Repeat runs restore these access modes. The helper deactivates, without deleting, the former separate `/salesforce-opportunities` menu; that frontend route redirects to `/opportunities`. Other custom role grants are preserved. `npm run db:core:seed:capturepro-integrations` runs this helper together with the Integrations menu registration, and the full seed runs both helpers.

**Sync & Health** derives API connection health separately for Opportunities, Accounts, Competitors, Bid Budget Data, Fabrication Yard, and Vessel Data, using only recorded sync runs of that type, and makes no extra Salesforce calls. Health is **Healthy** when the latest run of that type succeeded, **Failing** when it failed, and **Not synchronized** when there are no runs. Each type panel shows the last successful and failed sync times, consecutive failures, the recent success rate, its own sync button, and full details for its last run. The shared log lists the latest 50 runs with a **Type** column, timing, duration, counts, and sanitized failure reasons. The log identifies only whether the current user started a run; user IDs are not returned.

### Spinergie vessel specifications (active locally)

This section supersedes earlier descriptions of Spinergie as credential-storage-only and the older navigation order below. A read-only **Capture-Pro > Spinergie > Vessel Specifications** screen is available at `/app/product/Capture-Pro/spinergie-vessels`. It has search, typed column filters, a field chooser, 100-row pagination, a full-specifications dialog, refresh, include-removed, empty, loading, and error states. It preserves provider field names and values without guessing units or adding vessel-analysis scores. Nested specification objects and arrays are rendered as text, not HTML; provider URLs are not embedded as images or followed automatically. The additive migration `0007_eminent_toro.sql` was generated, inspected and applied to the local Capture-Pro database on 2026-10-24, along with approved local menu registration.

The approved read-only inspection of `GET https://intelligence.spinergie.com/base/api/vessel/specs` returned a complete top-level array of 2,240 specifications with numeric `vesselId`, `vessel`, vessel type, manager, dimensions, DP system, lay methods, lifting capabilities, and other typed/nested fields. The client sends `Accept: application/json` and the saved `apiKey` header server-side. Core retains encrypted credentials and exposes only a service-key/bearer/admin-protected `POST /organisations/:orgId/modules/:productId/integrations/capture-pro/spinergie/vessels/extract`; neither browsers nor the product database receive the key. Redirects are rejected, TLS verification stays enabled, response reads time out after 60 seconds and are capped at 32 MiB and 50,000 records, and provider bodies/credential-bearing errors are not logged or returned. This Windows host required Node's `--use-system-ca` to trust its approved system certificate chain; configure the core runtime's trusted CA support before activation, never disable TLS verification. The local-only `src/db/inspect-spinergie-vessels.ts` diagnostic reads the one configured local key, prints field/type/count metadata only, and writes no records.

Product API endpoints are `GET /spinergie-vessels?orgId=...&includeRemoved=true|false`, `POST /spinergie-vessels/sync` with only `{ orgId }`, and `GET /spinergie-vessels/sync-runs?orgId=...`. Existing product bearer, authorised-organisation, active product assignment, viewer-role and integration-administrator checks remain the boundary. All five existing Capture-Pro viewer/administrator roles receive only read access to the new menu. Only existing integration administrators can request a sync, which is independently rechecked by core. No new roles, user assignments, product assignments or licensed-session rules are introduced.

The Capture-Pro database owns two new tables: `spinergie_vessels` (organisation plus provider vessel ID uniqueness, JSON specifications, last-seen/in-extract metadata and run foreign key) and `spinergie_sync_runs` (organisation-indexed run counts, timing, initiator and sanitized failure reason). Salesforce tables and contracts remain unchanged. A per-organisation transaction advisory lock rejects overlapping Spinergie imports. A full successful extraction is validated before upserts and marking missing vessels out of the extract; empty, wrapped/paginated, duplicate-ID, malformed, oversized or failed extracts are rejected with existing vessel data retained. Failure runs and audit events are recorded without vessel payloads or secrets. Successful runs and audit evidence commit atomically with the vessel data. The product service reuses the existing Capture-Pro access/extract implementation; Spinergie-specific parsing is isolated in `spinergie-vessel.transform.ts`.

Sync & Health keeps its existing route and final menu position, with an independent Spinergie panel for manual sync, health derived from recorded runs, latest run details, received/stored/new/updated/removed counts, timing, sanitized failures, and the latest 50 runs. Spinergie failures do not rewrite Salesforce health. Only a current-user initiator indicator is returned to browsers, not raw initiator or organisation identifiers in run responses.

Classification: **Level 3**. The user explicitly confirmed required security/DBA/service-owner reviews and release checks were complete and approved local migration, menu grants, service restart and first import. Local activation completed on 2026-10-24: the migration created the two new tables, existing-role read-only menus were registered, and a signed-in integration administrator ran the sync through the normal licensed product session. The first attempt failed during certificate validation and remains recorded. Restarting core with Node's approved system CA trust resolved it without disabling TLS verification; the next run imported 2,240 vessels (2,240 new, 0 updated, 0 removed). The authenticated vessel screen displayed 100 rows and `2240 vessels · Page 1 of 23`, with no alerts. Both backend builds completed successfully using their workspace TypeScript configurations. No automated tests were run by the agent; tests remain paused at the user's instruction. User-confirmed external checks are not represented as agent-executed validation, and other environments remain subject to their own release gates. Targeted suites to run only when authorised: the core integration and Spinergie-client specs, the product Salesforce/Spinergie service specs, and mocked Spinergie browser workflows. No dependency or infrastructure change was introduced.

Local runtime note: the root development command uses `concurrently -k`, so stopping its core watcher also stops sibling product/frontend processes. The activation session restored core on 4000 and Capture-Pro on 4103 from their built entry points, and Vite on 5173, as separate processes. Core runs with `node --use-system-ca apps/core-backend/dist/main.js`; keep approved system certificate trust configured when restarting it. The local diagnostic's `--activation-status` mode reports table presence, scoped vessel/run counts, menu placement, local HTTP availability and whether TLS verification was disabled, without fetching or printing vessel specifications or secrets. Rollback retains these tables and audit history as described below.

Approved deployment order is Capture-Pro additive migration, core and product API deployment, frontend deployment, then reviewed menu registration (the existing local-only `db:core:seed:capturepro-integrations` command accepts loopback databases only). Spinergie uses display order 7, Salesforce 8, Integrations 9 and Sync & Health 10; Sync & Health remains last. No data backfill is required; the first explicit administrator sync populates the new tables. Migration adds new tables/indexes/one foreign key only and does not rewrite existing vessel data. Rollback first disables Spinergie sync and deactivates its menus through approved administration, then restores the previous application code; retain the new tables and run/audit history for forward recovery rather than dropping data. No existing Salesforce or identity data rollback is required.

### Spinergie vessel charters (active locally)

**Capture-Pro > Spinergie > Vessel Charters** is a separate read-only screen at `/app/product/Capture-Pro/spinergie-charters`, after Vessel Specifications in the same menu group. It reuses the existing Spinergie browser controls for search, typed column filters, field selection, 100-row pagination, full-record dialog, refresh, include-removed, loading, error and empty states. Charter default columns are vessel title, status, start/end, duration, rate/currency, charter manager/operator and country. All provider fields remain available. Provider date numbers, durations, currency and rate values are preserved without guessing units, converting currency, calculating financial outcomes or asserting business approval. Charter parties, rates and records were not printed by the metadata diagnostic or copied into test fixtures.

Core uses the same saved encrypted organisation/product Spinergie key to call only `GET https://intelligence.spinergie.com/base/api/vessel/charters`, with `Accept: application/json` and server-side `apiKey`. The fixed-endpoint client reuses the existing 60-second timeout, 32-MiB/50,000-row cap, redirect rejection, JSON validation, full TLS verification and sanitized errors. The new internal extract is `POST /organisations/:orgId/modules/:productId/integrations/capture-pro/spinergie/charters/extract`, protected by the existing bearer, internal service key, active assignment and integration-administrator checks. Existing specification routes and response shapes remain compatible; credentials are never returned to browsers or stored in the product database.

Capture-Pro owns the additive `spinergie_charters` and `spinergie_charter_sync_runs` tables. Migration `0008_cloudy_thunderbird.sql` adds only those tables, four indexes and their run foreign key; it does not alter or backfill existing specification/Salesforce records. Product routes are `GET /spinergie-charters?orgId=...&includeRemoved=true|false`, `POST /spinergie-charters/sync` accepting only `{ orgId }`, and `GET /spinergie-charters/sync-runs?orgId=...`. The existing tenant/product/viewer/admin checks are reused. All five existing Capture-Pro viewer/administrator roles receive read-only menu grants; only existing integration administrators can import. No new role, membership, product assignment or licensing rule is introduced.

The inspected endpoint returns a complete root array with `vesselId`, `vesselTitle`, `dateStart`, `dateEnd`, `duration`, `status`, `dayRate`, `dayRateCurrency`, `comment`, location, manager/operator and owner fields, but no charter identifier. Therefore records are stored as source snapshots, not falsely identified by vessel ID alone. The internal `charterId` is SHA-256 over recursively key-sorted JSON for the complete source row. Reordered JSON keys retain the same identity; multiple distinct charters for one vessel are preserved; exact duplicate source rows collapse to one snapshot, with received and stored counts reported separately. A changed source row becomes a new snapshot and its prior row is marked out of the current extract, not deleted. This key is not represented as an upstream contractual identifier. No monetary calculations or financial workflow transitions occur.

Charter import uses its own organisation transaction advisory lock, validates the complete response before upserts, atomically commits records/run/audit evidence, rejects overlapping imports, and retains existing charter data on failed, empty, malformed or incomplete extracts. Successful complete imports mark missing snapshots out of the extract. Failed imports have sanitized, separate charter run/audit entries. Sync & Health adds an independent Vessel Charters panel and latest-50 run log, with health, timing, received/stored/new/updated/removed counts and current-user initiator indicator; charter failures do not change specification or Salesforce health. Shared frontend components are dataset-configured rather than duplicating the vessel browser and health panel.

Classification: **Level 3**, with explicit user confirmation that security/DBA/service-owner reviews and release checks approved implementation and local activation, including provider inspection, additive migration, read-only menu grants and first sync. Local activation completed on 2026-10-24. Migration and compiled menu registration succeeded without changing user/organisation assignments; only the two agent-managed backend processes were restarted with `--use-system-ca`. The signed-in administrator's normal UI sync returned HTTP 200/Succeeded: 4,375 received, 4,354 unique snapshots inserted, 0 updated, 0 removed (21 exact duplicate source rows). The authenticated list returned 4,354 unique snapshots and the screen showed `4354 charters · Page 1 of 44`, 100 visible rows and no alerts. No provider values or API keys were included in the count-only verification output.

Validation commands completed successfully: `node node_modules/typescript/bin/tsc --project apps/core-backend/tsconfig.json --incremental false --diagnostics --ignoreDeprecations 5.0`, the equivalent command for `apps/capture-pro-service/tsconfig.json`, and `node node_modules/typescript/bin/tsc --project apps/frontend/tsconfig.json --noEmit --diagnostics --ignoreDeprecations 5.0`. Migration was generated using `npm.cmd run db:generate --workspace @platform/capture-pro-service`; inspected additive SQL was applied locally via `node apps/capture-pro-service/dist/db/migrate.js`; menus were registered via `node apps/core-backend/dist/db/seed-capture-pro-integrations.js`. Synthetic parser, endpoint and negative-permission regressions were added to existing suites but **not run**, per the user's continued test pause; no automated test coverage result is claimed. Other environments require independent approved release validation and deployment.

Rollback: disable only charter sync and deactivate the Vessel Charters menu through approved administration before restoring prior code. Retain charter tables, snapshots, sync history and audit records for forward recovery; do not drop data or roll back unrelated vessel specifications/Salesforce state. Deployment order for another approved environment is additive product migration, core/product services, frontend, reviewed menu registration, then explicit administrator import. TLS verification remains required; use the approved system CA trust instead of disabling certificate checks.

### Personal opportunity workspace and Pre-ITT

The separate **Capture-Pro > Opportunity Workspace** screen at `/app/product/Capture-Pro/opportunity-workspace` has two views. **All opportunities** preserves the authorised Salesforce market-analyst extract, column filters, column chooser, read-only source details, removed-record option, and pagination. It is not an unrestricted list of every record in Salesforce: existing upstream extract filters and backend permissions are unchanged. Users add or remove individual opportunities with the row bookmark control. **My Workspace** shows only those selections and becomes the initial view on the next visit when selections exist. Users may return to All opportunities to change the selection; this is a preference, not a new authorization boundary. **Salesforce > Opportunities** remains a separate read-only screen at `/app/product/Capture-Pro/opportunities`; it neither loads workspace selections nor offers bookmark, lifecycle, or personal-workspace controls, and always shows the authorised extract regardless of personal selections. The legacy Salesforce URL continues redirecting to that data screen.

Current navigation takes precedence over older menu-placement descriptions elsewhere in this reference. Capture-Pro's standard child order is Overview (1), Opportunity Workspace (2), Data Library (3), Agent Workspace (4), Capture Plans (5), Governance (6), Spinergie (7), Salesforce (8), Integrations (9), and **Sync & Health (10, last)**; Spinergie is activated locally as described above. Salesforce contains only its six read-only data screens: Opportunities, Accounts, Competitors, Bid Budget Data, Fabrication Yard, and Vessel Data. Spinergie contains its separate read-only Vessel Specifications (1) and Vessel Charters (2) screens. Sync & Health is a direct child of Capture-Pro, immediately below Integrations, not a Salesforce child or an Integrations submenu. Its route remains `/app/product/Capture-Pro/salesforce-sync`. All existing Capture-Pro viewers can inspect recorded sync health and logs; only existing integration administrators retain sync controls. Live provider health probes are not introduced. Roles that cannot access Integrations still see Sync & Health as their last standard Capture-Pro item.

Menu registration is idempotent and preserves existing menu IDs, parent grants, sync access modes, and custom role grants. It adds only a read-only Opportunity Workspace menu grant for the same five existing Capture-Pro viewer/administrator roles; it creates no users, roles, memberships, or product assignments. **Menu-grant registration is Level 3** and requires the repository's dedicated security review before applying it. No live menu/grant writes are performed by editing these files. After approved review/deployment, an existing local installation can use `npm.cmd run db:core:seed:capturepro-integrations` to apply and verify the registration; the command accepts only loopback PostgreSQL and rejects production mode. Refresh navigation afterwards. Shared-environment registration must use the approved deployment process, not the local-only command. Rollback restores the previous menu placement and inactivates the new workspace menu through approved administration, retaining IDs and grant history; no schema or source-data rollback is needed. Do not run the broad core seed merely to update navigation.

My Workspace switches between saved opportunities using a searchable popup selector in the header toolbar, not a permanent left-hand list. Search matches opportunity number, name, Salesforce ID, country, and source stage without changing the currently displayed opportunity until the user selects a result. The popup indicates the current selection and removed-extract status; Escape, outside click, or leaving the control dismisses it. The selected opportunity details use the full available content width. Existing remove, clear-selection, refresh, unavailable-record, loading, and error states remain available. This is a Level 2 frontend-only layout change using existing Button styling and Lucide icons, with no new dependency, API, menu-grant, schema, or security-boundary changes. Rollback restores the prior list layout; saved selections are unchanged. Automated tests were not rerun for this layout change at the user's request.

The My Workspace tab is shown before All opportunities. The Pre-ITT Intake follows the reference layout as one compact read-only grid: each field is marked `RO` with its Salesforce source field in the tooltip, Region shows Country alongside it, and Indicative scope (`Description`) spans the full row. The reference's contract type and bid budget are not in the current opportunity extract, so the screen shows an explicit notice rather than inferring values. Client account resolves `Opportunity.AccountId` to `Account.Name` using the existing read-only `GET /salesforce-accounts?includeRemoved=true` list (same viewer roles), loaded once per workspace visit and on Refresh; only the name is shown when available, and if accounts cannot be loaded or the account is not synced, the ID is shown with a notice. Adding them requires a separately approved extract or join change.

My Workspace follows the reference Opportunities format: six KPI cards (workspace count, Pre/Post-ITT split, ITT within 60 days, receipts to confirm, ITT date required, last sync) computed only from selected records; selector cards with number, stage chip, name, country, ITT date, owner, and a seven-segment progress bar; an opportunity header with stage/status/flag chips and contract value; a six-cell ITT strip; a seven-step timeline (Pre-ITT Intake through Competitor Analysis); and section tabs (Pre-ITT Intake, ITT & Post-ITT Intake, Stakeholder Map, Top Tension & Vessels, Competitor Analysis, History & Agent Chats). Only Pre-ITT Intake has content; other tabs show a not-implemented notice. Because no workspace progress store exists, status is always `Not started` and every step is `pending` or `awaits ITT`. The reference's human-confirmation marks, editable engineering fields, save/confirm actions, connect button, mock data, and permanent resizable left list are intentionally excluded.

Selection persistence is browser-local, under `captureProOpportunityWorkspace:v1:<encodedOrganisationId>:<encodedUserId>`. Only deduplicated Salesforce IDs are stored, never record snapshots, commercial values, tokens, or source credentials. Parent component remounting on organisation/user change reloads the correct selection and discards pending results from the previous context. Corrupt data and storage failures produce recoverable errors instead of claiming successful persistence. Selections do not follow users across browsers/devices; durable server-owned workspaces require a separately approved schema and ownership change. Deleting browser storage removes these preferences without deleting Salesforce or Capture-Pro records.

The workspace fetches the existing authorised opportunity list with `includeRemoved=true`, then intersects the result with the selected IDs. It resolves every displayed value from that response rather than a saved snapshot. Refresh requests current Capture-Pro data; importing newer Salesforce changes still requires the existing administrator sync. Previously removed records retain their warning, and selected IDs missing from the response are counted as unavailable without fabricating details. A denied or failed API response renders an error and no opportunity details. Clearing or removing a selection affects only local preferences, not the extract or other users.

The supplied target-state HTML is a requirements reference only; its visual format, mock data, browser Salesforce token input, simulated authentication, and fallback dataset are not copied. The workspace uses the existing source fields for a read-only **Pre-ITT intake**: opportunity/account identifiers, region/country, business line, scope/product, priority, ITT/bid/award/close dates, owner and pursuit leads, contract/revenue/profit outlook, Go/Get values, and description. No additional Salesforce fields or queries are required for this increment. Commercial amounts keep source values; no currency, account name, or missing business value is invented.

**Lifecycle suggestion:** `RFP_Date__c` is the ITT/RFP date and is validated as a calendar date; day boundaries use UTC. Future dates suggest Pre-ITT. An ITT date reached today or earlier suggests Post-ITT, but does not imply receipt. Explicit boolean `ITT_Received__c = true` takes precedence and suggests Post-ITT even if the date is missing or in the future. Without a valid date or confirmed receipt, the suggestion is `ITT date required`. Receipt confirmation, source Salesforce stage, and last-seen sync time remain separately visible. This is a read-only presentation rule, not a persisted stage transition, approval, financial decision, or automatic completion. Only the Pre-ITT view is implemented; ITT receipt, Post-ITT, Analysis, Bid decision, and Outcome remain empty, inactive sections without actions or business logic.

Classification of the frontend workflow: **Level 2**, scoped route separation and local preference persistence, explicitly requested by the user. The accompanying menu/grant registration has the Level 3 gate described above. Impact covers the two frontend screens, additive route, existing core menu registration/local verification, and focused tests. Product APIs, shared contracts, schemas, identity/session enforcement, licensing, Cosmos/SharePoint exports, and infrastructure remain unchanged. The local-storage contract is preserved so existing selections move with the workspace without a migration. Targeted validation: `node --test apps/frontend/test/opportunity-workspace.spec.cjs`; frontend `tsc --noEmit --ignoreDeprecations 5.0`; core TypeScript compile; `node --test apps/core-backend/test/capture-pro-integration-menu.spec.cjs`; and `npx playwright test 'capture-pro-salesforce-opportunities\.spec\.ts' 'capture-pro-salesforce-sync\.spec\.ts'`. Tests cover separate navigation, final Sync & Health placement, read-only Salesforce screens, viewer/admin sync restrictions, idempotent menu updates and ownership conflicts, selection/removal, reload, source refresh, isolation keys, invalid/missing dates, denied access, storage failure, table behavior, and desktop/mobile layout. Frontend rollback reverts only the workspace screen/route changes; menu rollback follows the approved procedure above. Existing browser selection keys can be retained. No migration, cloud operation, or source-data rollback is required.

### Salesforce account sync

**Sync accounts now** on Sync & Health is a separate manual action for the same integration administrators. Capture-Pro calls core `POST /api/organisations/:orgId/modules/:productId/integrations/capture-pro/salesforce/accounts/extract` with the user's bearer token and `X-CapturePro-Service-Key`. Core applies the same service-key and administrator checks, then runs the fixed SOQL `SELECT Id, Name, Type, Company_Short_Name__c FROM Account` through the shared Salesforce client. That client uses the same token, instance-URL, pagination, redirect, timeout, 500-page, and 50,000-record controls, and returns only those four fields. As in the Power Query source, there is no filter, so all Accounts are imported. More than 50,000 records fail explicitly without changing stored data.

Capture-Pro stores Accounts in `salesforce_accounts`: one row per organisation and Salesforce `Id`, with `name`, `type`, `company_short_name`, and extract-tracking columns. Duplicate Ids in one extract keep the last record. A successful run executes in one transaction under a per-organisation account advisory lock. It records an `Account` run, upserts in batches, and marks previously current Accounts that were not returned as `in_extract = false` with `removed_from_extract_at`. It never deletes them or touches Opportunities. Failures record a failed `Account` run and audit event. Audit details contain counts only.

**Capture-Pro > Salesforce > Accounts** (`/app/product/Capture-Pro/accounts`) is read-only for the same five viewer and administrator roles and uses core's Capture-Pro product check. It shares the Opportunities table behavior: the table fills the page height with sticky header filters; Type and short picklists use dropdowns, while Account Name and Salesforce ID use contains filters; and search, paging, the option to include removed records, and a details panel are available.

Migration `apps/capture-pro-service/drizzle/0002_salesforce_accounts.sql` is additive. It creates `salesforce_accounts` with an organisation/Salesforce ID unique index, an extract index, and a foreign key to `salesforce_sync_runs`. It adds `salesforce_sync_runs.object_type varchar(20) NOT NULL DEFAULT 'Opportunity'`, so existing runs are classified as Opportunity runs; this constant default does not rewrite the table. It also adds an organisation/type/start-time index. Rollback leaves both the table and column in place for audit; reverting the application stops account syncs.

### Salesforce competitor sync

**Sync competitors now** on Sync & Health is a separate manual action for the same integration administrators. Capture-Pro calls core `POST /api/organisations/:orgId/modules/:productId/integrations/capture-pro/salesforce/competitors/extract` with the user's bearer token and `X-CapturePro-Service-Key`. Core applies the same service-key and administrator checks, then runs the fixed SOQL `SELECT Id, Comments__c, Competitor_Vessel__c, Competitor_Yard__c, Competitor__c, Won__c, Competitor_Name__c, Competitor_s_Bid_Price__c, Opportunity__c FROM Project_Competitor_Details__c` through the shared Salesforce client with the same controls. The Power Query source used API version 48; the sync uses `v63.0`, the same version as the other extracts. As in that source, there is no filter, so all records up to 50,000 are imported.

Capture-Pro stores the records in `salesforce_competitors`, one row per organisation and Salesforce `Id`. The nine fields keep their native Salesforce types in `fields`, so Won stays a boolean and the bid price stays a number. Typed columns hold the competitor name, the bid price as `numeric`, and the opportunity and competitor-account IDs. A `Competitor__c` value that is not a Salesforce ID is kept in `fields` only. Sync semantics match Accounts: a per-organisation competitor advisory lock, a `Competitor` run, batched upserts, and retention of records no longer returned, with `in_extract = false` and `removed_from_extract_at`. Opportunities and Accounts are not touched. Audit details contain counts only, never bid prices.

The list left-joins, within the same organisation, the synced `salesforce_opportunities` row (opportunity number and name) and the `salesforce_accounts` row (account name). When a linked record has not been synced, it shows the Salesforce ID instead. **Capture-Pro > Salesforce > Competitors** (`/app/product/Capture-Pro/competitors`) is read-only for the same five roles and has the same table behavior as Accounts. Won uses a Yes/No filter and the bid price accepts numeric expressions. Competitor bid prices are commercially confidential.

Migration `apps/capture-pro-service/drizzle/0003_salesforce_competitors.sql` is additive. It creates `salesforce_competitors` with an organisation/Salesforce ID unique index, an organisation/extract/name index, an organisation/opportunity index, and a foreign key to `salesforce_sync_runs`. It does not alter existing tables. Rollback leaves the table in place for audit; reverting the application stops competitor syncs.
### Salesforce bid budget sync

**Sync bid budgets now** on Sync & Health is a separate manual action for the same integration administrators. Capture-Pro calls core `POST /api/organisations/:orgId/modules/:productId/integrations/capture-pro/salesforce/bid-budgets/extract` with the user's bearer token and `X-CapturePro-Service-Key`. Core applies the same service-key and administrator checks, then runs this fixed SOQL through the shared Salesforce client (`v63.0`) with the same controls: `SELECT Id, Opportunity__c, Actual_Bid_Cost__c, Compensation__c, Opportunity_Bid_Budget_Recovery_Year__c, Budgeted_Hours__c, Forecasted_Spend__c, Actual_Bid_Budget__c, Additional_Pre_Contract_1__c, Additional_Pre_Contract_2__c, Additional_Pre_Contract_3__c, Forecast_Purpose__c, PG1_Pre_Contract__c FROM Opportunity_Bid_Budget__c`. It selects the Power Query's twelve columns plus `Id`. An opportunity can have several bid budget records, so `Id` is the stable record key. There is no filter, so all records up to 50,000 are imported.

Capture-Pro stores the records in `salesforce_bid_budgets`, one row per organisation and Salesforce `Id`. The selected fields keep their native Salesforce types in `fields`. A typed `opportunity_salesforce_id` column supports the link; an `Opportunity__c` value that is not a Salesforce ID is kept in `fields` only. Sync semantics match Competitors: a per-organisation bid-budget advisory lock, a `Bid Budget` run, batched upserts where the last duplicate `Id` wins, and retention of records no longer returned, with `in_extract = false` and `removed_from_extract_at`. No other Salesforce table is touched. Audit details and logs contain counts only, never cost, budget, spend, or hour values.

The list left-joins the synced `salesforce_opportunities` row within the same organisation, adding the opportunity number and name. When that opportunity is not in the synced market-analyst extract, the Salesforce ID is shown instead. **Capture-Pro > Salesforce > Bid Budget Data** (`/app/product/Capture-Pro/bid-budgets`) is read-only for the same five roles and has the same table behavior as Competitors. In the live extract, all eleven value fields, including Forecast_Purpose__c and PG1_Pre_Contract__c, are numeric Salesforce fields and accept numeric filter expressions; Recovery Year is text and uses a dropdown. Bid costs, budgets, and spend are commercially confidential.

Migration `apps/capture-pro-service/drizzle/0004_salesforce_bid_budgets.sql` is additive. It creates `salesforce_bid_budgets` with an organisation/Salesforce ID unique index, an organisation/extract index, an organisation/opportunity index, and a foreign key to `salesforce_sync_runs`. It does not alter existing tables. Rollback leaves the table in place for audit; reverting the application stops bid budget syncs.
### Salesforce fabrication yard sync

**Sync fabrication yards now** on Sync & Health is a separate manual action for the same integration administrators. The Power Query source returns every column of `Fabrication_Yard__c` with no filter. SOQL has no unrestricted "all fields" query, so core describes the object on each sync and then queries the discovered fields. Capture-Pro calls core `POST /api/organisations/:orgId/modules/:productId/integrations/capture-pro/salesforce/fabrication-yards/extract` with the user's bearer token and `X-CapturePro-Service-Key`. Core applies the same service-key and administrator checks. It then calls `GET /services/data/v63.0/sobjects/Fabrication_Yard__c/describe` on the trusted instance, with redirects disabled and the 30-second timeout.

Core keeps fields that are not deprecated or hidden and whose types return a single JSON value: id, string, textarea, picklist, multipicklist, combobox, reference, boolean, currency, double, percent, int, long, date, datetime, time, email, phone, and url. Compound `address` and `location` fields are skipped; their component fields are queried individually. `base64` file content and `encryptedstring` fields are not imported. Every field name must match `^[A-Za-z][A-Za-z0-9_]{0,79}# Application Logic Reference

This document is the canonical compact context for engineers and AI models working on Designer Platform. It describes implemented behavior, ownership boundaries, request flows, and important invariants. Read the source before changing behavior when this document and code differ.

## 1. System purpose

Designer Platform is a multi-tenant control plane plus product modules:

- **Core platform:** users, authentication, organisations, memberships, teams, projects, roles, menus, product assignment, settings, and concurrent sessions.
- **CreditGuard:** financial-security requests, business entities, reports, and a process guide.
- **Capture-Pro:** upcoming-bid intake, governed Commercial Intelligence source metadata, versioned 14-section capture plans, agent-run records, and audit evidence.
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
| Capture-Pro | 4103 | `/api` | `capturepro` |

The frontend calls relative paths. Vite forwards `/api/*` to core and rewrites `/creditguard-api/*` to CreditGuard `/api/*` and `/capturepro-api/*` to Capture-Pro `/api/*`.

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
- `OrgProvider` loads the authenticated user's active memberships from `GET /api/organisations/mine`, validates persisted context, and stores the full selected organisation object under `selectedOrgId`.
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
4. `OrgProvider` automatically selects an authorised organisation when exactly one membership is returned. With multiple memberships, the authenticated shell blocks tenant-scoped content until the user explicitly selects an organisation. A persisted selection is restored only when it remains in the authorised membership list.
5. `SessionProvider` decodes the JWT `exp` claim and schedules session-expiry notification.
6. Logout or account deletion clears the local token and user.

The signup password minimum is eight characters. Duplicate registration maps HTTP 409 to a specific message. Sign-in failures use a generic invalid-credentials message.

### Azure AD B2C

Microsoft sign-in uses MSAL redirect. For API requests, the client first checks the local JWT, then calls `acquireTokenSilent`, and finally `acquireTokenPopup`. Core validates B2C tokens using issuer/JWKS configuration and performs just-in-time provisioning. If a user with the same email already exists, first B2C login links the B2C object identifier to that record.

### Optional OIDC

When `OIDC_WELL_KNOWN`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` are configured, `/signin` shows a button labeled with `OIDC_PROVIDER_LABEL`. The browser starts the authorization-code flow at `/api/auth/oidc/start`; the backend validates a short-lived state cookie, exchanges the code at the provider token endpoint, validates the ID token against the discovered issuer, audience, and JWKS, provisions or links the user, and issues the existing platform-local JWT. A newly provisioned external identity receives an active `Member` membership in **McDermott IT** and the global `General User` role only; it receives no product role, team, project, module designation, or licence allocation. The default callback is `http://localhost:4000/api/auth/oidc/callback`, and the callback returns the JWT only in the frontend URL fragment before the SPA stores the normal local session. `OIDC_SKIP_VERIFY=true` is limited to non-production environments and skips ID-token signature validation; it must not be enabled for production authentication.

### API failure behavior

An authenticated core request receiving HTTP 401 emits a session-expired event once. Other authenticated failures emit a generic system error notification and throw `API <status>: <body>` to the caller.

## 5. Authorisation and navigation

Core role names seeded by default:

- `Global Administrator`
- `Organisation Administrator`
- `General User`
- `CreditGuard Requestor`
- `CreditGuard Reviewer`

CreditGuard roles are module-specific: they reference the CreditGuard product and are assigned once per user rather than per organisation. Ordinary organisation Members see a product and can open its licensed session only when they have a matching product-scoped role; `General User` alone does not grant module access. Organisation Owner/Admin memberships and Global Administrator retain administrative product visibility. CreditGuard Requestor and Reviewer can open the workspace, product overview, and Requests only when the selected organisation has an active CreditGuard module assignment. Requestors can create and manage requests. Reviewers can review requests and open Reports. Application Setup remains limited to global and organisation administrators. Screen grants are navigation controls; guarded CreditGuard workflow endpoints introspect the bearer token through core and verify organisation membership because hiding navigation is not authorization.

Global role assignments have no organisation ID. Organisation authority is also represented by membership: `Owner`, `Admin`, or `Member`. The default seeded tenant is **McDermott IT**; the core seed converges the database to that single organisation, assigns every product module to it, and places all existing users in it. New local and B2C-provisioned users, as well as users created through global administration, receive an active McDermott IT membership by default.

The sidebar is data-driven from `GET /api/menus/mine?orgId=...`. Menu trees contain route, icon, display order, product link, and optional `readonly`/`editable` access. Product-linked menus are returned only when the selected organisation has an active module assignment within its validity window. The frontend hides organisation-administration routes from ordinary members and global-only routes outside the global organisation. Backend guards remain the security boundary; hiding navigation is not authorization.

The authenticated header exposes Help on every screen. It maps the current pathname to the nearest isolated topic, including dynamic CreditGuard request form, approver, and approval routes, and passes the originating URL so users can return directly to their work. Help content is static frontend documentation and does not reveal inaccessible application records or grant access to documented screens.

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
| `/app/product/Capture-Pro` | Capture-Pro command center and pursuit lifecycle |
| `/app/product/Capture-Pro/opportunities` | Salesforce Opportunities extract (read-only) |
| `/app/product/Capture-Pro/accounts` | Salesforce Accounts extract (read-only) |
| `/app/product/Capture-Pro/competitors` | Salesforce Project Competitor Details with linked opportunity and account names (read-only) |
| `/app/product/Capture-Pro/bid-budgets` | Salesforce Opportunity Bid Budget records with linked opportunity names (read-only) |
| `/app/product/Capture-Pro/fabrication-yards` | Salesforce Fabrication Yard records with every queryable field discovered from Salesforce (read-only) |
| `/app/product/Capture-Pro/salesforce-sync` | Salesforce sync actions, per-type connection health, and run log |
| `/app/product/Capture-Pro/data-library` | Governed TG3 source metadata and freshness catalog |
| `/app/product/Capture-Pro/agents` | Specialist-agent responsibilities and orchestration boundaries |
| `/app/product/Capture-Pro/plans` | Capture-plan commissioning and list |
| `/app/product/Capture-Pro/plans/:planId` | Version, 14 section states, run history, and plan audit evidence |
| `/app/product/Capture-Pro/governance` | Tenant-scoped Capture-Pro audit trail and control summary |
| `/app/help` | Searchable application and CreditGuard documentation grouped into isolated topics |
| `/app/help/:topicId` | Direct contextual help for a specific screen or workflow |
| `/app/resources` | Compatibility redirect to `/app/help` |
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
| `/admin/connections` | Encrypted PostgreSQL or Microsoft SQL Server product database connection settings |
| `/admin/licenses` | Organisation-product license assignment |
| `/admin/settings` | Default org, session timeout, branding/banner |
| `/admin/email-logs` | Global Administrator view of outbound module email attempts and delivery status |
| `/admin/email-templates` | Global Administrator editor for product email event subjects and bodies |
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

Request fields include request number, instrument type, applicant, beneficiary name, beneficiary address, amount, currency, status, requester, due/review dates, notes, and instrument-specific details. Letter of Comfort and Parent Company Guarantee retain the company-guarantee entity, liability, obligations, narrative, and PCG-language controls. The request-list response projects the nullable detail `parentEntityType`; its Instrument column displays `Parent Company Guarantee - MIL` when that value is `mil`, while all other instrument labels remain unchanged. Standby Letter of Credit, Bank Guarantee, and Documentary Letter of Credit instead require the bank-instrument fields from the controlled LC/BG request form: US-bank acceptance and conditional country, language source, new/amendment issue type, instrument value and dates, one purpose, beneficiary contacts, issued-on-behalf entity, billing and contract details, and delivery method. Other purpose, amendment, non-US-bank, and other-delivery fields are required only when their controlling selection applies. For these three bank instruments, request `amount` is the Instrument Value, `due_date` is Date Instrument Required, and Contract Value and Expiry Date are stored separately. Beneficiary name remains on the request summary while beneficiary address is stored in `request_details.beneficiary_address`. Status values are `Draft`, `Under Review`, `Reviewed`, `Approved`, `Issued`, `Rejected`, and `Closed`; amount and stored contract/amendment amounts are non-negative.

Migration `0019_nasty_absorbing_man.sql` adds the LC/BG fields to `request_details` as nullable columns so existing requests remain valid. The service applies conditional completeness and enum validation only to the three named bank instrument types; LOC/PCG validation is unchanged. Rollback requires deploying the previous frontend, service validation, and PDF generator before dropping these columns in a separately approved destructive migration. Existing bank-instrument records must be exported or migrated before any column removal.

New requests do not expose attachment controls. The request must first be saved as a Draft, after which PDF and DOCX documents can be uploaded from the edit form using the generated request ID. Attachment metadata is stored in `request_attachments`; binary content is stored through the configured local-filesystem or private Azure Blob provider. Users can open PDFs in a browser tab, download/open DOCX files through the configured desktop application, and delete attachments while the request is Draft or Under Review. Reviewed requests allow opening existing attachments but reject upload and deletion in both the UI and product API. A Draft cannot transition to `Under Review` without at least one attachment and an eligible Module User assigned the `CreditGuard Reviewer` role; the dedicated submit action saves current edits, records the reviewer snapshot, and atomically changes the CreditGuard request status. Uploads default to 10 MB per document and 10 documents per request, configurable through environment variables.

Attachment routes are `GET/POST /requests/:id/attachments`, `GET /requests/:id/attachments/:attachmentId/content`, and `DELETE /requests/:id/attachments/:attachmentId`. Every lookup includes the request and organisation identifier. Workflow identity endpoints use `ProductAuthGuard`, which forwards the bearer token to core `GET /auth/me` and `GET /organisations/mine`; `CORE_API_URL` configures that trusted core endpoint. Attachment reads and Under Review mutations still rely on the approved calling tier and organisation-scoped lookup, so the CreditGuard service must not be exposed directly.

Business entities contain job-code entity, segment, legal entity name, ledger, and inventory organisation metadata. `(jobCodeEntity, segment1, legalEntityName)` is unique. The page finds its own menu grant; `readonly` hides mutation controls.

Module Users is restricted to administrators with its Application Setup menu grant. The page opens on Approvers. Registered Users is read-only and can be filtered by assigned product role. Registered users come from the active team assigned to the organisation's CreditGuard module; when no team is assigned, all active organisation members are eligible. Core serves these rows and their product role assignments through `GET /organisations/:orgId/modules/:productId/users`, after verifying the authenticated administrator's organisation authority and active module assignment.

Integration is restricted to organisation Owners/Admins and Global Administrators with its CreditGuard Application Setup menu grant. Core routes `GET/PUT /organisations/:orgId/modules/:productId/integrations/signit` verify that authority and an active organisation module assignment. Configuration contains a required HTTP or HTTPS Signit Base URL and an authorization key encrypted with AES-256-GCM using `CONNECTION_SECRET_KEY`; the Base URL may be the server root or end in `/api/v2`, and both forms resolve to one `/api/v2/envelope/create` path. GET and PUT responses expose the non-secret Base URL, `authorizationKeyConfigured`, and update metadata. The browser never receives a saved key or ciphertext, a blank replacement retains an existing key, and an explicit clear operation removes it. Server-side consumers may decrypt the key only immediately before an outbound Signit request and must not log it. HTTPS remains recommended outside trusted local development networks.

The Edit Request reviewer list is served by authenticated core route `GET /notifications/reviewers?orgId=...&productId=...` and contains only active, same-organisation, team-eligible Module Users assigned the product's `CreditGuard Reviewer` role. Guarded CreditGuard route `POST /requests/:id/submit-for-review` permits only the requestor or an organisation/global administrator. For a Draft, it requires the exact generated `<request number> latest.pdf` attachment, stores the selected reviewer's user ID, name, and email snapshot, and sets `submitted_for_review_at` and status `Under Review` in one product-database transaction. Until review is completed, the same authorized actors may select a different eligible reviewer; the locked transaction keeps status `Under Review`, replaces the reviewer snapshot, refreshes `submitted_for_review_at`, and returns the previous reviewer ID. Request fields remain immutable while Under Review, but attachments remain editable. Core route `POST /notifications/reviewer-reassignment` resolves the former reviewer from organisation membership, revalidates the replacement against the active CreditGuard Reviewer role, and sends the former reviewer a pullback notice logged as `Review Reassignment`. The replacement separately receives the normal `Request Review` notification. A failure in either email is visible and logged without reverting the auditable reviewer change or suppressing the other delivery attempt.

The Attachments block action **Attach Request** calls guarded `POST /requests/:id/attach-request`, creating a new McDermott-branded PDF from persisted request and business-detail fields and storing it through the private document provider as `<request number> latest.pdf`. Each page header embeds the approved McDermott logo immediately before the McDermott name at the same visual height as the brand text. LOC/PCG documents preserve the compact company-guarantee grid; the three bank instrument types use an LC/BG layout containing their instrument, beneficiary, contract, conditional amendment, and delivery fields. Selected entity identifiers are resolved server-side to legal entity names; generation fails if a referenced entity is no longer available. For a Draft, the frontend saves current form values before generation. Repeating the action atomically replaces the previous latest attachment and removes its old stored object after commit. The generated PDF does not contain approver identities, approval values, or approval dates. Requests already beyond Draft that predate this requirement and have no generated PDF receive a non-downloadable `previously attached` compatibility marker in attachment listings; no broken storage metadata is persisted. Guarded `POST /requests/:id/review-done` independently verifies active organisation membership and changes only an Under Review request assigned to the authenticated current reviewer to Reviewed, recording reviewer identity/time. A former reviewer loses completion authority immediately after reassignment. Existing uploaded files remain separate attachments. Generic request updates reject both Under Review and Reviewed records.

After the status transition, authenticated core route `POST /notifications/request-review` revalidates the reviewer against the organisation, active module allocation, assigned team, and `CreditGuard Reviewer` role. It sends base request identification through the default enabled SMTP configuration, falling back to enabled priority order. New SMTP profiles default Authentication to `None`, which uses an unauthenticated relay. Selecting `Username and password` requires both credential values; switching back to `None` removes the stored encrypted password. TLS certificates are verified by default. A Global Administrator can temporarily enable `Ignore TLS certificate errors (unsafe)` per SMTP profile; `NEXT_PRIVATE_SMTP_UNSAFE_IGNORE_TLS=true` is an emergency server-wide override for all profiles. Both options set Nodemailer's `tls.rejectUnauthorized` to `false` without disabling TLS itself. Installing the issuing CA through the runtime trust store remains the preferred fix. Delivery failure does not revert the auditable `Under Review` transition: the user receives a warning and Global Administrators can inspect the failed attempt. Core writes sent and failed attempts to `email_delivery_logs`, including module, event, request reference, recipient, subject, SMTP profile name, provider message ID, bounded safe error text, initiating user, and timestamps. Safe error details include the provider message, error code, SMTP status and response, SMTP command, and relevant network operation/server fields; credential-like values and credential-bearing URLs are redacted before storage. Passwords, stack traces, and message bodies are never logged. `GET /notifications/email-logs` is Global Administrator-only and returns the latest 200 attempts with optional module and status filters. Global Administrators can retry a failed attempt through `POST /notifications/email-logs/:id/retry`; the server uses the stored recipient and reference, rejects non-failed IDs, and creates a new immutable delivery-log row for the retry result.

Approvers are standalone CreditGuard contacts rather than platform user identities. `GET/POST /approvers`, `PATCH /approvers/:id`, and `DELETE /approvers/:id` require an organisation identifier, and every lookup and mutation is scoped by it. Approver email is unique within an organisation. After review, the requestor or an organisation/global administrator can use guarded `GET/PUT /requests/:id/approver-assignments` to maintain an ordered approval chain. New chains default required titles from instrument type, PCG language, and parent entity type; users may add, edit, delete, and reorder pending rows. Title-only rows persist before representatives are assigned. Persisted rows contain sequence, title, optional same-organisation representative, server-controlled approval status, action date, and approval link. Sequence values must be contiguous from one, titles must come from the supported list, and every assigned representative is revalidated against the request organisation.

The requestor or an administrator can finalize a saved, fully assigned chain through guarded `POST /requests/:id/approver-assignments/finalize` while the request is `Reviewed`. A warning requires confirmation before the server records `approvers_finalized_at` and `approvers_finalized_by_user_id`; finalized chains reject structural updates. Organisation Owners/Admins and Global Administrators can use guarded `POST /requests/:id/approver-assignments/modify` to clear finalization only while the request remains `Reviewed` and no approver has actioned the chain. Once any approver has approved or rejected, both UI and API permanently prevent structural changes to preserve audit evidence. `requested_by_user_id` is nullable for migration compatibility; an administrator must assign or finalize approvers for a legacy request with no attributable requestor identity. Migration `0016_milky_paladin.sql` adds nullable finalization audit columns without changing existing chains. Rollback removes the UI and endpoints first; retain the audit columns unless finalized-state evidence is no longer required and its loss has been approved.

For a selected `Reviewed` request, the Requests page shows `Initiate Approval`; after successful submission the same action is labeled `Approval Status`. Draft and Under Review requests do not expose this action. The approval screen lists request PDF attachments only, instrument type, beneficiary, the finalized ordered approvers, and their server-owned action status/date/link. Guarded `POST /requests/:id/initiate-approval` accepts selected attachment IDs, revalidates request ownership, `Reviewed` status, finalized and fully assigned pending approvers, and PDF ownership, then reads document bytes from private CreditGuard storage. The Signit title is `<instrument type> - <beneficiary>`, `externalId` is the CreditGuard request ID, `meta.signingOrder` is `SEQUENTIAL`, and each assigned representative becomes an `APPROVER` recipient whose numeric `signingOrder` equals the persisted contiguous approver sequence.

CreditGuard forwards the generated payload and selected PDFs to the authenticated core Signit broker while holding a row lock to prevent duplicate concurrent initiation. The broker requires both the user's bearer token and `CREDITGUARD_INTERNAL_API_KEY`, revalidates active organisation membership/module allocation and PDF content, decrypts the Signit authorization key only immediately before calling the normalized `/api/v2/envelope/create` endpoint, and never returns the key. After creation, core posts `{ envelopeId }` to `/api/v2/envelope/distribute` and requires the response envelope ID plus one unique HTTP(S) signing URL for every distinct requested recipient email. CreditGuard independently validates that complete email set, stores each URL in the matching approver assignment's `approval_link`, then records `signit_envelope_id`, `approval_initiated_by_user_id`, and `approval_initiated_at` and changes status to `Sent for Approval`. Failures return a bounded broker message, roll back CreditGuard persistence, and leave the request Reviewed. Sent requests are immutable through request, attachment, approver, and list-edit APIs. The Approval Status screen exposes Refresh, which calls guarded `POST /requests/:id/refresh-approval`; core retrieves `/api/v2/envelope/:envelopeId`, normalizes signed/approved/completed recipients to `approved`, rejected/declined recipients to `rejected`, and all other provider states to `pending`. CreditGuard requires exactly the request's approver email set before updating `approval_status` and valid provider action timestamps, leaving the request workflow status unchanged. Organisation Owners/Admins and Global Administrators can recall a sent request from its Approval Status screen. Guarded `POST /requests/:id/recall-approval` locks and revalidates the request before the core broker posts `{ envelopeId }` to Signit's normalized `/api/v2/envelope/delete`; only a Signit `{ success: true }` response clears `signit_envelope_id` and approver signing links and restores `Reviewed`, while initiation audit fields remain as historical evidence. Any rejection or ambiguous response leaves the request unchanged. Migration `0017_yellow_magneto.sql` adds nullable Signit audit fields. Deploy core and CreditGuard with the same long random service key before enabling initiation, refresh, or recall; rollback removes the Refresh UI and refresh endpoints first, with no data migration required.

Reports derive, in the browser, total/open/approved request counts, counts by status and instrument, amount totals grouped by currency, active guarantees grouped by guaranteeing entity, and upcoming reviews across four calendar quarters. Instrument counts split MIL Parent Company Guarantees into `Parent Company Guarantee - MIL`; other Parent Company Guarantees retain the base instrument label.

For approval refreshes, workflow status remains unchanged only while one or more assigned recipient is pending or rejected. When the complete normalized recipient set is approved, CreditGuard atomically changes the request from `Sent for Approval` to `Approved` in the same transaction that records recipient actions. The Approval Status screen reflects this transition immediately and remains available from the Requests page for completed approvals.

Approved requests are immutable audit records. Request PATCH and deletion, generated or uploaded attachment creation, attachment deletion, inline notes editing, and repeated completed webhook writes are blocked after approval. Attachment upload and deletion lock the request row and recheck status in the metadata transaction so they cannot race the transition to `Approved`; existing attachment content remains viewable for audit.

Signit calls the public organisation/module webhook with `X-Documenso-Secret`. Core processes `DOCUMENT_SIGNED` and `DOCUMENT_COMPLETED`; other event names are authenticated and acknowledged without changing application state. For supported events, `payload.id` is the positive numeric document ID and `payload.envelopeId` is the non-empty envelope identifier linked to CreditGuard. Required document fields are `id`, `envelopeId`, `status`, `title`, `source: "DOCUMENT"`, and a non-empty `recipients` array. Completion also requires a valid `completedAt`. Each recipient requires a positive `id`, the same `envelopeId`, valid `email`, non-empty `name`, `role`, `readStatus`, `signingStatus`, and `sendStatus`; actioned recipients require a valid `signedAt`. Duplicate recipient emails, mismatched envelope IDs, or a completed document with unsigned recipients are rejected. After payload validation, supported webhook events invoke the same authoritative Signit envelope-status fetch used by the Approval Status Refresh action, then forward that normalized result to CreditGuard's internal status action. The legacy `X-Webhook-Token` plus top-level `envelopeId` contract remains accepted during migration and uses the same refresh path.

### Email templates

Global Administrators manage product event templates through `GET /notifications/email-templates` and `PUT /notifications/email-templates/:id`. Subjects and bodies accept `{{variableName}}` placeholders from an event-specific allowlist. Updates reject unknown placeholders, and delivery fails explicitly when a runtime value is unavailable. Seeded CreditGuard events are `request-review` and `review-reassignment`; repeat seeds add missing defaults without overwriting administrator edits.

Rendered bodies are excluded from delivery-log responses and retained only as AES-256-GCM ciphertext using `CONNECTION_SECRET_KEY`, allowing failed delivery retries to resend the exact original content. Legacy rows without ciphertext retain the generic retry fallback. Rollback removes the route and event-template reads first, then reverts core migration `0026_brave_norrin_radd.sql`; retaining the encrypted retry column during a forward recovery avoids losing retry fidelity.

## 10. Capture-Pro logic

Capture-Pro is registered in core as a licensed product with product-scoped `Capture-Pro Manager`, `Capture-Pro Analyst`, and `Capture-Pro Module Administrator` roles. Global and organisation administrators retain administrative access. Its menu contains Overview, a **Salesforce** submenu with **Opportunities**, **Accounts**, and **Sync & Health**, Data Library, Agent Workspace, Capture Plans, Governance, and administrator-only Integrations. Core continues to own identities, role assignments, organisation membership, product assignment, project allocation, and concurrent-seat sessions.

The Capture-Pro service owns Capture-Pro domain records in the `capturepro` PostgreSQL database. Every domain endpoint requires a bearer token, introspects identity and active organisation memberships through core, and rejects an `orgId` outside the authenticated user's memberships. Product menu visibility is not backend authorization. The service must remain behind the approved calling tier until independent token verification and product-role enforcement are hardened.

An opportunity records preliminary Pre-ITT pursuit information and is unique by opportunity number within an organisation. The `/app/product/Capture-Pro/opportunities` screen now shows Salesforce Opportunities, and the UI no longer offers manual opportunity creation. Existing Capture-Pro opportunity records, their `GET/POST /api/opportunities` API, and Capture Plans commissioning from those records are unchanged. One capture plan may be commissioned per opportunity. Commissioning creates version 1 and CP-01 through CP-14 in one transaction. Versions, sections, runs, and audit events are separate records so later refinement preserves evidence instead of overwriting it.

Capture-Pro domain routes are guarded and organisation-scoped:

| Method and route | Behavior |
| --- | --- |
| `GET /api/overview` | Tenant metrics and recent opportunities |
| `GET/POST /api/opportunities` | List or create preliminary Capture-Pro opportunities; creation is retained in the API but no longer offered in the UI |
| `GET /api/data-sets` | List and idempotently initialize the TG3 metadata catalog |
| `GET/POST /api/data-sets/:dataSetId/documents` | List or register metadata-only HTTPS source references |
| `GET/POST /api/plans` | List or commission one plan per opportunity |
| `GET /api/plans/:planId` | Current version, sections, queued runs, and audit evidence |
| `GET /api/plans/:planId/source-documents` | General and opportunity-specific governed citation sources |
| `PATCH /api/plans/:planId/sections/:sectionCode` | Update current-version content, citations, and section status |
| `POST /api/plans/:planId/versions` | Copy current sections and citations into the next version transactionally |
| `POST /api/plans/:planId/agent-runs` | Record a validated queued run; does not execute a model |
| `PATCH /api/plans/:planId/status` | Apply a valid plan workflow transition and record audit evidence |
| `GET /api/audit` | Latest tenant audit evidence |
| `POST /api/salesforce-opportunities/sync` | Integration administrators import the Salesforce opportunity extract (see below) |
| `GET /api/salesforce-opportunities` | Capture-Pro viewers list stored Salesforce opportunities, including all synced fields; `includeRemoved=true` adds records no longer in the extract |
| `GET /api/salesforce-opportunities/sync-status` | Capture-Pro viewers read the latest sync run |
| `GET /api/salesforce-opportunities/sync-runs` | Capture-Pro viewers read per-type connection health, each type's last run, and the latest 50 runs with their type |
| `POST /api/salesforce-accounts/sync` | Integration administrators import all Salesforce Accounts (see below) |
| `GET /api/salesforce-accounts` | Capture-Pro viewers list stored Salesforce Accounts; `includeRemoved=true` adds accounts no longer returned |
| `POST /api/salesforce-competitors/sync` | Integration administrators import all Salesforce Project Competitor Details (see below) |
| `GET /api/salesforce-competitors` | Capture-Pro viewers list stored competitor records with linked opportunity and account names; `includeRemoved=true` adds records no longer returned |
| `POST /api/salesforce-bid-budgets/sync` | Integration administrators import all Salesforce Opportunity Bid Budget records (see below) |
| `GET /api/salesforce-bid-budgets` | Capture-Pro viewers list stored bid budget records with linked opportunity names; `includeRemoved=true` adds records no longer returned |
| `POST /api/salesforce-fabrication-yards/sync` | Integration administrators describe and import all Salesforce Fabrication Yard records (see below) |
| `GET /api/salesforce-fabrication-yards` | Capture-Pro viewers list stored fabrication yards and their discovered field definitions; `includeRemoved=true` adds records no longer returned |

Valid plan transitions are Draft to In Review, In Review to Draft or Authorised, and Authorised to Archived. Only organisation Owners/Admins and Global Administrators may authorise or archive a plan. Authorised and archived plans reject section edits, new versions, and agent-run requests. Citation document IDs must resolve to the active organisation. Creating a successor version locks the plan row, copies the current version, increments `current_version`, and writes audit evidence in one transaction.

The Data Library is a tenant-scoped metadata catalog derived from the supplied TG3 Commercial Intelligence mock. It records data-set names, source counts, source location, freshness policy, and manually registered HTTPS source-document references. Dataset and optional opportunity ownership are revalidated against the active organisation, and source registration creates audit evidence. Capture-Pro does not copy SharePoint files or credentials. Microsoft 365 ingestion requires an approved application identity, least-privilege site access, retention and data-classification review, and licensed-source review. The disabled-by-default metadata-only design and approved target are documented in [Capture-Pro SharePoint setup](CAPTUREPRO_SHAREPOINT_SETUP.md).

The Agent Workspace describes specialist responsibilities behind one orchestrator. A user may queue a validated run record for one of the five named agents from a plan, but this release does not execute that run or claim a model runtime is configured. Deterministic calculations, controlled rates, and FX remain validated-service outputs. Bid and vessel commitments remain human-authorised decisions.

Migration `apps/capture-pro-service/drizzle/0000_overconfident_doctor_spectrum.sql` creates four enums and eight additive tables: opportunities, data sets, source documents, capture plans, plan versions, plan sections, agent runs, and audit events. It creates tenant and ownership indexes only inside `capturepro`; it does not modify other product schemas. Deployment order is: provision `capturepro`, apply its migration, deploy Capture-Pro, deploy core and run the idempotent seed, then deploy the frontend. Rollback is: remove route and menu access, stop Capture-Pro traffic, revert application deployments, and retain the database for audit and recovery. Dropping tables or the database requires separate owner and DBA approval.

### Integration configuration

`/app/product/Capture-Pro/integrations` is inside the existing licensed Capture-Pro route. The core backend, not the product service, owns its API connection settings in the existing `organisation_product_integrations` table. No new table, migration, or product-service trust boundary is introduced.

The core endpoint prefix is `/api/organisations/:orgId/modules/:productId/integrations/capture-pro`:

| Method and suffix | Behavior |
| --- | --- |
| `GET /` | Read Salesforce metadata and credential-configured flags; never return secrets |
| `PUT /salesforce` | Save OAuth 2.0 Client Credentials settings and an encrypted Client Secret |
| `PUT /spinergie` | Save or replace an encrypted API Key; no other fields are accepted |
| `DELETE /salesforce` | Remove only the selected organisation's Salesforce configuration |
| `DELETE /spinergie` | Remove only the selected organisation's Spinergie configuration |

Every endpoint requires the normal core bearer authentication and checks the exact active Capture-Pro product, active organisation, and module validity window. Global Administrators may manage the selected active assignment. Other callers must have active membership in that organisation and either Owner/Admin membership or a `Capture-Pro Module Administrator` role assigned to the exact product, globally or within the selected organisation. A similarly named role for another product, an organisation administrator role without the required membership, and Manager/Analyst roles alone do not authorize credential access. Sidebar grants do not replace these checks. The seed creates the new role and menu idempotently; it does not assign the administrator role to users.

Salesforce accepts `authType: "OAuth2.0"`, `grantType: "client_credentials"`, `accessTokenUrl`, `clientId`, and optional `clientSecret`. Token URLs must use HTTPS on a Salesforce subdomain and the `/services/oauth2/token` path, without user information, nonstandard ports, queries, or fragments. Initial configuration requires a secret. Omitting it keeps the saved secret only when the client ID and URL are unchanged; changing either requires a replacement secret. Spinergie accepts only `apiKey`. Unknown, blank, null, oversized, or unsupported inputs are rejected. Backend DTOs follow the core workspace's local contract pattern because its current `rootDir` does not allow importing TypeScript source from the shared workspace.

Salesforce client credentials are stored together as an AES-256-GCM encrypted payload; its token URL remains in `base_url`. Spinergie uses the encrypted secret column with no base URL. Both use the existing `CONNECTION_SECRET_KEY`; missing or invalid key configuration fails rather than storing plaintext. Only configured flags, Salesforce client ID/token URL, and update timestamps are returned, with `Cache-Control: no-store`. Browser secret fields are password inputs, clear after successful writes, and are not stored in browser storage. Changing organisation unmounts the form and discards pending UI results and entered credentials. Safe server logs record provider, organisation, product, and actor identifiers, never credentials.

Saving configuration does not contact either provider. A configured flag means credentials are saved, not that a live connection was verified. Spinergie credentials are stored only; no Spinergie data is retrieved yet. Threat controls cover cross-tenant access, role/product substitution, secret disclosure, unsafe token URLs, and credential rotation.

Deployment: confirm the existing integration table migrations are applied and core's approved encryption key is configured; deploy core, apply the role/menu seed through the normal reviewed seed process, assign the new role explicitly through administration, then deploy the frontend. For an existing local installation, `npm run db:core:seed:capturepro-integrations` performs only the registration transaction against a loopback PostgreSQL connection, rejecting production mode and connection-target query overrides. It requires an existing Capture-Pro product, active parent menu, and base administrator roles, refuses conflicting role/menu ownership, and serializes repeat setup with a transaction advisory lock. It creates or repairs the Integrations menu and grants it and its parent to the existing global/organisation administrator roles and the dedicated module administrator role; no user role assignments, memberships, licences, products, or connection secrets are changed. It verifies the resulting menu through the existing menu resolver for a registered Global Administrator and currently valid organisation assignments, logging only safe counts. The full seed reuses the same registration helper. Refresh the sidebar after running it; an active Capture-Pro organisation assignment is still required. The full core seed also performs broader organisation convergence, so inspect its documented effects before running it against any shared environment. There is no data backfill or schema change. Rollback: revert these application changes, remove only the new menu/role grants through approved administration, and retain encrypted configuration rows and the encryption key for forward recovery. Do not reset databases or remove unrelated user work.

### Salesforce opportunity sync

An integration administrator starts a manual sync with **Sync opportunities now** on **Capture-Pro > Salesforce > Sync & Health** (`/app/product/Capture-Pro/salesforce-sync`). Integrations now contains only Salesforce and Spinergie credential settings and links to that screen. There is no scheduled sync. The flow keeps credentials in core and Salesforce domain data in Capture-Pro:

1. Capture-Pro `POST /api/salesforce-opportunities/sync` requires active organisation membership and Global Administrator, organisation Owner/Admin, or `Capture-Pro Module Administrator`. It obtains the Capture-Pro product ID from core `GET /api/products?orgId=...`, which enforces the active assignment, team restriction, and product-role binding. It never accepts a product ID from the client.
2. Capture-Pro calls core `POST /api/organisations/:orgId/modules/:productId/integrations/capture-pro/salesforce/opportunities/extract` with the user's bearer token and `X-CapturePro-Service-Key`. Core compares the service key with `CAPTUREPRO_INTERNAL_API_KEY` in constant time before reading data, then reapplies the integration-administrator and active-assignment checks.
3. Core decrypts the saved credentials, requests an OAuth 2.0 Client Credentials token from the saved My Domain token URL, and runs a fixed SOQL query through REST API `v63.0`. The query selects the same 49 Opportunity fields as the Power Query extract. Client input never reaches SOQL. Core accepts only an HTTPS `*.salesforce.com` instance URL with no credentials, port override, or path; follows only relative `nextRecordsUrl` query cursors; disables redirects; applies 30-second request timeouts; and stops after 500 pages or 50,000 records. It returns only the selected scalar fields and never returns the access token or provider error bodies. Use the My Domain token URL, such as `https://<domain>.my.salesforce.com/services/oauth2/token`, because Salesforce does not support Client Credentials through `login.salesforce.com`.
4. The SOQL filter is a superset: `Exclude_from_Market_Analyst_Reports1__c = false`, non-null `priority__c` and `Opportunity_Number__c`, and `RecordTypeId = '0120e000000UPzPAAW' OR Service_Agreement_Business_Line__c = 'Subsea & Floating Facilities'`. Capture-Pro then applies the exact case-sensitive Power Query rules. It excludes opportunity numbers beginning with uppercase `Q` or `M`, applies the four StageName replacements in order, replaces only null `Sub_Category_Product_Type__c` values with `TBA`, and derives `ProductTypeSubCategory` as `Floater` when the sub-category starts with `Floating`; otherwise, it is `Subsea`.

Capture-Pro stores the results in its own database, separately from manually entered Capture-Pro opportunities, which are never created or changed:

| Table | Contents |
| --- | --- |
| `salesforce_opportunities` | One row per organisation and Salesforce `Id` (unique). Typed display columns, the transformed and original StageName, numeric financial values, all 49 transformed fields plus `ProductTypeSubCategory` in `fields`, and extract-tracking timestamps |
| `salesforce_sync_runs` | Per-attempt status, actor, timing, received/matched/inserted/updated/removed counts, and a sanitized failure reason |

A successful sync runs in one transaction, guarded by a per-organisation advisory lock. It records the run, upserts matched records in batches, and marks previously current records that were not returned as `in_extract = false` with `removed_from_extract_at`. It never deletes them. A record that reappears is marked current again. Audit events contain the run ID and counts only, not opportunity or financial values. A failed attempt records a `Failed` run and audit event and leaves stored opportunities unchanged. A rejected bearer token records nothing.

Viewing requires active membership, core's Capture-Pro product check, and Global Administrator, organisation Owner/Admin, `Capture-Pro Module Administrator`, `Capture-Pro Manager`, or `Capture-Pro Analyst`. The list returns typed display columns plus the transformed `fields` payload for all 49 Salesforce fields and `ProductTypeSubCategory`. It excludes organisation and sync-run identifiers and uses `Cache-Control: no-store`. The **Opportunities** screen under the Salesforce menu (route unchanged, page title Salesforce Opportunities) shows key columns by default and has a column chooser for every field and a details panel for each record. The details panel shows all fields with their API names, the Salesforce stage before rule adjustments, and extract status. The table fills the remaining page height and scrolls independently, so its horizontal scrollbar, sticky headers, and pagination footer stay visible. Each visible column has a filter: yes/no fields and short picklists use dropdowns, including blank values; numeric fields accept `>`, `>=`, `<`, `<=`, `=`, or `a..b` ranges; identifier and free-text fields use contains matching. Filters on hidden columns are cleared. Users can combine search and filters, include records no longer in the extract, and page through results 100 at a time. All data is held in memory in the browser. Forecasted revenue, gross profit, competitor bid prices, and contract values are commercially confidential.

Migration `apps/capture-pro-service/drizzle/0001_salesforce_opportunities.sql` is additive. It creates the two tables, their organisation indexes, and a foreign key from opportunities to the last sync run. It does not alter existing tables. The core helper `registerCaptureProSalesforceMenus` creates or repairs the **Salesforce** submenu under the Capture-Pro menu at display order 2. It requires exactly one active Capture-Pro parent menu and moves an existing Salesforce group, including an earlier top-level one, into place while preserving its ID. Missing Capture-Pro parent grants are added read-only for the five roles, and existing parent grants are left unchanged. It moves the existing `/app/product/Capture-Pro/opportunities` menu into the group in place as **Opportunities**, preserving its ID, then adds **Accounts** (`/app/product/Capture-Pro/accounts`, order 2), **Competitors** (`/app/product/Capture-Pro/competitors`, order 3), **Bid Budget Data** (`/app/product/Capture-Pro/bid-budgets`, order 4), **Fabrication Yard** (`/app/product/Capture-Pro/fabrication-yards`, order 5), and **Sync & Health** (order 6). All five viewer and administrator roles receive read-only grants on the group, Opportunities, Accounts, Competitors, Bid Budget Data, and Fabrication Yard. On Sync & Health, Global Administrator, Organisation Administrator, and `Capture-Pro Module Administrator` receive editable grants, while Managers and Analysts receive read-only grants. The frontend shows the sync action only for editable access; the backend still enforces the integration-administrator check. Repeat runs restore these access modes. The helper deactivates, without deleting, the former separate `/salesforce-opportunities` menu; that frontend route redirects to `/opportunities`. Other custom role grants are preserved. `npm run db:core:seed:capturepro-integrations` runs this helper together with the Integrations menu registration, and the full seed runs both helpers.

**Sync & Health** derives API connection health separately for Opportunities, Accounts, Competitors, Bid Budget Data, and Fabrication Yard, using only recorded sync runs of that type, and makes no extra Salesforce calls. Health is **Healthy** when the latest run of that type succeeded, **Failing** when it failed, and **Not synchronized** when there are no runs. Each type panel shows the last successful and failed sync times, consecutive failures, the recent success rate, its own sync button, and full details for its last run. The shared log lists the latest 50 runs with a **Type** column, timing, duration, counts, and sanitized failure reasons. The log identifies only whether the current user started a run; user IDs are not returned.

### Salesforce account sync

**Sync accounts now** on Sync & Health is a separate manual action for the same integration administrators. Capture-Pro calls core `POST /api/organisations/:orgId/modules/:productId/integrations/capture-pro/salesforce/accounts/extract` with the user's bearer token and `X-CapturePro-Service-Key`. Core applies the same service-key and administrator checks, then runs the fixed SOQL `SELECT Id, Name, Type, Company_Short_Name__c FROM Account` through the shared Salesforce client. That client uses the same token, instance-URL, pagination, redirect, timeout, 500-page, and 50,000-record controls, and returns only those four fields. As in the Power Query source, there is no filter, so all Accounts are imported. More than 50,000 records fail explicitly without changing stored data.

Capture-Pro stores Accounts in `salesforce_accounts`: one row per organisation and Salesforce `Id`, with `name`, `type`, `company_short_name`, and extract-tracking columns. Duplicate Ids in one extract keep the last record. A successful run executes in one transaction under a per-organisation account advisory lock. It records an `Account` run, upserts in batches, and marks previously current Accounts that were not returned as `in_extract = false` with `removed_from_extract_at`. It never deletes them or touches Opportunities. Failures record a failed `Account` run and audit event. Audit details contain counts only.

**Capture-Pro > Salesforce > Accounts** (`/app/product/Capture-Pro/accounts`) is read-only for the same five viewer and administrator roles and uses core's Capture-Pro product check. It shares the Opportunities table behavior: the table fills the page height with sticky header filters; Type and short picklists use dropdowns, while Account Name and Salesforce ID use contains filters; and search, paging, the option to include removed records, and a details panel are available.

Migration `apps/capture-pro-service/drizzle/0002_salesforce_accounts.sql` is additive. It creates `salesforce_accounts` with an organisation/Salesforce ID unique index, an extract index, and a foreign key to `salesforce_sync_runs`. It adds `salesforce_sync_runs.object_type varchar(20) NOT NULL DEFAULT 'Opportunity'`, so existing runs are classified as Opportunity runs; this constant default does not rewrite the table. It also adds an organisation/type/start-time index. Rollback leaves both the table and column in place for audit; reverting the application stops account syncs.

### Salesforce competitor sync

**Sync competitors now** on Sync & Health is a separate manual action for the same integration administrators. Capture-Pro calls core `POST /api/organisations/:orgId/modules/:productId/integrations/capture-pro/salesforce/competitors/extract` with the user's bearer token and `X-CapturePro-Service-Key`. Core applies the same service-key and administrator checks, then runs the fixed SOQL `SELECT Id, Comments__c, Competitor_Vessel__c, Competitor_Yard__c, Competitor__c, Won__c, Competitor_Name__c, Competitor_s_Bid_Price__c, Opportunity__c FROM Project_Competitor_Details__c` through the shared Salesforce client with the same controls. The Power Query source used API version 48; the sync uses `v63.0`, the same version as the other extracts. As in that source, there is no filter, so all records up to 50,000 are imported.

Capture-Pro stores the records in `salesforce_competitors`, one row per organisation and Salesforce `Id`. The nine fields keep their native Salesforce types in `fields`, so Won stays a boolean and the bid price stays a number. Typed columns hold the competitor name, the bid price as `numeric`, and the opportunity and competitor-account IDs. A `Competitor__c` value that is not a Salesforce ID is kept in `fields` only. Sync semantics match Accounts: a per-organisation competitor advisory lock, a `Competitor` run, batched upserts, and retention of records no longer returned, with `in_extract = false` and `removed_from_extract_at`. Opportunities and Accounts are not touched. Audit details contain counts only, never bid prices.

The list left-joins, within the same organisation, the synced `salesforce_opportunities` row (opportunity number and name) and the `salesforce_accounts` row (account name). When a linked record has not been synced, it shows the Salesforce ID instead. **Capture-Pro > Salesforce > Competitors** (`/app/product/Capture-Pro/competitors`) is read-only for the same five roles and has the same table behavior as Accounts. Won uses a Yes/No filter and the bid price accepts numeric expressions. Competitor bid prices are commercially confidential.

Migration `apps/capture-pro-service/drizzle/0003_salesforce_competitors.sql` is additive. It creates `salesforce_competitors` with an organisation/Salesforce ID unique index, an organisation/extract/name index, an organisation/opportunity index, and a foreign key to `salesforce_sync_runs`. It does not alter existing tables. Rollback leaves the table in place for audit; reverting the application stops competitor syncs.
### Salesforce bid budget sync

**Sync bid budgets now** on Sync & Health is a separate manual action for the same integration administrators. Capture-Pro calls core `POST /api/organisations/:orgId/modules/:productId/integrations/capture-pro/salesforce/bid-budgets/extract` with the user's bearer token and `X-CapturePro-Service-Key`. Core applies the same service-key and administrator checks, then runs this fixed SOQL through the shared Salesforce client (`v63.0`) with the same controls: `SELECT Id, Opportunity__c, Actual_Bid_Cost__c, Compensation__c, Opportunity_Bid_Budget_Recovery_Year__c, Budgeted_Hours__c, Forecasted_Spend__c, Actual_Bid_Budget__c, Additional_Pre_Contract_1__c, Additional_Pre_Contract_2__c, Additional_Pre_Contract_3__c, Forecast_Purpose__c, PG1_Pre_Contract__c FROM Opportunity_Bid_Budget__c`. It selects the Power Query's twelve columns plus `Id`. An opportunity can have several bid budget records, so `Id` is the stable record key. There is no filter, so all records up to 50,000 are imported.

Capture-Pro stores the records in `salesforce_bid_budgets`, one row per organisation and Salesforce `Id`. The selected fields keep their native Salesforce types in `fields`. A typed `opportunity_salesforce_id` column supports the link; an `Opportunity__c` value that is not a Salesforce ID is kept in `fields` only. Sync semantics match Competitors: a per-organisation bid-budget advisory lock, a `Bid Budget` run, batched upserts where the last duplicate `Id` wins, and retention of records no longer returned, with `in_extract = false` and `removed_from_extract_at`. No other Salesforce table is touched. Audit details and logs contain counts only, never cost, budget, spend, or hour values.

The list left-joins the synced `salesforce_opportunities` row within the same organisation, adding the opportunity number and name. When that opportunity is not in the synced market-analyst extract, the Salesforce ID is shown instead. **Capture-Pro > Salesforce > Bid Budget Data** (`/app/product/Capture-Pro/bid-budgets`) is read-only for the same five roles and has the same table behavior as Competitors. In the live extract, all eleven value fields, including Forecast_Purpose__c and PG1_Pre_Contract__c, are numeric Salesforce fields and accept numeric filter expressions; Recovery Year is text and uses a dropdown. Bid costs, budgets, and spend are commercially confidential.

Migration `apps/capture-pro-service/drizzle/0004_salesforce_bid_budgets.sql` is additive. It creates `salesforce_bid_budgets` with an organisation/Salesforce ID unique index, an organisation/extract index, an organisation/opportunity index, and a foreign key to `salesforce_sync_runs`. It does not alter existing tables. Rollback leaves the table in place for audit; reverting the application stops bid budget syncs.
, and the describe must include `Id`. There may be at most 500 fields, and the encoded query path may be at most 15,000 characters. Any violation fails the sync without changing stored data. The object name is fixed, and no client input reaches the describe call or the SOQL. The query uses the shared client controls, including the 500-page and 50,000-record limits.

Core returns the records together with the discovered field definitions (name, label, type). Capture-Pro validates the definitions again, rejecting duplicate or invalid names, and keeps only those fields from each record. It stores the records in `salesforce_fabrication_yards`, one row per organisation and Salesforce `Id`, with a typed `name` column and native Salesforce values in `fields`. It stores the latest definitions in `salesforce_object_fields`, one row per organisation and object. Both are written in one transaction under a per-organisation fabrication-yard advisory lock, together with a `Fabrication Yard` run, batched upserts, and retention of records no longer returned (`in_extract = false`, `removed_from_extract_at`). Each sync replaces a record's `fields` with the current field set, so fields deleted in Salesforce disappear after the next sync. Audit details and logs contain counts and the field count only.

**Capture-Pro > Salesforce > Fabrication Yard** (`/app/product/Capture-Pro/fabrication-yards`) is read-only for the same five roles. The list endpoint returns the organisation's field definitions and records. The screen uses Salesforce labels and shows Name, the first seven custom fields, and Record ID by default. The column chooser can show any discovered field. Filters follow the data types: yes/no and short picklists use dropdowns, numbers accept numeric expressions, and IDs, references, long text, URLs, email, phone, and Name use contains matching. Search, paging, removed records, and a details panel listing every field with its API name match the other Salesforce screens.

Migration `apps/capture-pro-service/drizzle/0005_salesforce_fabrication_yards.sql` is additive. It creates `salesforce_fabrication_yards` (organisation/Salesforce ID unique index, organisation/extract/name index) and `salesforce_object_fields` (organisation/object unique index), each with a foreign key to `salesforce_sync_runs`. It does not alter existing tables. Rollback leaves both tables in place for audit; reverting the application stops fabrication yard syncs.

### Salesforce vessel sync

**Sync vessels now** imports `Vessel__c` the same way, mirroring a Power Query source that selects every column with no filter. Core exposes `POST /api/organisations/:orgId/modules/:productId/integrations/capture-pro/salesforce/vessels/extract`, protected by the same service-key and administrator checks. It describes `Vessel__c` through API `v63.0` and queries the discovered scalar fields with the same type allowlist, name validation, 500-field cap, query-length limit, and record limits as Fabrication Yard. Fabrication Yard and Vessel share one core describe-and-query function, one Capture-Pro sync and list implementation, and one frontend screen component, each configured per object.

Capture-Pro stores the records in `salesforce_vessels`, which has the same layout as `salesforce_fabrication_yards`. It stores the field definitions in the shared `salesforce_object_fields` table under `Vessel__c`, separately from `Fabrication_Yard__c`. A vessel sync takes its own per-organisation advisory lock, records a `Vessel` run, and never changes another object's records or field definitions. **Capture-Pro > Salesforce > Vessel Data** (`/app/product/Capture-Pro/vessels`) is read-only for the same five roles and behaves like Fabrication Yard. The list endpoint also returns `objectName`.

Migration `apps/capture-pro-service/drizzle/0006_salesforce_vessels.sql` is additive. It creates `salesforce_vessels` with an organisation/Salesforce ID unique index, an organisation/extract/name index, and a foreign key to `salesforce_sync_runs`. The schema now builds both described-object tables from one definition, and generation confirmed this did not change `salesforce_fabrication_yards`. Rollback leaves the table in place for audit.

### Salesforce data source identification

Every Salesforce screen shows a **Data source: Salesforce** badge with the Salesforce object API name: `Opportunity`, `Account`, `Project_Competitor_Details__c`, `Opportunity_Bid_Budget__c`, `Fabrication_Yard__c`, or `Vessel__c`. Each Sync & Health panel shows the same badge. The badge identifies data as a read-only Salesforce copy; changes must be made in Salesforce and then synchronized.

Deployment: set the same long random `CAPTUREPRO_INTERNAL_API_KEY` for core and Capture-Pro, apply the Capture-Pro migrations, deploy core, deploy Capture-Pro, register the menus, then deploy the frontend. Core requires outbound HTTPS access to the organisation's `*.salesforce.com` My Domain and instance. Rollback: remove or disable the menus and the sync button by reverting the application, and remove or rotate `CAPTUREPRO_INTERNAL_API_KEY` to stop extract calls immediately. Retain both tables for audit and forward recovery. Dropping them requires separate service-owner and DBA approval.

## 11. Data ownership and relationships

### Core database

Key entities are users, organisations, organisation users, teams, products, organisation modules, module user designations, projects, project modules, user-project/module assignments, roles, user roles, menus, role menus, product database connections, sessions, app settings, SMTP configurations, email templates, email delivery logs, and user preferences.

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
- Capture-Pro stores tenant-scoped opportunities, TG3 source metadata, source-document references, capture plans, versions, sections, agent runs, and audit events.
- Core stores each product connection's database type, host, port, database, username, encryption flag, and encrypted password. Existing records default to PostgreSQL. PRIME defaults to a local Microsoft SQL Server target at `localhost:1433`, database `prime`, with connection encryption enabled; saving still requires an administrator-supplied password, which is encrypted at rest and never returned to the browser.
- The opt-in `mssql` profile in `infra/docker-compose.yml` can run `mssql_server` from SQL Server 2022 Developer and idempotently create the `prime` database. The required `MSSQL_SA_PASSWORD` is supplied through untracked `infra/.env`; it is not committed. Use `/opt/mssql-tools18/bin/sqlcmd` inside the current image. Starting Compose without the profile remains PostgreSQL-only.
- PRIME currently stores only a PostgreSQL-backed placeholder row type. The admin MSSQL connection record is configuration for the intended PRIME data source; converting PRIME's Drizzle schema and runtime driver to SQL Server requires a separately approved architecture and migration change.
- Cross-database operations are not distributed transactions.

## 12. Seed behavior

The idempotent core seed:

1. Creates the three platform roles and the CreditGuard and Capture-Pro product roles.
2. Creates or updates the local admin and password hash.
3. Creates the Global Organisation and owner membership.
4. Creates CreditGuard, PRIME, and Capture-Pro products.
5. Creates the public, workspace, product, global-admin, and organisation-admin menu trees.
6. Grants role-menu access.
7. Creates default application settings.

Seed reruns restore seeded role-menu grants. A route rename may leave an obsolete menu if identity matching no longer finds it.

## 13. Environment variables

| Application | Variables |
| --- | --- |
| Core | `CORE_DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `B2C_TENANT_NAME`, `B2C_POLICY_NAME`, `B2C_CLIENT_ID`, optional `B2C_ISSUER`/`B2C_JWKS_URI`, `LOCAL_JWT_SECRET`, `LOCAL_JWT_EXPIRES_IN`, `CONNECTION_SECRET_KEY`, `CREDITGUARD_INTERNAL_API_KEY`, `SESSION_HEARTBEAT_WINDOW_SECONDS`, emergency-only `NEXT_PRIVATE_SMTP_UNSAFE_IGNORE_TLS`, seed admin values |
| CreditGuard | `CREDITGUARD_DATABASE_URL`, `CORE_API_URL`, `CREDITGUARD_INTERNAL_API_KEY`, `PORT`, `CORS_ORIGIN`, `DOCUMENT_STORAGE_PROVIDER`, `DOCUMENT_LOCAL_ROOT`, `DOCUMENT_MAX_FILE_SIZE_MB`, `DOCUMENT_MAX_FILES_PER_REQUEST`, `AZURE_STORAGE_ACCOUNT_NAME`, `AZURE_STORAGE_CONTAINER`, optional `AZURE_STORAGE_CONNECTION_STRING` |
| PRIME | `PRIME_DATABASE_URL`, `PORT`, `CORS_ORIGIN`; local MSSQL container uses `MSSQL_SA_PASSWORD` from untracked `infra/.env` |
| Capture-Pro | `CAPTUREPRO_DATABASE_URL`, `CAPTUREPRO_PORT`, `CORE_API_URL`, `CORS_ORIGIN`, `CAPTUREPRO_SHAREPOINT_ENABLED`, `CAPTUREPRO_SHAREPOINT_SITE_URL`, `CAPTUREPRO_SHAREPOINT_LIBRARY`, `CAPTUREPRO_SHAREPOINT_FOLDER` |
| Frontend | `VITE_APP_NAME`, `VITE_API_BASE`, `VITE_CREDITGUARD_API_BASE`, `VITE_CAPTUREPRO_API_BASE`, B2C tenant/policy/client/scope values |

## 14. Testing contract

Playwright tests use browser-level API interception and seeded local storage. Shared mocks reproduce authentication, organisation, products, menus, sessions, and product records. This exercises routing, React state, forms, network payloads, and error handling without external identity or database dependencies.

Core migrations `0022_thankful_lockjaw.sql` and `0023_secret_bill_hollister.sql` must be applied before the Integration route is enabled and the core seed rerun to add its menu grant. Rollback removes the route/menu grant and application code first; integration columns or the table should only be dropped after confirming that stored Signit configuration is no longer required.

Core migration `0025_workable_infant_terrible.sql` adds the `database_type` enum and a non-null `product_db_connections.database_type` column defaulted to `postgresql`; it does not rewrite existing connection values. Apply it before saving an MSSQL connection. Rollback first removes MSSQL UI/API use, changes any MSSQL rows back to PostgreSQL or removes them after owner approval, then drops the column and enum. To remove local SQL Server without deleting data, stop the `mssql` and `mssql-init` services; deleting the `mssqldata` volume is destructive and requires explicit approval.

When adding a user-visible route or mutation:

1. Add/update the route inventory above.
2. Add a route rendering case.
3. Add a success-flow assertion that verifies method and payload.
4. Add validation or relevant server-failure coverage.
5. Keep selectors accessible (`role`, label, text, or explicit `aria-label`).

## 15. Known constraints

- Product services currently lack independent token guards and must not be publicly exposed as trusted APIs.
- Menu access mode is not a complete backend edit-permission model.
- Invalid stored product database credentials are accepted until connection use.
- Browser termination can hold a seat until the session reaper runs.
- Distributed transactions do not exist across core and product databases.
- PRIME domain behavior remains to be implemented.
