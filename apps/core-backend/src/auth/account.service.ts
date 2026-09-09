import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import { CORE_DB } from '../db/database.module';
import type { CoreDb } from '../db';
import { projects, users } from '../db/schema';
import { hashPassword, verifyPassword } from '../common/password';
import type { AuthUser } from './auth-user.interface';
import type { UpdateAccountProfileDto } from './dto/account.dto';

const DEFAULT_THEME = {
  mode: 'light' as const,
  preset: 'slate' as const,
  radius: 6,
  brandColor: '#2563eb',
};

@Injectable()
export class AccountService {
  constructor(@Inject(CORE_DB) private readonly db: CoreDb) {}

  private async findUser(userId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user) throw new NotFoundException('Account not found');
    return user;
  }

  async getProfile(userId: string) {
    const user = await this.findUser(userId);
    const nameParts = user.displayName.trim().split(/\s+/);
    return {
      firstName: user.firstName ?? nameParts[0] ?? '',
      lastName: user.lastName ?? nameParts.slice(1).join(' '),
      email: user.email,
      username: user.username ?? user.email.split('@')[0],
      isLocalAccount: !!user.passwordHash,
    };
  }

  async updateProfile(user: AuthUser, input: UpdateAccountProfileDto) {
    const existing = await this.findUser(user.id);
    const email = input.email.toLowerCase().trim();
    const username = input.username.toLowerCase().trim();
    if (existing.b2cOid && email !== existing.email) {
      throw new BadRequestException('Email is managed by your identity provider');
    }

    const [emailOwner] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), ne(users.id, user.id)));
    if (emailOwner) throw new ConflictException('That email address is already in use');

    const [usernameOwner] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, username), ne(users.id, user.id)));
    if (usernameOwner) throw new ConflictException('That username is already in use');

    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const [updated] = await this.db
      .update(users)
      .set({
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`.trim(),
        email,
        username,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();
    return {
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      username: updated.username,
      displayName: updated.displayName,
      isLocalAccount: !!updated.passwordHash,
    };
  }

  async getThemePreferences(userId: string) {
    const user = await this.findUser(userId);
    return user.themePreferences ?? DEFAULT_THEME;
  }

  async updateThemePreferences(userId: string, preferences: {
    mode: 'light' | 'dark';
    preset: 'slate' | 'ocean' | 'forest' | 'rose';
    radius: number;
    brandColor: string;
  }) {
    const [updated] = await this.db
      .update(users)
      .set({ themePreferences: preferences, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ themePreferences: users.themePreferences });
    if (!updated) throw new NotFoundException('Account not found');
    return updated.themePreferences;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.findUser(userId);
    if (!user.passwordHash) throw new BadRequestException('Password is managed by your identity provider');
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.db
      .update(users)
      .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
      .where(eq(users.id, userId));
    return { success: true };
  }

  async deleteAccount(userId: string, currentPassword?: string) {
    const user = await this.findUser(userId);
    if (user.passwordHash) {
      if (!currentPassword || !(await verifyPassword(currentPassword, user.passwordHash))) {
        throw new UnauthorizedException('Current password is incorrect');
      }
    } else {
      throw new BadRequestException('External accounts must be deleted through the identity provider');
    }

    const [managedProject] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.managerUserId, userId));
    if (managedProject) {
      throw new ConflictException('Reassign managed projects before deleting this account');
    }

    await this.db.delete(users).where(eq(users.id, userId));
    return { success: true };
  }
}