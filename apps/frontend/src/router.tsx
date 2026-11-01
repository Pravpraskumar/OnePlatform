import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireAuth } from '@/auth/RequireAuth';
import { AppShell } from '@/components/layout/AppShell';
import { MarketingPage } from '@/pages/public/MarketingPage';
import { AboutPage } from '@/pages/public/AboutPage';
import { SignInPage } from '@/pages/public/SignInPage';
import { SignUpPage } from '@/pages/public/SignUpPage';
import { DashboardPage } from '@/pages/app/DashboardPage';
import { ProductsPage } from '@/pages/app/ProductsPage';
import { ProductLandingPage } from '@/pages/app/ProductLandingPage';
import { ResourcesPage } from '@/pages/app/ResourcesPage';
import { AdminConnectionsPage } from '@/pages/admin/AdminConnectionsPage';
import { AdminLicensesPage } from '@/pages/admin/AdminLicensesPage';
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage';
import { AdminOrganisationsPage } from '@/pages/admin/AdminOrganisationsPage';
import { AdminSettingsPage } from '@/pages/admin/AdminSettingsPage';
import { AdminRolesPage } from '@/pages/admin/AdminRolesPage';
import { AdminSessionsPage } from '@/pages/admin/AdminSessionsPage';
import { AdminEmailLogsPage } from '@/pages/admin/AdminEmailLogsPage';
import { AdminEmailTemplatesPage } from '@/pages/admin/AdminEmailTemplatesPage';
import { AdminProjectsPage } from '@/pages/admin/AdminProjectsPage';
import { GlobalUsersPage } from '@/pages/admin/GlobalUsersPage';
import { UserSettingsPage } from '@/pages/admin/UserSettingsPage';
import { OrgSettingsPage } from '@/pages/org/OrgSettingsPage';
import { OrgTeamsPage } from '@/pages/org/OrgTeamsPage';
import { OrgAdminPage } from '@/pages/org/OrgAdminPage';
import { OrganisationMembersPage } from '@/pages/org/OrganisationMembersPage';
import { OrganisationProjectsPage } from '@/pages/org/OrganisationProjectsPage';
import { AccountSettingsPage } from '@/pages/account/AccountSettingsPage';
import { CaptureProModule } from '@/pages/app/capturepro/CaptureProModule';
import { CaptureProIntegrationsPage } from '@/pages/app/capturepro/CaptureProIntegrationsPage';
import { CaptureProOpportunityWorkspacePage, CaptureProSalesforceOpportunitiesPage } from '@/pages/app/capturepro/CaptureProSalesforceOpportunitiesPage';
import { CaptureProSalesforceSyncPage } from '@/pages/app/capturepro/CaptureProSalesforceSyncPage';
import { CaptureProSalesforceAccountsPage } from '@/pages/app/capturepro/CaptureProSalesforceAccountsPage';
import { CaptureProSalesforceCompetitorsPage } from '@/pages/app/capturepro/CaptureProSalesforceCompetitorsPage';
import { CaptureProSalesforceBidBudgetsPage } from '@/pages/app/capturepro/CaptureProSalesforceBidBudgetsPage';
import { CaptureProSalesforceFabricationYardsPage } from '@/pages/app/capturepro/CaptureProSalesforceFabricationYardsPage';
import { CaptureProSalesforceVesselsPage } from '@/pages/app/capturepro/CaptureProSalesforceVesselsPage';
import { CaptureProSpinergieChartersPage, CaptureProSpinergieVesselsPage } from '@/pages/app/capturepro/CaptureProSpinergieVesselsPage';
import { CaptureProAgentChatPage } from '@/pages/app/capturepro/CaptureProAgentChatPage';
import {
  CaptureProDataLibraryPage,
  CaptureProGovernancePage,
  CaptureProOverviewPage,
  CaptureProPlanPage,
  CaptureProPlansPage,
} from '@/pages/app/capturepro/CaptureProPages';

export const router = createBrowserRouter([
  { path: '/', element: <MarketingPage /> },
  { path: '/about', element: <AboutPage /> },
  { path: '/signin', element: <SignInPage /> },
  { path: '/signup', element: <SignUpPage /> },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { path: '/app', element: <Navigate to="/app/dashboard" replace /> },
      { path: '/app/dashboard', element: <DashboardPage /> },
      { path: '/app/products', element: <ProductsPage /> },
      { path: '/app/product/CreditGuard/*', element: <Navigate to="/app/products" replace /> },
      {
        path: '/app/product/Capture-Pro',
        element: <CaptureProModule />,
        children: [
          { index: true, element: <CaptureProOverviewPage /> },
          { path: 'opportunities', element: <CaptureProSalesforceOpportunitiesPage /> },
          { path: 'opportunity-workspace', element: <CaptureProOpportunityWorkspacePage /> },
          { path: 'data-library', element: <CaptureProDataLibraryPage /> },
          { path: 'agents', element: <CaptureProAgentChatPage /> },
          { path: 'plans', element: <CaptureProPlansPage /> },
          { path: 'plans/:planId', element: <CaptureProPlanPage /> },
          { path: 'governance', element: <CaptureProGovernancePage /> },
          { path: 'integrations', element: <CaptureProIntegrationsPage /> },
          { path: 'salesforce-sync', element: <CaptureProSalesforceSyncPage /> },
          { path: 'accounts', element: <CaptureProSalesforceAccountsPage /> },
          { path: 'competitors', element: <CaptureProSalesforceCompetitorsPage /> },
          { path: 'bid-budgets', element: <CaptureProSalesforceBidBudgetsPage /> },
          { path: 'fabrication-yards', element: <CaptureProSalesforceFabricationYardsPage /> },
          { path: 'vessels', element: <CaptureProSalesforceVesselsPage /> },
          { path: 'spinergie-vessels', element: <CaptureProSpinergieVesselsPage /> },
          { path: 'spinergie-charters', element: <CaptureProSpinergieChartersPage /> },
          { path: 'salesforce-opportunities', element: <Navigate to="/app/product/Capture-Pro/opportunities" replace /> },
        ],
      },
      { path: '/app/product/:code', element: <ProductLandingPage /> },
      { path: '/app/resources', element: <Navigate to="/app/help" replace /> },
      { path: '/app/help', element: <ResourcesPage /> },
      { path: '/app/help/:topicId', element: <ResourcesPage /> },
      { path: '/account/settings', element: <AccountSettingsPage /> },
      { path: '/admin/users', element: <GlobalUsersPage /> },
      { path: '/admin/user-assignments', element: <AdminUsersPage /> },
      { path: '/admin/user-settings', element: <UserSettingsPage /> },
      { path: '/admin/organisations', element: <AdminOrganisationsPage /> },
      { path: '/admin/connections', element: <AdminConnectionsPage /> },
      { path: '/admin/licenses', element: <AdminLicensesPage /> },
      { path: '/admin/settings', element: <AdminSettingsPage /> },
      { path: '/admin/roles', element: <AdminRolesPage /> },
      { path: '/admin/sessions', element: <AdminSessionsPage /> },
      { path: '/admin/email-logs', element: <AdminEmailLogsPage /> },
      { path: '/admin/email-templates', element: <AdminEmailTemplatesPage /> },
      { path: '/admin/projects', element: <AdminProjectsPage /> },
      { path: '/org/settings', element: <OrgSettingsPage /> },
      { path: '/org/teams', element: <OrgTeamsPage /> },
      { path: '/org/members', element: <OrganisationMembersPage /> },
      { path: '/org/projects', element: <OrganisationProjectsPage /> },
      { path: '/org/admin', element: <OrgAdminPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
