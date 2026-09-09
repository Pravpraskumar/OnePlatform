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
import { CreditGuardRequestsPage } from '@/pages/app/creditguard/CreditGuardRequestsPage';
import { CreditGuardNewRequestPage } from '@/pages/app/creditguard/CreditGuardNewRequestPage';
import { CreditGuardBusinessEntitiesPage } from '@/pages/app/creditguard/CreditGuardBusinessEntitiesPage';
import { CreditGuardReportsPage } from '@/pages/app/creditguard/CreditGuardReportsPage';
import { ResourcesPage } from '@/pages/app/ResourcesPage';
import { AdminConnectionsPage } from '@/pages/admin/AdminConnectionsPage';
import { AdminLicensesPage } from '@/pages/admin/AdminLicensesPage';
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage';
import { AdminOrganisationsPage } from '@/pages/admin/AdminOrganisationsPage';
import { AdminSettingsPage } from '@/pages/admin/AdminSettingsPage';
import { AdminRolesPage } from '@/pages/admin/AdminRolesPage';
import { AdminSessionsPage } from '@/pages/admin/AdminSessionsPage';
import { AdminProjectsPage } from '@/pages/admin/AdminProjectsPage';
import { GlobalUsersPage } from '@/pages/admin/GlobalUsersPage';
import { UserSettingsPage } from '@/pages/admin/UserSettingsPage';
import { OrgSettingsPage } from '@/pages/org/OrgSettingsPage';
import { OrgTeamsPage } from '@/pages/org/OrgTeamsPage';
import { OrgAdminPage } from '@/pages/org/OrgAdminPage';
import { OrganisationMembersPage } from '@/pages/org/OrganisationMembersPage';
import { OrganisationProjectsPage } from '@/pages/org/OrganisationProjectsPage';
import { AccountSettingsPage } from '@/pages/account/AccountSettingsPage';

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
      { path: '/app/product/:code', element: <ProductLandingPage /> },
      { path: '/app/product/CreditGuard/requests', element: <CreditGuardRequestsPage /> },
      { path: '/app/product/CreditGuard/requests/new', element: <CreditGuardNewRequestPage /> },
      { path: '/app/product/CreditGuard/reports', element: <CreditGuardReportsPage /> },
      { path: '/app/product/CreditGuard/application-setup/business-entities', element: <CreditGuardBusinessEntitiesPage /> },
      { path: '/app/resources', element: <ResourcesPage /> },
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
