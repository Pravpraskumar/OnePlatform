# AI Agent Development and Security Guidelines

## Purpose

This repository allows AI-assisted and agentic coding. All agents must read and follow this document before making code, configuration, infrastructure, database, test, or documentation changes.

This file applies to the entire repository. More specific `AGENTS.md` files may add stricter rules for a subdirectory, but may not weaken these requirements.

Before changing behavior, read:

1. `README.md` for setup, commands, and repository layout.
2. `docs/APPLICATION_LOGIC.md` for system boundaries, routes, state, APIs, data ownership, and business rules.
3. The relevant implementation and tests. Documentation is context, not a substitute for source inspection.

---

# 1. Core Principles

## Security First

- Security takes precedence over speed.
- Never expose secrets, credentials, tokens, certificates, API keys, connection strings, password hashes, or private customer data.
- Never store credentials in source, tests, fixtures, logs, screenshots, traces, or documentation.
- Use environment variables or approved secret stores.
- Keep `.env` files untracked; update `.env.example` with non-secret placeholders when configuration changes.
- Follow least privilege and deny-by-default principles.
- Treat all organisation identifiers, role claims, product identifiers, project identifiers, and client-supplied ownership fields as untrusted.
- Do not claim security from UI hiding alone. Backend authorization is the security boundary.

## Architecture Preservation

Understand the current architecture before making changes.

Do not:

- Introduce a framework, state manager, ORM, test runner, authentication library, or infrastructure platform without approval.
- Collapse or bypass service boundaries.
- Move CreditGuard domain data into the core database.
- place core identity, tenancy, or licensing data in a product database.
- Modify authentication, authorization, session leasing, or tenant scoping as an incidental refactor.
- Alter database schemas without impact analysis and a migration plan.
- Replace shared libraries without a compatibility review.

Always:

- Review affected modules and their callers.
- Identify frontend, API, database, shared-contract, test, and deployment dependencies.
- Preserve existing request and response contracts unless a versioned migration is approved.
- Document architectural impact in the final report and in `docs/APPLICATION_LOGIC.md` when behavior or boundaries change.

## Small, Complete Changes

- Make the smallest coherent change that solves the root problem.
- Do not reformat or rewrite unrelated files.
- Do not revert user changes or unrelated worktree modifications.
- Reuse existing helpers, types, services, components, and test fixtures.
- Avoid broad catches, silent fallbacks, and success-shaped defaults.
- Keep TypeScript strict and avoid `any`, double casts, or unchecked payload assumptions.
- Add comments only where the reasoning cannot be made clear through structure and names.

---

# 2. Repository Architecture

## Monorepo Map

| Path | Ownership |
| --- | --- |
| `apps/frontend` | React 18/Vite SPA, React Router, TanStack Query, MSAL, organisation/session/theme state |
| `apps/core-backend` | NestJS control plane for identity, account, organisations, users, teams, projects, roles, menus, products, settings, and license sessions |
| `apps/creditguard-service` | NestJS CreditGuard domain API and Drizzle schema |
| `apps/prime-service` | NestJS PRIME placeholder service; do not invent domain behavior without requirements |
| `packages/shared` | Cross-workspace API contract types and role constants |
| `infra` | PostgreSQL development infrastructure and Azure Bicep |
| `tests/e2e` | Playwright route and workflow tests using deterministic browser-level API mocks |

## Runtime Boundaries

| Runtime | Default port | Frontend path | Database |
| --- | ---: | --- | --- |
| Frontend | 5173 | `/` | none |
| Core backend | 4000 | `/api/*` | `platform_core` |
| CreditGuard | 4101 | `/creditguard-api/*` rewritten to `/api/*` | `creditguard` |
| PRIME | 4102 | no primary SPA flow yet | `prime` |

Core owns identity, tenancy, permissions, product assignment, and licensing. Product services own product-domain records. There are no distributed transactions across these databases.

## Frontend State Invariants

The provider order is significant:

```text
QueryClientProvider
  ApiProvider
    SessionProvider
      ThemeProvider
        OrgProvider
          RouterProvider
```

Do not reorder providers without tracing all dependent hooks.

Local storage keys are established contracts:

- `platformAuthToken`
- `platformAuthUser`
- `selectedOrgId` (despite its name, it stores the serialized organisation object)
- `rememberedEmail`

Local authentication takes precedence over MSAL token acquisition. A valid local test JWT must contain a future `exp` claim, or the session provider will expire it.

## Multi-Tenancy Invariants

- Every tenant-sensitive backend query must be scoped to an authorised organisation.
- Never trust `orgId` from a query, URL, or body without checking the current user's access.
- Organisation membership (`Owner`, `Admin`, `Member`) and global roles are distinct concepts.
- Global-only screens must remain inaccessible outside their intended scope.
- Product services currently lack independent bearer-token guards. Do not expose them directly or expand this trust boundary without a Level 3 security change.

## Licensing and Session Invariants

- Product access requires a licensed session.
- Project-scoped products must not open until project allocation is resolved.
- Session creation must preserve concurrent-seat enforcement and its transaction/locking behavior.
- Frontend product and administration session leases are shared and heartbeat every 30 seconds.
- Leases must be released on final unmount; do not introduce duplicate sessions during route transitions.
- Heartbeat or seat-limit failures must be visible to the user rather than silently ignored.

---

# 3. Agent Change Classification

Classify the requested change before implementation and state the classification in the final report.

## Level 1 - Safe

Examples:

- Documentation
- UI copy
- Comments
- Test-only changes that do not weaken assertions
- Logging improvements that do not add sensitive data

Agent may proceed automatically. Inspect the relevant source and validate links, syntax, or tests as appropriate.

## Level 2 - Moderate

Examples:

- Business logic
- Backward-compatible API enhancements
- Workflow or state changes
- Non-sensitive configuration
- Dependency upgrades without architectural impact
- New UI behavior

Requirements:

- Impact analysis across affected workspaces
- Targeted automated tests
- Compatibility review
- Rollback instructions
- Documentation updates when contracts or behavior change

Approval is normally owned by the team lead during review; implementation may proceed only when the user's request clearly authorizes the change.

## Level 3 - High Risk

Examples:

- Authentication, SSO, MFA, token handling, or password policy
- Authorization, RBAC, membership, menu grants, or tenant isolation
- Encryption, secrets, certificates, or product connection storage
- Database structure, destructive migrations, or data backfills
- License enforcement or session concurrency controls
- Infrastructure, networking, firewall, cloud resources, or CI/CD
- Financial workflow rules that affect approval, liability, or audit evidence
- Production deployment or production data access

Requirements:

- Explicit human approval for the exact high-risk scope
- Security review
- Detailed impact and threat analysis
- Deployment and rollback plans
- Migration/backfill plan where relevant
- Targeted security, integration, and regression tests

Agents must not self-approve or perform a Level 3 change merely because it is technically possible.

---

# 4. Required Discovery and Impact Assessment

Before coding:

1. Check worktree status and preserve unrelated changes.
2. Locate existing implementations and tests before adding helpers or dependencies.
3. Identify the owning workspace and downstream consumers.
4. Trace the full flow across UI, API client, controller, service, schema, and shared types when applicable.
5. Review `docs/APPLICATION_LOGIC.md` and update it if the change alters documented behavior.
6. Classify risk and identify required approval.

Assess all applicable impact areas:

- Frontend routing, state, accessibility, responsive behavior, and error handling
- Core and product API compatibility
- Authentication and authorization
- Organisation isolation
- Database constraints, migrations, locking, and query performance
- Concurrent-seat licensing and session cleanup
- Reporting calculations and financial workflow semantics
- Infrastructure, cost, deployment, and operations
- Auditability, privacy, and regulatory obligations

Changes crossing multiple domains require broader validation than a single-file change.

---

# 5. Dependency Protection

Before adding or upgrading a package:

- Search all workspaces for an existing equivalent.
- Explain why platform or current dependency functionality is insufficient.
- Prefer maintained, widely adopted packages with compatible licenses.
- Check release activity, Node 20 compatibility, TypeScript compatibility, and known vulnerabilities.
- Avoid duplicate libraries for the same function.
- Update `package-lock.json` with npm; do not hand-edit lockfile dependency graphs.
- Run the smallest build/test set covering every consumer.

Do not:

- Add abandoned packages.
- Add packages with known critical vulnerabilities.
- Run automatic audit fixes, especially `--force`, without explicit approval; they may introduce breaking unrelated upgrades.
- Treat an existing audit warning as caused by the current change unless dependency analysis demonstrates that relationship.

When package installation reports vulnerabilities, record the counts and affected dependency context. Do not silently claim a clean security gate.

---

# 6. Database Protection

Agents must never:

- Drop tables, columns, schemas, or databases automatically.
- Delete or anonymize production data.
- Force migrations.
- Reset shared databases.
- Edit generated migration history to conceal a change.
- Assume cross-database atomicity.

For schema changes:

1. Obtain Level 3 approval.
2. Update the Drizzle schema in the owning service.
3. Generate a migration using the existing workspace command.
4. Inspect generated SQL.
5. Document affected tables, indexes, constraints, foreign keys, and consumers.
6. Provide a tested rollback or forward-recovery procedure.
7. Assess locks, table rewrites, data volume, and deployment ordering.
8. Validate migration and application behavior against a disposable/local database.

Preserve these ownership rules:

- `platform_core`: users, organisations, roles, menus, products, projects, settings, and sessions.
- `creditguard`: CreditGuard requests, details, and business entities.
- `prime`: PRIME domain data only.

Seed changes must remain idempotent. Never introduce real credentials into seeds.

---

# 7. API Governance

Before modifying an endpoint:

- Identify every frontend and service consumer.
- Preserve path, method, authentication, status code, and response shape where possible.
- Check shared types in `packages/shared`.
- Validate DTO whitelist behavior and reject unknown or invalid input.
- Ensure tenant resources are authorized, not merely filtered by a client-provided identifier.
- Maintain actionable, non-sensitive errors.
- Consider pagination, rate limits, retries, idempotency, and concurrency.

Do not:

- Return secrets, internal connection data, stack traces, or password fields.
- Change an array response to an object (or the reverse) without updating all consumers and tests.
- Return `{}` as a convenient fallback when the consumer expects an array or structured payload.
- Swallow API failures and render a successful state.

Product service calls using `/creditguard-api` do not go through the core `ApiClient`; preserve their distinct proxy and error behavior unless an approved architecture change consolidates them.

---

# 8. Security Controls

## Input Validation

Validate:

- API bodies, route parameters, and query parameters
- Organisation, project, product, role, and user identifiers
- Enum/status values
- Amounts, dates, currencies, and request workflow data
- File metadata and uploads
- URLs and connection configuration

Use DTO validation and database constraints together. Client-side validation improves UX but is not a security control.

## Output Protection

Prevent:

- XSS and unsafe HTML rendering
- SQL, command, path, and template injection
- Cross-tenant data leakage
- Overbroad object serialization
- Sensitive values in error bodies, logs, snapshots, traces, and test reports

## Authentication and Authorization

Agents shall not:

- Bypass `RequireAuth`, Nest global guards, role checks, or membership checks.
- Create or elevate an admin account outside an explicitly approved seed/development task.
- Disable token validation.
- Extend token lifetime or weaken password rules without approval.
- Treat menu visibility as authorization.
- Introduce a test-only authentication bypass into production code.

## Financial Workflow

CreditGuard handles financial-security requests and approval information. Changes to request statuses, liability amounts, approval fields, entity rules, generated documents, or reports require Level 3 review for financial and audit impact.

---

# 9. Infrastructure Protection

Agents may not modify or operate production environments without explicit approval from an authorized human.

Protected areas include:

- Azure subscriptions and resources
- Bicep deployment behavior
- PostgreSQL production instances
- Networks, DNS, firewalls, private endpoints, and identity assignments
- CI/CD credentials, runners, environments, and deployment gates
- Monitoring, alerting, backups, and retention

IaC changes require:

- Template validation/preview
- Security and cost review
- Environment-specific impact
- Deployment ordering
- Rollback plan

Never use broad destructive commands against repository roots, database roots, cloud resource groups, or shared environments.

---

# 10. Coding Conventions

## TypeScript and React

- Preserve strict typing.
- Prefer shared interfaces and discriminated unions over casts.
- Keep provider and hook dependencies stable; include complete effect dependency arrays.
- Use accessible labels, roles, names, and `aria-label` values for interactive controls.
- Preserve loading, empty, error, and permission-denied states.
- Keep organisation and product changes reactive; do not retain stale tenant data.
- Use the existing UI primitives (`Button`, `Card`, `Dropdown`, `Toggle`) where appropriate.

## NestJS

- Keep controllers thin and business rules in services.
- Use DTO validation.
- Apply public and role decorators intentionally.
- Propagate actionable domain errors; do not use broad catches.
- Use transactions and row locking where concurrency affects licensing or allocation.

## Drizzle

- Reuse schema types and constraints.
- Index tenant-scoped and frequent lookup paths.
- Preserve foreign-key and cascade intent.
- Do not perform application-side uniqueness checks as a substitute for database constraints.

## Documentation

- Keep `README.md` focused on onboarding and operations.
- Keep `docs/APPLICATION_LOGIC.md` synchronized with routes, state, APIs, ownership, and important business rules.
- Use relative links inside repository Markdown.
- Do not include real secrets or production identifiers.

---

# 11. Agentic Coding Workflow

## Step 1 - Discover

Analyze:

- Repository status and structure
- Relevant source and existing patterns
- Architecture and data ownership
- Existing scripts and test infrastructure
- Current user changes that must be preserved

## Step 2 - Assess

Determine:

- Change classification
- Impacted workspaces and consumers
- Security, privacy, financial, and tenancy implications
- Performance, concurrency, deployment, and cost impact
- Required approvals

## Step 3 - Plan

Define:

- Expected behavior
- Files and contracts affected
- Risks and rollback approach
- Targeted tests

Do not create planning files in the repository unless requested.

## Step 4 - Implement

- Make a surgical, complete change.
- Reuse existing types and helpers.
- Keep errors explicit.
- Update related documentation and tests in the same change.

## Step 5 - Validate

Run the smallest relevant existing checks, then escalate only if results require it:

1. Targeted type-check/build for the changed workspace.
2. Targeted Playwright spec or grep for the changed flow.
3. Full E2E suite when routing, shared fixtures, auth/session context, or broad UI behavior changes.
4. Full workspace build/lint only when the scope justifies it.

Reflect on failures. Fix real selector, payload, state, or contract mismatches; do not weaken assertions just to make tests green.

## Step 6 - Report

Include:

- Change classification
- Summary and files changed
- Behavior and architecture impact
- Validation commands and exact results
- Security findings or unresolved warnings
- Rollback instructions
- Any pre-existing blocker clearly separated from change-caused failures

---

# 12. Testing and Validation Guidance

## Standard Commands

```powershell
# Install dependencies
& 'C:\Program Files\nodejs\npm.cmd' install

# Frontend development
& 'C:\Program Files\nodejs\npm.cmd' run dev --workspace @platform/frontend

# All Playwright flows
& 'C:\Program Files\nodejs\npm.cmd' run test:e2e

# A targeted spec
& 'C:\Program Files\nodejs\npx.cmd' playwright test tests\e2e\core-flows.spec.ts

# A targeted flow
& 'C:\Program Files\nodejs\npx.cmd' playwright test tests\e2e\core-flows.spec.ts --grep "business entities"
```

On Windows hosts where PowerShell script execution is disabled, invoke `npm.cmd` and `npx.cmd` instead of `npm.ps1`/`npx.ps1`. Do not change machine execution policy as a workaround.

## Current TypeScript Compatibility Note

The repository currently installs TypeScript 5.9.x while `apps/frontend/tsconfig.json` and `packages/shared/tsconfig.json` specify `ignoreDeprecations: "6.0"`. A normal frontend build may fail with `TS5103` before compiling application code.

For targeted validation only, the established non-persistent command is:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' exec --workspace @platform/frontend -- tsc --noEmit --ignoreDeprecations 5.0
```

Do not silently edit the project configuration as part of an unrelated task. If asked to fix the build, treat the TypeScript/configuration compatibility as its own change and validate every affected workspace.

## Playwright Practices

- Tests are in `tests/e2e` and use deterministic browser-level mocks.
- Keep tests independent of PostgreSQL, B2C, and live services unless explicitly writing integration tests.
- Register broad fallback routes before more-specific overrides when Playwright route precedence requires the later registration to win.
- Mock the exact consumer shape. Examples:
  - menus must be arrays;
  - project allocation payload is `{ modules, projects, allocations }`;
  - module project context is `{ projectRequired, lastProjectId, projects }`;
  - theme preferences contain `mode`, `preset`, `radius`, and `brandColor`.
- Use a future-expiry JWT in local storage fixtures.
- Prefer role, label, placeholder, accessible name, or explicit title selectors.
- When locating a containing row, prefer `locator('tbody tr').filter({ hasText: ... })` over attempting to find an ancestor with a descendant locator.
- Test route rendering as well as meaningful success and error flows.
- Wait for observable UI state or request events; do not add arbitrary sleeps.
- Keep screenshots, videos, traces, `test-results`, and `playwright-report` untracked.

The configuration uses the installed Chrome channel. On networks with a self-signed corporate certificate chain, Playwright browser download may fail. Do not disable TLS verification. Prefer the approved installed browser channel or fix the trusted certificate configuration through the platform team.

## Test Coverage

- Maintain at least 80% coverage for changed modules where measurable coverage exists.
- Every changed user flow requires a success assertion and the most relevant validation/error assertion.
- Authorization, cross-tenant access, licensing, and financial workflow changes require dedicated negative tests.
- A route smoke test alone is insufficient for a mutation or business-rule change.

---

# 13. Required Security Review Triggers

Mandatory review is required for changes to:

- Authentication, B2C, SSO, MFA, local JWTs, or password handling
- RBAC, menu grants, organisation membership, or global roles
- Tenant scoping and cross-organisation queries
- Network configuration and service exposure
- Encryption and product connection secrets
- Database permissions or schema
- Session leasing, heartbeats, seat enforcement, or timeout/reaper behavior
- CreditGuard approval, liability, status, document, or reporting logic
- File uploads or generated documents
- CI/CD identity and production deployment

Use a dedicated security review process. General code review does not replace it.

---

# 14. Logging and Observability

Never log:

- Passwords or password hashes
- JWTs, refresh tokens, authorization headers, cookies, or session identifiers
- Database passwords or full connection strings
- Encryption keys
- Personal data unless explicitly approved and minimized
- Financial attachments or confidential request details

Logging must:

- Support traceability and incident investigation.
- Include safe identifiers and correlation context.
- Distinguish validation, authorization, dependency, and internal failures.
- Avoid disclosing whether sensitive accounts or resources exist when that enables enumeration.

Do not disable monitoring or convert failures into silent success.

---

# 15. Quality Gates

Before declaring completion:

- The requested behavior is implemented end to end.
- Relevant build or type-check succeeds, or a pre-existing blocker is demonstrated and reported.
- Targeted tests pass.
- Broader tests pass when shared behavior changed.
- No new critical lint errors are introduced.
- No secret or sensitive test artifact is tracked.
- No new high/critical vulnerability is knowingly introduced.
- Changed modules meet the coverage expectation where tooling exists.
- Documentation reflects changed routes, contracts, configuration, or business rules.

Do not state “all checks pass” when only test discovery or compilation was run. Report the exact command and result.

---

# 16. Pull Request Requirements

Every AI-generated pull request must include:

## Summary

What changed?

## Reason

Why was it changed?

## Classification

Level 1, Level 2, or Level 3, including approvals obtained.

## Impact

Which frontend, backend, database, infrastructure, security, reporting, and integration areas are affected?

## Security Review

What risks were assessed? Was mandatory review triggered?

## Validation

List exact commands and results.

## Rollback Plan

Explain how to revert code, configuration, migrations, and data safely.

## Follow-up

List known constraints, deferred work, or pre-existing failures. Do not hide them in the summary.

---

# 17. Enterprise and Compliance Controls

Follow company policies for:

- Secure SDLC and change approval
- Data classification, retention, deletion, and residency
- Access reviews and segregation of duties
- Audit evidence and traceability
- Incident response
- Third-party dependencies and licensing
- Backup, recovery, and business continuity

Applicable frameworks may include SOX, GDPR, ISO 27001, NIST, and company-specific governance. Do not claim compliance certification based solely on code changes or tests.

CreditGuard changes may affect financial control evidence. Preserve auditable status transitions, approvals, timestamps, and actor attribution.

---

# 18. Agent Restrictions

Agents must not:

- Execute destructive repository, database, cloud, or filesystem commands.
- Delete repositories or broad/root directories.
- Modify production directly.
- Disable authentication, authorization, encryption, monitoring, tests, or security controls.
- Commit secrets or upload repository data to unapproved third parties.
- Use force pushes, destructive resets, or history rewriting unless explicitly authorized.
- Amend commits unless explicitly requested.
- Self-approve Level 3 changes.
- Work around certificate or TLS failures by disabling verification.
- “Fix” failing tests by removing meaningful coverage or replacing assertions with unconditional success.

If an approved task cannot be completed without violating these restrictions, stop and report the blocker.

---

# Agent Approval Matrix

| Change type | Minimum approval |
| --- | --- |
| Documentation | None |
| Unit/E2E tests | None, unless they require production access or weaken a control |
| UI changes | Usually none; team lead for business behavior |
| Business logic | Team lead |
| Public API contract | Team lead + affected consumer owners |
| Database schema/data migration | DBA + service owner |
| Authentication/authorization | Security team + service owner |
| Financial workflow/control | Business control owner + security/team lead |
| Infrastructure/networking | Platform team + security where exposed |
| CI/CD deployment controls | Platform/release owner |
| Production deployment | Authorized approver |

---

# Final Rule

Agents must optimize for:

1. Security
2. Stability
3. Maintainability
4. Compliance
5. Correctness
6. Performance

Never sacrifice security, tenant isolation, financial control integrity, or architecture for implementation speed.
