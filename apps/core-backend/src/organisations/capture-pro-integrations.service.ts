import { timingSafeEqual } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, isNull, lte, or } from 'drizzle-orm';
import type { AuthUser } from '../auth/auth-user.interface';
import { decryptSecret, encryptSecret } from '../common/crypto';
import type { CoreDb } from '../db';
import { CORE_DB } from '../db/database.module';
import { organisationModules, organisationProductIntegrations, organisations, organisationUsers, products, roles, userRoles } from '../db/schema';
import type { SalesforceIntegrationDto, SpinergieIntegrationDto } from './dto/capture-pro-integration.dto';
import { fetchSpinergieVesselCharters, fetchSpinergieVesselSpecs } from './spinergie-vessel-extract';
import {
  extractSalesforceAccounts, extractSalesforceBidBudgets, extractSalesforceCompetitors, extractSalesforceFabricationYards,
  extractSalesforceOpportunities, extractSalesforceVessels,
} from './salesforce-opportunity-extract';

type IntegrationRow = typeof organisationProductIntegrations.$inferSelect;

@Injectable()
export class CaptureProIntegrationsService {
  private readonly logger = new Logger(CaptureProIntegrationsService.name);

  constructor(@Inject(CORE_DB) private readonly db: CoreDb, private readonly config: ConfigService) {}

  private assertCaptureProService(serviceKey: string | undefined) {
    const expected = this.config.get<string>('CAPTUREPRO_INTERNAL_API_KEY');
    if (!expected || !serviceKey) throw new ForbiddenException('Capture-Pro service authentication required');
    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(serviceKey);
    if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
      throw new ForbiddenException('Capture-Pro service authentication required');
    }
  }

  private async assertAdministrator(orgId: string, productId: string, user: AuthUser) {
    if (!user.globalRoles.includes('Global Administrator')) {
      const [member] = await this.db.select({ membership: organisationUsers.membership })
        .from(organisationUsers).where(and(
          eq(organisationUsers.orgId, orgId),
          eq(organisationUsers.userId, user.id),
          eq(organisationUsers.status, 'active'),
        ));
      if (!member) throw new ForbiddenException('Capture-Pro integration administrator access required');
      if (!['Owner', 'Admin'].includes(member.membership)) {
        const [assignment] = await this.db.select({ id: userRoles.id }).from(userRoles)
          .innerJoin(roles, eq(roles.id, userRoles.roleId)).where(and(
            eq(userRoles.userId, user.id),
            or(isNull(userRoles.orgId), eq(userRoles.orgId, orgId)),
            eq(roles.productId, productId),
            eq(roles.name, 'Capture-Pro Module Administrator'),
          ));
        if (!assignment) throw new ForbiddenException('Capture-Pro integration administrator access required');
      }
    }
    const now = new Date();
    const [module] = await this.db.select({ id: organisationModules.id }).from(organisationModules)
      .innerJoin(products, eq(products.id, organisationModules.productId))
      .innerJoin(organisations, eq(organisations.id, organisationModules.orgId))
      .where(and(
        eq(organisationModules.orgId, orgId),
        eq(organisationModules.productId, productId),
        eq(organisationModules.status, 'active'),
        lte(organisationModules.validFrom, now),
        or(isNull(organisationModules.validTo), gt(organisationModules.validTo, now)),
        eq(products.code, 'Capture-Pro'),
        eq(products.isActive, true),
        eq(organisations.status, 'active'),
      ));
    if (!module) throw new ForbiddenException('An active Capture-Pro organisation assignment is required');
  }

  private async readRows(orgId: string, productId: string) {
    return this.db.select().from(organisationProductIntegrations).where(and(
      eq(organisationProductIntegrations.orgId, orgId),
      eq(organisationProductIntegrations.productId, productId),
      or(eq(organisationProductIntegrations.provider, 'salesforce'), eq(organisationProductIntegrations.provider, 'spinergie')),
    ));
  }

  private salesforceCredentials(row: IntegrationRow | undefined) {
    if (!row?.authorizationSecret) return null;
    if (!row.authorizationSecret.startsWith('enc:')) {
      throw new InternalServerErrorException('Stored Salesforce credentials must be encrypted');
    }
    let value: unknown;
    try {
      value = JSON.parse(decryptSecret(row.authorizationSecret));
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      throw new InternalServerErrorException('Stored Salesforce configuration is invalid');
    }
    if (!value || typeof value !== 'object' || !('clientId' in value) || typeof value.clientId !== 'string'
      || !('clientSecret' in value) || typeof value.clientSecret !== 'string' || !value.clientId || !value.clientSecret) {
      throw new InternalServerErrorException('Stored Salesforce configuration is invalid');
    }
    return { clientId: value.clientId, clientSecret: value.clientSecret };
  }

  private configuration(rows: IntegrationRow[]) {
    const salesforce = rows.find((row) => row.provider === 'salesforce');
    const spinergie = rows.find((row) => row.provider === 'spinergie');
    const credentials = this.salesforceCredentials(salesforce);
    return {
      salesforce: {
        authType: 'OAuth2.0',
        grantType: 'client_credentials',
        accessTokenUrl: salesforce?.baseUrl ?? '',
        clientId: credentials?.clientId ?? '',
        clientSecretConfigured: !!credentials,
        updatedAt: salesforce?.updatedAt.toISOString() ?? null,
      },
      spinergie: {
        apiKeyConfigured: !!spinergie?.authorizationSecret,
        updatedAt: spinergie?.updatedAt.toISOString() ?? null,
      },
    };
  }

  async get(orgId: string, productId: string, user: AuthUser) {
    await this.assertAdministrator(orgId, productId, user);
    return this.configuration(await this.readRows(orgId, productId));
  }

  async saveSalesforce(orgId: string, productId: string, input: SalesforceIntegrationDto, user: AuthUser) {
    await this.assertAdministrator(orgId, productId, user);
    const url = new URL(input.accessTokenUrl);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.salesforce.com')
      || url.pathname !== '/services/oauth2/token' || url.username || url.password || url.search || url.hash
      || (url.port && url.port !== '443')) {
      throw new BadRequestException('Access Token URL must be a Salesforce HTTPS /services/oauth2/token endpoint without credentials, query parameters, or fragments');
    }
    const rows = await this.readRows(orgId, productId);
    const existing = rows.find((row) => row.provider === 'salesforce');
    const previous = this.salesforceCredentials(existing);
    const clientSecret = input.clientSecret ?? previous?.clientSecret;
    if (!clientSecret) throw new BadRequestException('Client Secret is required for initial configuration');
    if (!input.clientSecret && previous && (input.clientId !== previous.clientId || url.toString() !== existing?.baseUrl)) {
      throw new BadRequestException('Provide a new Client Secret when changing the Client ID or Access Token URL');
    }
    if (!input.clientSecret) return this.configuration(rows);
    await this.upsert(orgId, productId, 'salesforce', url.toString(), encryptSecret(JSON.stringify({
      clientId: input.clientId,
      clientSecret,
    })), user);
    return this.configuration(await this.readRows(orgId, productId));
  }

  async saveSpinergie(orgId: string, productId: string, input: SpinergieIntegrationDto, user: AuthUser) {
    await this.assertAdministrator(orgId, productId, user);
    await this.upsert(orgId, productId, 'spinergie', null, encryptSecret(input.apiKey), user);
    return this.configuration(await this.readRows(orgId, productId));
  }

  private async upsert(orgId: string, productId: string, provider: string, baseUrl: string | null, authorizationSecret: string, user: AuthUser) {
    const updatedAt = new Date();
    await this.db.insert(organisationProductIntegrations)
      .values({ orgId, productId, provider, baseUrl, authorizationSecret, updatedBy: user.id, updatedAt })
      .onConflictDoUpdate({
        target: [organisationProductIntegrations.orgId, organisationProductIntegrations.productId, organisationProductIntegrations.provider],
        set: { baseUrl, authorizationSecret, updatedBy: user.id, updatedAt },
      });
    this.logger.log({ action: 'Capture-Pro integration settings saved', orgId, productId, provider, actorId: user.id });
  }

  async extractSalesforceOpportunities(orgId: string, productId: string, serviceKey: string | undefined, user: AuthUser) {
    return this.extract(orgId, productId, serviceKey, user, 'opportunities');
  }

  async extractSalesforceAccounts(orgId: string, productId: string, serviceKey: string | undefined, user: AuthUser) {
    return this.extract(orgId, productId, serviceKey, user, 'accounts');
  }

  async extractSalesforceCompetitors(orgId: string, productId: string, serviceKey: string | undefined, user: AuthUser) {
    return this.extract(orgId, productId, serviceKey, user, 'competitors');
  }

  async extractSalesforceBidBudgets(orgId: string, productId: string, serviceKey: string | undefined, user: AuthUser) {
    return this.extract(orgId, productId, serviceKey, user, 'bid-budgets');
  }

  async extractSalesforceFabricationYards(orgId: string, productId: string, serviceKey: string | undefined, user: AuthUser) {
    return this.extract(orgId, productId, serviceKey, user, 'fabrication-yards');
  }

  async extractSalesforceVessels(orgId: string, productId: string, serviceKey: string | undefined, user: AuthUser) {
    return this.extract(orgId, productId, serviceKey, user, 'vessels');
  }

  private async extract(
    orgId: string, productId: string, serviceKey: string | undefined, user: AuthUser,
    object: 'opportunities' | 'accounts' | 'competitors' | 'bid-budgets' | 'fabrication-yards' | 'vessels',
  ) {
    this.assertCaptureProService(serviceKey);
    await this.assertAdministrator(orgId, productId, user);
    const salesforce = (await this.readRows(orgId, productId)).find((row) => row.provider === 'salesforce');
    const credentials = this.salesforceCredentials(salesforce);
    if (!credentials || !salesforce?.baseUrl) throw new ConflictException('Salesforce integration is not configured');
    const extract = {
      opportunities: extractSalesforceOpportunities, accounts: extractSalesforceAccounts,
      competitors: extractSalesforceCompetitors, 'bid-budgets': extractSalesforceBidBudgets,
      'fabrication-yards': extractSalesforceFabricationYards, vessels: extractSalesforceVessels,
    }[object];
    const result = await extract({ tokenUrl: salesforce.baseUrl, ...credentials });
    this.logger.log({
      action: `Salesforce ${object} extracted for Capture-Pro`, orgId, productId, actorId: user.id, recordCount: result.records.length,
    });
    return result;
  }

  async extractSpinergieVessels(orgId: string, productId: string, serviceKey: string | undefined, user: AuthUser) {
    return this.extractSpinergie(orgId, productId, serviceKey, user, 'vessels');
  }

  async extractSpinergieCharters(orgId: string, productId: string, serviceKey: string | undefined, user: AuthUser) {
    return this.extractSpinergie(orgId, productId, serviceKey, user, 'charters');
  }

  private async extractSpinergie(orgId: string, productId: string, serviceKey: string | undefined, user: AuthUser, dataset: 'vessels' | 'charters') {
    this.assertCaptureProService(serviceKey);
    await this.assertAdministrator(orgId, productId, user);
    const settings = (await this.readRows(orgId, productId)).find((row) => row.provider === 'spinergie');
    if (!settings?.authorizationSecret) throw new ConflictException('Spinergie integration is not configured');
    let apiKey: string;
    try { apiKey = decryptSecret(settings.authorizationSecret); }
    catch { throw new InternalServerErrorException('The saved Spinergie API key could not be decrypted.'); }
    if (!apiKey.trim() || /[\r\n]/.test(apiKey)) throw new ConflictException('Save a valid Spinergie API key in Integrations.');
    const records = await (dataset === 'vessels' ? fetchSpinergieVesselSpecs(apiKey) : fetchSpinergieVesselCharters(apiKey));
    return { records };
  }

  async remove(orgId: string, productId: string, provider: 'salesforce' | 'spinergie', user: AuthUser) {
    await this.assertAdministrator(orgId, productId, user);
    await this.db.delete(organisationProductIntegrations).where(and(
      eq(organisationProductIntegrations.orgId, orgId),
      eq(organisationProductIntegrations.productId, productId),
      eq(organisationProductIntegrations.provider, provider),
    ));
    this.logger.log({ action: 'Capture-Pro integration settings removed', orgId, productId, provider, actorId: user.id });
    return this.configuration(await this.readRows(orgId, productId));
  }
}
