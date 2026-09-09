// Shared API contract types used by the frontend and backends.

export type EntityStatus = 'active' | 'suspended' | 'pending';
export type MenuType = 'Global' | 'Secured';
export type MenuAccessMode = 'readonly' | 'editable';
export type Membership = 'Owner' | 'Admin' | 'Member';

export interface AuthUser {
  id: string;
  b2cOid: string;
  email: string;
  displayName: string;
  globalRoles: string[];
}

export interface OrganisationSummary {
  id: string;
  name: string;
  slug: string;
  status: EntityStatus;
  membership?: Membership;
}

export interface MenuNode {
  id: string;
  parentId: string | null;
  name: string;
  route: string | null;
  icon: string | null;
  type: MenuType;
  productId: string | null;
  displayOrder: number;
  isActive: boolean;
  accessMode?: MenuAccessMode;
  children: MenuNode[];
}

export interface Product {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface OrganisationModule {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  licensedSeats: number;
  status: EntityStatus;
  validFrom: string;
  validTo: string | null;
}

export interface SessionUsage {
  licensedSeats: number;
  activeSessions: number;
}

export const GLOBAL_ADMINISTRATOR = 'Global Administrator';
export const ORGANISATION_ADMINISTRATOR = 'Organisation Administrator';
export const GENERAL_USER = 'General User';
