export type HelpCategory = 'Get started' | 'Capture-Pro' | 'Organisation administration' | 'Global administration';

export interface HelpSection {
  title: string;
  content: string;
  steps?: string[];
  note?: string;
}

export interface HelpTopic {
  id: string;
  category: HelpCategory;
  title: string;
  summary: string;
  sections: HelpSection[];
}

export const helpTopics: HelpTopic[] = [
  {
    id: 'getting-started', category: 'Get started', title: 'Getting started', summary: 'Sign in, select an organisation, and understand the workspace.',
    sections: [
      { title: 'Sign in', content: 'Use the authentication option provided by your organisation. Local sign-in can remember your email address, but never stores your password.' },
      { title: 'Choose your organisation', content: 'Your selected organisation controls the products, projects, menus, and records you can access.', steps: ['If you belong to one organisation, it is selected automatically.', 'If you belong to several, choose one before entering the workspace.', 'Use the organisation selector in the header to switch context.'] },
      { title: 'Use the workspace', content: 'The header provides Products, contextual Help, theme controls, language, and organisation selection. The sidebar contains the screens granted by your roles.' },
    ],
  },
  {
    id: 'products-projects', category: 'Get started', title: 'Products, projects, and sessions', summary: 'Open licensed products and work in the correct project context.',
    sections: [
      { title: 'Open a product', content: 'Products lists modules licensed to the selected organisation and allowed by your product role.', steps: ['Select Products in the header.', 'Open the required product.', 'Select a project when the product requires project allocation.'] },
      { title: 'Session capacity', content: 'Opening a product reserves a licensed seat. The application keeps the session active while you work and releases it when you leave.', note: 'If all seats are in use, close an unused session or contact an administrator.' },
      { title: 'Missing access', content: 'A product may be absent when the organisation has no active module assignment, your role does not grant product access, or a required project is not allocated.' },
    ],
  },
  {
    id: 'account-settings', category: 'Get started', title: 'Account and preferences', summary: 'Maintain your profile, password, and personal appearance.',
    sections: [
      { title: 'Profile', content: 'Account Settings lets you update your name and other personal profile fields.' },
      { title: 'Password', content: 'Local accounts can change their password. Externally managed identities follow their identity provider process.' },
      { title: 'Appearance', content: 'Use the palette button in the header to change mode, color preset, brand color, and corner radius for your account.' },
      { title: 'Delete account', content: 'Account deletion is permanent and should be used only when organisational and audit obligations permit it.', note: 'Contact an administrator when retained business records still reference your account.' },
    ],
  },
  {
    id: 'capture-pro-overview', category: 'Capture-Pro', title: 'Capture-Pro overview', summary: 'Turn upcoming-bid intelligence into a governed, versioned capture plan.',
    sections: [
      { title: 'Pursuit lifecycle', content: 'Capture-Pro moves an opportunity from preliminary Pre-ITT intake through grounded source collection, tender verification, specialist analysis, capture-plan composition, and a human bid decision.' },
      { title: 'Human authority', content: 'Agent outputs are decision support. Authorised people remain responsible for assumptions, engineering values, commitments, reviews, and bid decisions.' },
      { title: 'Product access', content: 'Capture-Pro requires organisation licensing, a product role, project allocation when configured, and an available concurrent seat.' },
    ],
  },
  {
    id: 'capture-pro-data', category: 'Capture-Pro', title: 'Governed data library', summary: 'Register TG3 source references and preserve source boundaries.',
    sections: [
      { title: 'Data sets', content: 'The library groups the TG3 Commercial Intelligence sources by purpose and freshness policy.' },
      { title: 'Register a source', content: 'Add a file name, document type, optional HTTPS SharePoint link, and as-of date. Capture-Pro stores metadata and links only; it does not upload or copy the file.' },
      { title: 'SharePoint access', content: 'Live discovery is disabled until a site-scoped Entra identity is approved. Never paste access tokens, client secrets, or credential-bearing links into source metadata.' },
    ],
  },
  {
    id: 'capture-pro-plans', category: 'Capture-Pro', title: 'Capture plans and versions', summary: 'Commission, edit, cite, and version the 14-section capture plan.',
    sections: [
      { title: 'Commission a plan', content: 'Select an opportunity to create version 1 with CP-01 through CP-14. An opportunity can have one capture plan.' },
      { title: 'Edit sections', content: 'Open a section to maintain its narrative, status, unlinked citation labels, and links to registered governed sources.' },
      { title: 'Create a version', content: 'Use New version with a meaningful change summary. Capture-Pro copies the current sections and citations into a new immutable version record.' },
      { title: 'Agent runs', content: 'Queue run currently records an auditable request only. It does not execute a model until an approved orchestrator is configured.' },
    ],
  },
  {
    id: 'capture-pro-salesforce', category: 'Capture-Pro', title: 'Salesforce opportunities and integrations', summary: 'Configure Salesforce and Spinergie, synchronize opportunities, and review the extract.',
    sections: [
      { title: 'Integrations', content: 'Capture-Pro Module Administrators, Global Administrators, and organisation Owners/Admins save Salesforce OAuth 2.0 Client Credentials and the Spinergie API key. Saved secrets are encrypted and never displayed again.' },
      { title: 'Sync & Health', content: 'Open Capture-Pro > Salesforce > Sync & Health. Integration administrators use Sync opportunities now to import Subsea and Floating Facilities opportunities with the market-analyst filter, stage adjustments, TBA sub-category, and Floater/Subsea classification, Sync accounts now to import all Salesforce Accounts (Id, Name, Type, Company Short Name), Sync competitors now to import all Project Competitor Details, Sync bid budgets now to import all Opportunity Bid Budget records, Sync fabrication yards now to import every queryable Fabrication Yard field and record, and Sync vessels now to do the same for Vessel records. Managers and Analysts can view each type\'s connection health, the last run, and the run log with its Type column. Health reflects recorded sync runs: Healthy when the latest run of that type succeeded and Failing when it failed. A sync never creates or changes Capture-Pro opportunities.' },
      { title: 'Accounts', content: 'Open Capture-Pro > Salesforce > Accounts to search and filter the synchronized Salesforce Accounts by name, type, company short name, or Salesforce ID, and select a row to see its details. Accounts no longer returned by Salesforce are retained and can be shown with the removed-records option.' },
      { title: 'Competitors', content: 'Open Capture-Pro > Salesforce > Competitors to review Project Competitor Details with Salesforce field types: Won as Yes/No and the competitor bid price as a number. The Opportunity and Competitor columns show synced opportunity numbers and account names when those records are available, otherwise the Salesforce ID. Filter each column, search, include records no longer in Salesforce, and select a row to see every field.', note: 'Competitor bid prices are commercially confidential.' },
      { title: 'Bid Budget Data', content: 'Open Capture-Pro > Salesforce > Bid Budget Data to review Opportunity Bid Budget records with Salesforce field types: costs, budgets, spend, compensation, pre-contract amounts, forecast purpose, and hours are numbers that accept filters such as >100000 or 1000..5000, and Recovery Year is a picklist. An opportunity can have several bid budget records. The Opportunity column shows the synced opportunity number and name when available, otherwise the Salesforce ID. Filter each column, search, include records no longer in Salesforce, and select a row to see every field.', note: 'Bid costs, budgets, and spend are commercially confidential.' },
      { title: 'Fabrication Yard', content: 'Open Capture-Pro > Salesforce > Fabrication Yard to review every Fabrication Yard record with all queryable Salesforce fields. Fields are discovered from Salesforce on each sync, so new Salesforce fields appear after the next sync. The table shows key columns by default; use Columns to show any field. Filter each visible column, search, include records no longer in Salesforce, and select a row to see every field.', note: 'Composite address and location fields, file fields, and encrypted fields are not imported.' },
      { title: 'Vessel Data', content: 'Open Capture-Pro > Salesforce > Vessel Data to review every Salesforce Vessel record with all queryable fields, discovered from Salesforce on each sync. It works like Fabrication Yard: key columns by default, Columns to show any field, a filter per visible column, search, removed records, and a details panel with every field.' },
      { title: 'Data source', content: 'Every Salesforce screen and Sync & Health panel shows a Data source: Salesforce badge with the Salesforce object the data comes from, such as Opportunity, Account, or Vessel__c. The data is a read-only copy; change it in Salesforce and run a sync to refresh it.' },
      { title: 'Review the extract', content: 'Capture-Pro Managers, Analysts, and administrators open Capture-Pro > Salesforce > Opportunities. Key columns are shown by default; use Columns to show any synced field, the filter row under each header to narrow results (for numbers, use >, <, = or a range such as 100..500), and select a row to see every field. Records that later drop out of the Salesforce extract are retained and labelled Not in latest extract.', note: 'Forecasted revenue, gross profit, and competitor bid prices are commercially confidential. Do not export or share them outside approved channels.' },
    ],
  },
  {
    id: 'organisation-administration', category: 'Organisation administration', title: 'Organisation administration', summary: 'Manage members, teams, projects, and organisation context.',
    sections: [
      { title: 'Members', content: 'Add existing platform users to the organisation, set Owner/Admin/Member authority, control active status, and assign projects.' },
      { title: 'Teams', content: 'Create teams, select active organisation members, and associate product modules when access should be team-restricted.' },
      { title: 'Projects', content: 'Allocate licensed product seats to organisation projects. Project-scoped products require a valid allocation before users can open them.' },
      { title: 'Settings', content: 'Review and maintain the selected organisation’s details where your membership permits it.' },
    ],
  },
  {
    id: 'global-users-access', category: 'Global administration', title: 'Users, roles, and access', summary: 'Create identities and grant least-privilege application access.',
    sections: [
      { title: 'Global Users', content: 'Create and maintain local identities. Creating an account does not itself grant product access.' },
      { title: 'User Assignments', content: 'Assign global or product roles and manage status. Organisation membership, module allocation, and product role are separate access controls.' },
      { title: 'Roles', content: 'Define roles and assign menu access modes. Menu visibility improves navigation but backend authorization remains the security boundary.' },
      { title: 'User Settings', content: 'Inspect profile, notification preferences, effective organisations, roles, modules, projects, teams, and recent sessions.' },
    ],
  },
  {
    id: 'global-platform', category: 'Global administration', title: 'Platform configuration', summary: 'Manage organisations, projects, modules, connections, sessions, and site settings.',
    sections: [
      { title: 'Organisations and projects', content: 'Maintain the global tenant and project catalogs before assigning members or product capacity.' },
      { title: 'Module Assignments', content: 'Assign products and licensed seat counts to organisations. Allocation controls availability and concurrent use.' },
      { title: 'Product Connections', content: 'Configure each product database connection. Passwords are encrypted and are not returned after save.' },
      { title: 'Sessions', content: 'Monitor active administration and product leases. Use session information to investigate occupied seats.' },
      { title: 'Site Settings', content: 'Configure defaults, session timeout, branding, banners, and ordered SMTP profiles.' },
    ],
  },
  {
    id: 'global-email', category: 'Global administration', title: 'Email templates and delivery', summary: 'Configure event messages and investigate delivery failures.',
    sections: [
      { title: 'Email Templates', content: 'Select a product event, edit its subject and body, and insert only the placeholders listed for that event. Unknown placeholders are rejected.' },
      { title: 'SMTP', content: 'Site Settings supports a primary SMTP profile and ordered fallbacks. Test and secure transport settings according to company policy.' },
      { title: 'Delivery Logs', content: 'Filter sent and failed attempts by module and status. Failed attempts can be retried without changing the original business event.', note: 'A retry sends the originally rendered message and does not apply later template edits.' },
    ],
  },
];

const contextualTopics: Array<{ matches: (path: string) => boolean; topicId: string }> = [
  { matches: (path) => /\/app\/product\/Capture-Pro\/plans(?:\/[^/]+)?$/.test(path), topicId: 'capture-pro-plans' },
  { matches: (path) => path.endsWith('/Capture-Pro/data-library'), topicId: 'capture-pro-data' },
  { matches: (path) => /\/Capture-Pro\/(?:opportunities|accounts|competitors|bid-budgets|fabrication-yards|vessels|salesforce-opportunities|salesforce-sync|integrations)$/.test(path), topicId: 'capture-pro-salesforce' },
  { matches: (path) => path.startsWith('/app/product/Capture-Pro'), topicId: 'capture-pro-overview' },
  { matches: (path) => path === '/app/products' || /^\/app\/product\//.test(path), topicId: 'products-projects' },
  { matches: (path) => path === '/account/settings', topicId: 'account-settings' },
  { matches: (path) => path.startsWith('/org/'), topicId: 'organisation-administration' },
  { matches: (path) => ['/admin/users', '/admin/user-assignments', '/admin/user-settings', '/admin/roles'].includes(path), topicId: 'global-users-access' },
  { matches: (path) => ['/admin/email-templates', '/admin/email-logs'].includes(path), topicId: 'global-email' },
  { matches: (path) => path.startsWith('/admin/'), topicId: 'global-platform' },
];

export function getContextualHelpTopic(pathname: string) {
  return contextualTopics.find(({ matches }) => matches(pathname))?.topicId ?? 'getting-started';
}