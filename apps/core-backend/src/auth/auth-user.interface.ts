export interface AuthUser {
  // Local platform user id (resolved after JIT provisioning).
  id: string;
  b2cOid: string;
  email: string;
  displayName: string;
  // Global role names resolved from user_roles where org_id IS NULL.
  globalRoles: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
