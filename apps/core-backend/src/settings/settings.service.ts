import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { CORE_DB } from '../db/database.module';
import type { CoreDb } from '../db';
import { appSettings, organisations, smtpConfigurations, type AppSettings } from '../db/schema';
import { encryptSecret } from '../common/crypto';

export interface UpdateSettingsInput {
  defaultOrgId?: string | null;
  sessionTimeoutMinutes?: number;
  headerColor?: string;
  headerTextColor?: string;
  bannerEnabled?: boolean;
  bannerBgColor?: string;
  bannerTextColor?: string;
  bannerContent?: string | null;
}

interface SmtpConfigurationInput {
  id?: string;
  name: string;
  host: string;
  port: number;
  username?: string | null;
  password?: string;
  fromName: string;
  fromEmail: string;
  secure: boolean;
  ignoreTlsCertificateErrors: boolean;
  enabled: boolean;
  isDefault: boolean;
  priority: number;
}

@Injectable()
export class SettingsService {
  private cache: { value: AppSettings; ts: number } | null = null;
  private readonly ttlMs = 10_000;

  constructor(@Inject(CORE_DB) private readonly db: CoreDb) {}

  // Returns the single settings row, creating a default one if absent.
  async get(): Promise<AppSettings> {
    if (this.cache && Date.now() - this.cache.ts < this.ttlMs) return this.cache.value;

    let [row] = await this.db.select().from(appSettings).limit(1);
    if (!row) {
      const [globalOrg] = await this.db
        .select()
        .from(organisations)
        .where(eq(organisations.slug, 'global'));
      [row] = await this.db
        .insert(appSettings)
        .values({ defaultOrgId: globalOrg?.id ?? null })
        .returning();
    }
    this.cache = { value: row, ts: Date.now() };
    return row;
  }

  async update(input: UpdateSettingsInput, userId: string): Promise<AppSettings> {
    const current = await this.get();
    const [row] = await this.db
      .update(appSettings)
      .set({
        defaultOrgId: input.defaultOrgId !== undefined ? input.defaultOrgId : current.defaultOrgId,
        sessionTimeoutMinutes: input.sessionTimeoutMinutes ?? current.sessionTimeoutMinutes,
        headerColor: input.headerColor ?? current.headerColor,
        headerTextColor: input.headerTextColor ?? current.headerTextColor,
        bannerEnabled: input.bannerEnabled ?? current.bannerEnabled,
        bannerBgColor: input.bannerBgColor ?? current.bannerBgColor,
        bannerTextColor: input.bannerTextColor ?? current.bannerTextColor,
        bannerContent: input.bannerContent !== undefined ? input.bannerContent : current.bannerContent,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(appSettings.id, current.id))
      .returning();
    this.cache = { value: row, ts: Date.now() };
    return row;
  }

  // Banner + theme view safe to expose to any authenticated user.
  async getBanner() {
    const s = await this.get();
    return {
      enabled: s.bannerEnabled,
      bgColor: s.bannerBgColor,
      textColor: s.bannerTextColor,
      content: s.bannerContent,
      headerColor: s.headerColor,
      headerTextColor: s.headerTextColor,
    };
  }

  async getSessionTimeoutSeconds(fallback: number): Promise<number> {
    try {
      const s = await this.get();
      return s.sessionTimeoutMinutes > 0 ? s.sessionTimeoutMinutes * 60 : fallback;
    } catch {
      return fallback;
    }
  }

  async getDefaultOrgId(): Promise<string | null> {
    const s = await this.get();
    return s.defaultOrgId ?? null;
  }

  async getSmtpConfigurations() {
    const settings = await this.get();
    const rows = await this.db
      .select()
      .from(smtpConfigurations)
      .where(eq(smtpConfigurations.appSettingsId, settings.id))
      .orderBy(smtpConfigurations.priority);

    return rows.map(({ passwordSecret, ...configuration }) => ({
      ...configuration,
      passwordConfigured: !!passwordSecret,
    }));
  }

  async updateSmtpConfigurations(configurations: SmtpConfigurationInput[], userId: string) {
    if (configurations.filter((configuration) => configuration.isDefault).length > 1) {
      throw new BadRequestException('Only one SMTP configuration can be the default');
    }

    const settings = await this.get();
    const existing = await this.db
      .select()
      .from(smtpConfigurations)
      .where(eq(smtpConfigurations.appSettingsId, settings.id));
    const existingById = new Map(existing.map((configuration) => [configuration.id, configuration]));

    const values = configurations.map((configuration) => {
      const username = configuration.username?.trim() || null;
      const suppliedPassword = configuration.password || undefined;
      const existingPasswordSecret = configuration.id
        ? existingById.get(configuration.id)?.passwordSecret
        : null;
      if (!username && suppliedPassword) {
        throw new BadRequestException(`A username is required when a password is provided for ${configuration.name}`);
      }
      const passwordSecret = username
        ? suppliedPassword
          ? encryptSecret(suppliedPassword)
          : existingPasswordSecret
        : null;
      if (username && !passwordSecret) {
        throw new BadRequestException(`A password is required when a username is provided for ${configuration.name}`);
      }

      return {
        appSettingsId: settings.id,
        name: configuration.name,
        host: configuration.host,
        port: configuration.port,
        username,
        passwordSecret,
        fromName: configuration.fromName,
        fromEmail: configuration.fromEmail,
        secure: configuration.secure,
        ignoreTlsCertificateErrors: configuration.ignoreTlsCertificateErrors,
        enabled: configuration.enabled,
        isDefault: configuration.isDefault,
        priority: configuration.priority,
        updatedBy: userId,
        updatedAt: new Date(),
      };
    });

    await this.db.transaction(async (tx) => {
      await tx.delete(smtpConfigurations).where(eq(smtpConfigurations.appSettingsId, settings.id));
      if (values.length > 0) await tx.insert(smtpConfigurations).values(values);
    });

    return this.getSmtpConfigurations();
  }
}
