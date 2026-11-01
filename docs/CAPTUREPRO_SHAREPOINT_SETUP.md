# Capture-Pro SharePoint setup

Capture-Pro source ingestion stores metadata and governed links only. Live ingestion remains disabled until an Entra application and site-specific permission are approved. A separate, disabled-by-default delegated connection now supports an explicitly confirmed synthetic JSON upload to the test folder described below; it does not enable ingestion.

## Delegated test-folder connection

Implementation classification: **Level 3** (Microsoft token handling and external file creation). The user requested implementation of delegated Microsoft access. This is not evidence of an Entra administrator grant or independent security approval; those remain required before activation. Existing platform login, permissions, licensing, provider order, databases, and API contracts are unchanged.

### Destination

- Site: `https://mcdermottinc.sharepoint.com/sites/SPMATTeam`
- Library: `Shared Documents` (matched by its site-relative URL, not its localized display name)
- Folder: `General/SMAT Documents/Project Setup/McDermott_CIS_Test`
- File: `sample.json`, containing synthetic connection-test metadata and an empty data array

This destination is fixed in the Graph client. Sharing-link query parameters are not stored or sent to Graph. The existing metadata-ingestion destination below remains separate and unchanged.

### Administrator setup

1. Obtain security-team/service-owner approval for delegated Graph access, this destination, and synthetic test-file creation. Obtain the site owner's approval for the write grant.
2. Register a **separate single-tenant SPA application** in the organisation's Microsoft 365 Entra tenant. Do not reuse the platform B2C identity or configure a client secret for the SPA.
3. Register the exact redirect URI, for example `http://localhost:5173/app/product/Capture-Pro/integrations` in local development, and the corresponding HTTPS production URI. Microsoft sign-in requires HTTPS or a permitted localhost origin; plain HTTP LAN addresses are unsupported.
4. Add the **delegated** Microsoft Graph `Sites.Selected` permission and obtain administrator consent. An authorised administrator must separately grant the application write access to the `SPMATTeam` site. Do not replace this with tenant-wide `Sites.ReadWrite.All`. The signed-in user also needs their own write access. `Sites.Selected` limits the application to the granted site, not just this folder; the client fixes the destination but is not a folder-level security boundary.
5. Set these non-secret build-time settings in the untracked root environment file, then restart Vite or rebuild the frontend:

	```dotenv
	VITE_SHAREPOINT_ENABLED=true
	VITE_SHAREPOINT_TENANT_ID=<approved-directory-UUID>
	VITE_SHAREPOINT_CLIENT_ID=<approved-SPA-application-UUID>
	VITE_SHAREPOINT_ORGANISATION_ID=<platform-organisation-ID-for-this-site>
	```

The organisation setting prevents accidental UI use in another organisation; it is public configuration, not backend authorization. Microsoft Graph enforces the authenticated account's permissions and the administrator-approved app/site grant. No application records or tenant data are exported by this initial connection flow.

### User flow

Open **Capture-Pro > Integrations** with existing integration-administrator access and select **Connect SharePoint**. Microsoft handles the password, MFA, Conditional Access, and consent. After the redirect returns, the app resolves the site, library, and folder. A successful folder check proves read/resolve access only; the upload result determines write access.

No file is created automatically. **Upload sample.json** requires confirmation, re-resolves the fixed folder, and sends a single JSON `PUT` with conflict behavior `fail`. Existing files are not overwritten. Denied access, missing folders, expired sign-in, throttling, and file conflicts are explicit errors; there is no anonymous, broader-scope, local-file, or managed-identity fallback.

Only synthetic JSON is implemented in this first increment. XLSX generation, application-data exports, scheduled jobs, managed identity, persistent connection storage, and durable app audit events are not implemented. Approve data classification, export fields, retention, and an XLSX dependency before adding application-data exports. Use Microsoft 365 audit evidence for the manual connection test, subject to tenant audit configuration.

### Security and validation

- MSAL provides authorization-code flow with PKCE, state/nonce validation, and single-tenant authority. An isolated client does not replace platform authentication.
- Access and refresh tokens stay in MSAL memory. MSAL temporarily stores redirect state/PKCE information in session storage. The additional pending marker contains only organisation/product IDs and a 15-minute expiry. Passwords and client secrets never enter the app.
- Reloading or leaving the integration page discards the in-memory connection. Disconnect clears this client's cache; it does not sign out the platform or revoke Microsoft consent.
- Pending redirects must match organisation/product context, and returned accounts must match the configured tenant. Context switches abort Graph fetches; a write already received by Microsoft cannot be undone by aborting.
- Bearer tokens are sent only to `https://graph.microsoft.com`, without cookies or HTTP redirects. Library pagination is bounded and restricted to the original site endpoint. Provider error bodies and authentication errors are not logged or displayed.
- Graph permissions and site grants are the data-access security boundary. UI access checks are not a replacement for them. XSS remains a token-theft risk even with in-memory storage; review hosting/CSP and approved redirect URIs before activation.
- Run `node --test apps/frontend/test/sharepoint.spec.cjs`, the frontend type-check, and `npx playwright test 'capture-pro-integrations\.spec\.ts'` with SharePoint disabled. Unit tests use a fake MSAL boundary and mock Graph; they do not contact Microsoft or prove live tenant consent.
- Before activation, independently validate real sign-in/MFA/consent, denial on an unrelated site, read-only-user upload denial, the exact folder, successful sample creation, duplicate-file rejection, and existing B2C/local-login compatibility. A dedicated security review is still required.

### Deployment and rollback

Deploy disabled first. After approval, consent/site grant, and live negative tests, configure the organisation/tenant/client IDs and enable the feature in a new frontend build. There is no migration or data backfill. Roll back by disabling `VITE_SHAREPOINT_ENABLED` and rebuilding/redeploying, closing connected tabs, revoking the app's site grant/consent if necessary, and reverting only the SharePoint frontend additions. Keep any created test file until the site owner authorises deletion. Do not reset databases or revert unrelated integration work.

## Approved target

- Site: `https://mcdermottinc.sharepoint.com/sites/ITPMO-AI-CommercialIntelligenceSystem-PRJ0079553`
- Library: `Shared Documents`
- Folder: `General/TG3-Build and Test Plan`
- Persistence policy: metadata and links only

The supplied browser sharing URL must not be used as an API endpoint. Resolve the site, drive, and folder through Microsoft Graph after approval.

## Required approval

Use an app-only Entra identity with Microsoft Graph `Sites.Selected`, then grant that service principal read access only to the named site. Do not grant tenant-wide `Sites.Read.All` unless a security review documents why site-scoped access is insufficient.

Approval must cover:

1. Entra application ownership and credential rotation.
2. Site-level read permission for the target site.
3. Metadata classification, retention, and audit requirements.
4. Licensed-source restrictions for subscription content.
5. Operational limits, retry policy, and incident ownership.

Capture-Pro must not receive a client secret through chat, source control, logs, screenshots, or `.env`. Store production credentials in the approved secret store and inject them at runtime.

## Non-secret configuration

```dotenv
CAPTUREPRO_SHAREPOINT_ENABLED=false
CAPTUREPRO_SHAREPOINT_SITE_URL=https://mcdermottinc.sharepoint.com/sites/ITPMO-AI-CommercialIntelligenceSystem-PRJ0079553
CAPTUREPRO_SHAREPOINT_LIBRARY=Shared Documents
CAPTUREPRO_SHAREPOINT_FOLDER=General/TG3-Build and Test Plan
```

Keep synchronization disabled until the identity and site grant are approved. Secret configuration names should be selected with the platform/security owners when the credential store is chosen.

## Intended metadata contract

A future synchronization may persist only:

- SharePoint site, drive, item, and parent identifiers
- file name and document type
- governed web URL
- created and modified timestamps
- size, ETag, hash when available, and classification metadata
- synchronization timestamp and bounded error state

It must not persist access tokens, sharing tokens, URL query credentials, document binaries, or extracted document text.

## Validation after approval

1. Confirm the identity cannot enumerate an unrelated SharePoint site.
2. Resolve the approved site and library through Microsoft Graph.
3. List only the configured folder recursively with bounded pagination.
4. Upsert metadata by immutable drive-item ID and mark missing items without destructive deletion.
5. Verify organisation scoping and audit records for manual and scheduled synchronization.
6. Exercise throttling, expired credential, permission denied, deleted item, and renamed item behavior.

## Rollback

Set `CAPTUREPRO_SHAREPOINT_ENABLED=false`, stop synchronization workers, revoke the site grant, and rotate/revoke the credential. Retain existing metadata and audit evidence until the data owner approves deletion.
