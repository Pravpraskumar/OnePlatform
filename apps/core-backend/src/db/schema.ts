import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ---- Enums ----
export const roleScopeEnum = pgEnum('role_scope', ['global', 'org']);
export const menuTypeEnum = pgEnum('menu_type', ['Global', 'Secured']);
export const membershipEnum = pgEnum('membership', ['Owner', 'Admin', 'Member']);
export const statusEnum = pgEnum('entity_status', ['active', 'suspended', 'pending']);
export const projectStatusEnum = pgEnum('project_status', ['planned', 'active', 'on_hold', 'completed', 'cancelled']);
export const menuAccessModeEnum = pgEnum('menu_access_mode', ['readonly', 'editable']);

export interface NotificationPreferences {
  accessChanges: boolean;
  projectUpdates: boolean;
  sessionAlerts: boolean;
  platformAnnouncements: boolean;
  digest: 'instant' | 'daily' | 'weekly' | 'off';
}

export interface ThemePreferences {
  mode: 'light' | 'dark';
  preset: 'slate' | 'ocean' | 'forest' | 'rose';
  radius: number;
  brandColor: string;
}

// ---- Users (credentials owned by Azure AD B2C; no password stored) ----
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    b2cOid: varchar('b2c_oid', { length: 64 }).unique(),
    email: varchar('email', { length: 320 }).notNull(),
    displayName: varchar('display_name', { length: 200 }).notNull(),
    firstName: varchar('first_name', { length: 100 }),
    lastName: varchar('last_name', { length: 100 }),
    username: varchar('username', { length: 100 }).unique(),
    // Set for local email/password accounts; null for B2C-only accounts.
    passwordHash: varchar('password_hash', { length: 255 }),
    notificationPreferences: jsonb('notification_preferences').$type<NotificationPreferences>(),
    themePreferences: jsonb('theme_preferences').$type<ThemePreferences>(),
    status: statusEnum('status').notNull().default('active'),
    lastSignedInAt: timestamp('last_signed_in_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
  }),
);

// ---- Roles (Global Administrator, Organisation Administrator, General User) ----
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  scope: roleScopeEnum('scope').notNull().default('global'),
  description: text('description'),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }),
});

// ---- User <-> Role assignment (org_id null => global role) ----
export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id').references(() => organisations.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    uniq: uniqueIndex('user_roles_unique_idx').on(t.userId, t.roleId, t.orgId),
  }),
);

// ---- Products / Modules (CreditGuard, PRIME) ----
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---- Menus (application screens); self-referencing hierarchy ----
export const menus = pgTable(
  'menus',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id'),
    name: varchar('name', { length: 150 }).notNull(),
    route: varchar('route', { length: 300 }),
    icon: varchar('icon', { length: 100 }),
    type: menuTypeEnum('type').notNull().default('Secured'),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    displayOrder: integer('display_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => ({
    parentIdx: index('menus_parent_idx').on(t.parentId),
    productIdx: index('menus_product_idx').on(t.productId),
  }),
);

// ---- Role <-> Menu (screen) assignment ----
export const rolesMenus = pgTable(
  'roles_menus',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    menuId: uuid('menu_id')
      .notNull()
      .references(() => menus.id, { onDelete: 'cascade' }),
    accessMode: menuAccessModeEnum('access_mode').notNull().default('editable'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.roleId, t.menuId] }),
  }),
);

// ---- Organisations (Global seeded by default) ----
export const organisations = pgTable('organisations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 120 }).notNull().unique(),
  status: statusEnum('status').notNull().default('active'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---- Organisation <-> User membership ----
export const organisationUsers = pgTable(
  'organisation_users',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    membership: membershipEnum('membership').notNull().default('Member'),
    status: statusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.userId] }),
  }),
);

export const organisationTeams = pgTable(
  'organisation_teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 150 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgNameIdx: uniqueIndex('organisation_teams_org_name_idx').on(t.orgId, t.name),
  }),
);

export const organisationTeamUsers = pgTable(
  'organisation_team_users',
  {
    teamId: uuid('team_id')
      .notNull()
      .references(() => organisationTeams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.teamId, t.userId] }),
  }),
);

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description').notNull(),
    status: projectStatusEnum('status').notNull().default('planned'),
    managerUserId: uuid('manager_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgCodeIdx: uniqueIndex('projects_org_code_idx').on(t.orgId, t.code),
    orgIdx: index('projects_org_idx').on(t.orgId),
  }),
);

// ---- Per-product database connection config (secrets encrypted at rest) ----
export const productDbConnections = pgTable('product_db_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' })
    .unique(),
  host: varchar('host', { length: 255 }).notNull(),
  port: integer('port').notNull().default(5432),
  database: varchar('database', { length: 200 }).notNull(),
  username: varchar('username', { length: 200 }).notNull(),
  // Ciphertext of the password, or a Key Vault secret reference.
  secretRef: text('secret_ref').notNull(),
  ssl: boolean('ssl').notNull().default(true),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---- Organisation <-> Module licensing (concurrent seat count) ----
export const organisationModules = pgTable(
  'organisation_modules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').references(() => organisationTeams.id, { onDelete: 'set null' }),
    licensedSeats: integer('licensed_seats').notNull().default(0),
    status: statusEnum('status').notNull().default('active'),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp('valid_to', { withTimezone: true }),
  },
  (t) => ({
    orgProductIdx: uniqueIndex('org_modules_org_product_idx').on(t.orgId, t.productId),
  }),
);

export const projectModules = pgTable(
  'project_modules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organisationModuleId: uuid('organisation_module_id')
      .notNull()
      .references(() => organisationModules.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    allocatedSeats: integer('allocated_seats').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    moduleProjectIdx: uniqueIndex('project_modules_module_project_idx').on(t.organisationModuleId, t.projectId),
  }),
);

export const organisationUserProjects = pgTable(
  'organisation_user_projects',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.userId, t.projectId] }),
  }),
);

export const userModuleProjects = pgTable(
  'user_module_projects',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.orgId, t.productId] }),
  }),
);

// ---- Sessions (concurrent-license enforcement) ----
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    ip: varchar('ip', { length: 64 }),
    userAgent: varchar('user_agent', { length: 512 }),
  },
  (t) => ({
    activeIdx: index('sessions_active_idx').on(t.orgId, t.productId, t.endedAt),
  }),
);

// ---- Global application settings (single row) ----
export const appSettings = pgTable('app_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Organisation newly registered users are added to by default.
  defaultOrgId: uuid('default_org_id').references(() => organisations.id, { onDelete: 'set null' }),
  sessionTimeoutMinutes: integer('session_timeout_minutes').notNull().default(30),
  headerColor: varchar('header_color', { length: 20 }).notNull().default('#ffffff'),
  headerTextColor: varchar('header_text_color', { length: 20 }).notNull().default('#0f172a'),
  bannerEnabled: boolean('banner_enabled').notNull().default(false),
  bannerBgColor: varchar('banner_bg_color', { length: 20 }).notNull().default('#1e3a8a'),
  bannerTextColor: varchar('banner_text_color', { length: 20 }).notNull().default('#ffffff'),
  // Banner body; HTML is allowed (admin-authored).
  bannerContent: text('banner_content'),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const smtpConfigurations = pgTable(
  'smtp_configurations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appSettingsId: uuid('app_settings_id')
      .notNull()
      .references(() => appSettings.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    host: varchar('host', { length: 255 }).notNull(),
    port: integer('port').notNull().default(587),
    username: varchar('username', { length: 200 }),
    passwordSecret: text('password_secret').notNull(),
    fromName: varchar('from_name', { length: 150 }).notNull(),
    fromEmail: varchar('from_email', { length: 254 }).notNull(),
    secure: boolean('secure').notNull().default(true),
    enabled: boolean('enabled').notNull().default(true),
    isDefault: boolean('is_default').notNull().default(false),
    priority: integer('priority').notNull(),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    settingsPriorityIdx: uniqueIndex('smtp_configurations_settings_priority_idx').on(t.appSettingsId, t.priority),
  }),
);

// ---- Relations ----
export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(organisationUsers),
  roles: many(userRoles),
}));

export const organisationsRelations = relations(organisations, ({ many, one }) => ({
  members: many(organisationUsers),
  modules: many(organisationModules),
  owner: one(users, { fields: [organisations.ownerUserId], references: [users.id] }),
}));

export const menusRelations = relations(menus, ({ one, many }) => ({
  parent: one(menus, { fields: [menus.parentId], references: [menus.id], relationName: 'menu_parent' }),
  children: many(menus, { relationName: 'menu_parent' }),
  product: one(products, { fields: [menus.productId], references: [products.id] }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  connection: one(productDbConnections),
  menus: many(menus),
}));

export type User = typeof users.$inferSelect;
export type Organisation = typeof organisations.$inferSelect;
export type Menu = typeof menus.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type AppSettings = typeof appSettings.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type OrganisationTeam = typeof organisationTeams.$inferSelect;
export type ProjectModule = typeof projectModules.$inferSelect;
export type SmtpConfiguration = typeof smtpConfigurations.$inferSelect;
