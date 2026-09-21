import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { CORE_DB } from '../db/database.module';
import type { CoreDb } from '../db';
import { users } from '../db/schema';
import { hashPassword, verifyPassword } from '../common/password';
import { UsersService } from '../users/users.service';
import { LocalTokenService } from './local-token.service';
import { UserProvisioningService } from './user-provisioning.service';
import { AuthUser } from './auth-user.interface';

export interface AuthResult {
  accessToken: string;
  user: AuthUser;
}

@Injectable()
export class LocalAuthService {
  constructor(
    @Inject(CORE_DB) private readonly db: CoreDb,
    private readonly tokens: LocalTokenService,
    private readonly provisioning: UserProvisioningService,
    private readonly usersService: UsersService,
  ) {}

  async register(input: { email: string; password: string; displayName: string }): Promise<AuthResult> {
    const email = input.email.toLowerCase().trim();
    const [existing] = await this.db.select().from(users).where(eq(users.email, email));
    if (existing) throw new ConflictException('An account with this email already exists');

    const passwordHash = await hashPassword(input.password);
    const [user] = await this.db
      .insert(users)
      .values({ email, displayName: input.displayName, passwordHash, status: 'active' })
      .returning();

    // New signups default into McDermott IT with the General User role.
    await this.usersService.ensureDefaultMembership(user.id);

    return this.issue(user.id);
  }

  async login(input: { email: string; password: string }): Promise<AuthResult> {
    const email = input.email.toLowerCase().trim();
    const [user] = await this.db.select().from(users).where(eq(users.email, email));
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid email or password');

    return this.issue(user.id);
  }

  async issueForUser(userId: string): Promise<AuthResult> {
    return this.issue(userId);
  }

  private async issue(userId: string): Promise<AuthResult> {
    await this.usersService.touchLastSignedIn(userId);
    const authUser = await this.provisioning.resolveById(userId);
    const accessToken = this.tokens.sign({ sub: authUser.id, email: authUser.email });
    return { accessToken, user: authUser };
  }
}
