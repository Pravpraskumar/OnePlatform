export type HelpCategory = 'Get started' | 'CreditGuard' | 'Organisation administration' | 'Global administration';

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
    id: 'creditguard-overview', category: 'CreditGuard', title: 'CreditGuard overview', summary: 'Understand the financial-security workflow and available instruments.',
    sections: [
      { title: 'Purpose', content: 'CreditGuard manages financial-security requests, controlled documents, review, approval routing, and portfolio reporting.' },
      { title: 'Process guide', content: 'The CreditGuard overview explains instrument selection, request initiation, Parent Company Guarantees, bank instruments, documentary controls, and monitoring responsibilities.' },
      { title: 'Roles', content: 'Requestors create and manage requests. Reviewers complete assigned reviews. Organisation and Global Administrators configure supporting data and access.' },
    ],
  },
  {
    id: 'creditguard-requests', category: 'CreditGuard', title: 'Request register', summary: 'Find, filter, sort, and manage CreditGuard requests.',
    sections: [
      { title: 'Work with the register', content: 'The Requests screen shows records in the selected organisation and project.', steps: ['Use column filters to narrow results.', 'Select column headings to sort.', 'Use Columns to show only fields needed for the task.', 'Open the request number to view or edit the full request.'] },
      { title: 'Available actions', content: 'Create Request starts a Draft. Notes can be edited inline where permitted. Assign Approvers and approval actions appear only at the appropriate workflow status.' },
      { title: 'Status guide', content: 'Draft is editable. Under Review locks business fields while allowing controlled attachment work. Reviewed enables approver assignment. Sent for Approval tracks Signit actions. Approved, Issued, Rejected, and Closed represent downstream outcomes.' },
    ],
  },
  {
    id: 'creditguard-request-form', category: 'CreditGuard', title: 'Create and edit a request', summary: 'Complete request details, documents, and reviewer submission.',
    sections: [
      { title: 'Create a Draft', content: 'Complete the Request, Guarantee and contract, and Supporting information blocks. Required fields are marked.', steps: ['Choose the project when required.', 'Enter instrument, parties, value, currency, dates, and contract details.', 'Select legal entities from configured Business Entities.', 'Save to create the Draft before adding documents.'] },
      { title: 'Attachments', content: 'Draft and Under Review requests accept permitted PDF and DOCX files. Attach Request generates or replaces the controlled request PDF named with the request number.' },
      { title: 'Submit for review', content: 'Select an eligible CreditGuard Reviewer and submit. Submission requires the generated latest request PDF. The request becomes Under Review and the reviewer receives the configured email.' },
      { title: 'Editing rules', content: 'Draft fields are editable. Under Review fields are read-only, but an authorized requestor can reassign the reviewer and manage attachments. Reviewed requests are read-only.' },
    ],
  },
  {
    id: 'creditguard-review', category: 'CreditGuard', title: 'Review a request', summary: 'Complete assigned review work and preserve workflow accountability.',
    sections: [
      { title: 'Reviewer assignment', content: 'Only the currently assigned eligible reviewer can complete review. Reassignment removes the former reviewer’s completion authority immediately.' },
      { title: 'Perform the review', content: 'Open the request, inspect persisted details and attachments, and resolve concerns outside the application according to the governing process.', steps: ['Confirm the request is assigned to you.', 'Open the generated PDF and supporting documents.', 'Use Review done only after the review is complete.'] },
      { title: 'Review done', content: 'Completing review records the reviewer and time, changes status to Reviewed, and enables the requestor or administrator to build the approval chain.' },
    ],
  },
  {
    id: 'creditguard-approvers', category: 'CreditGuard', title: 'Assign approvers', summary: 'Build and finalize an ordered approval chain.',
    sections: [
      { title: 'Build the chain', content: 'For a Reviewed request, assign an approved contact to every required approval title. The order determines sequential signing.', steps: ['Review the generated required titles.', 'Select a representative for each title.', 'Add or reorder permitted rows when needed.', 'Save the chain.'] },
      { title: 'Finalize', content: 'Finalize only when every required row is assigned and ordered correctly. Finalization locks structural changes.' },
      { title: 'Modify a finalized chain', content: 'An Organisation Owner/Admin or Global Administrator can reopen a chain only before any approver has acted.', note: 'Once an approval or rejection is recorded, the chain cannot be structurally changed.' },
    ],
  },
  {
    id: 'creditguard-approval', category: 'CreditGuard', title: 'Initiate and track approval', summary: 'Send finalized requests to Signit and monitor approver actions.',
    sections: [
      { title: 'Initiate approval', content: 'Choose the request PDFs to send, verify the finalized approver order, and initiate approval. CreditGuard creates and distributes a Signit envelope.' },
      { title: 'Approval status', content: 'After initiation, use Refresh to retrieve current approver actions. The request remains immutable while the external approval is active.' },
      { title: 'Recall', content: 'Organisation Owners/Admins and Global Administrators can recall an active approval when the business process permits it.', note: 'A failed initiation leaves the request Reviewed so the issue can be corrected and retried.' },
    ],
  },
  {
    id: 'creditguard-reports', category: 'CreditGuard', title: 'Reports and analytics', summary: 'Interpret request counts, status distribution, and portfolio value.',
    sections: [
      { title: 'Scope', content: 'Reports use requests in the selected organisation and project context. Change context before comparing another portfolio.' },
      { title: 'Measures', content: 'The page shows total and open requests, counts by status and instrument, and portfolio values grouped by currency.' },
      { title: 'Interpretation', content: 'Currency totals are kept separate and are not converted. Treat the report as an operational view of current application data.' },
    ],
  },
  {
    id: 'creditguard-setup', category: 'CreditGuard', title: 'CreditGuard application setup', summary: 'Maintain business entities, contacts, module users, and Signit integration.',
    sections: [
      { title: 'Business Entities', content: 'Maintain job code, segment, legal entity, ledger, and inventory organisation data used by request forms.' },
      { title: 'Module Users and Approvers', content: 'Approvers are organisation contacts used in approval chains. Registered Users shows eligible members and product roles; access is managed through platform administration.' },
      { title: 'Integration', content: 'Authorized administrators configure the Signit service URL and authorization key. Saved secrets are never displayed again.', note: 'Use Clear only when intentionally disabling the saved integration credential.' },
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
  { matches: (path) => /\/app\/product\/CreditGuard\/requests\/[^/]+\/approval$/.test(path), topicId: 'creditguard-approval' },
  { matches: (path) => /\/app\/product\/CreditGuard\/requests\/[^/]+\/approvers$/.test(path), topicId: 'creditguard-approvers' },
  { matches: (path) => path.endsWith('/requests/new') || /\/requests\/[^/]+\/edit$/.test(path), topicId: 'creditguard-request-form' },
  { matches: (path) => path.endsWith('/CreditGuard/requests'), topicId: 'creditguard-requests' },
  { matches: (path) => path.endsWith('/CreditGuard/reports'), topicId: 'creditguard-reports' },
  { matches: (path) => path.includes('/CreditGuard/application-setup/'), topicId: 'creditguard-setup' },
  { matches: (path) => path === '/app/product/CreditGuard', topicId: 'creditguard-overview' },
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