import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gt, isNull, or } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import type { AuthUser } from '../auth/auth-user.interface';
import { decryptSecret, encryptSecret } from '../common/crypto';
import type { CoreDb } from '../db';
import { CORE_DB } from '../db/database.module';
import {
  emailDeliveryLogs,
  emailTemplates,
  organisationModules,
  organisationTeamUsers,
  organisationUsers,
  products,
  roles,
  smtpConfigurations,
  userRoles,
  users,
} from '../db/schema';
import type { SendRequestReviewNotificationDto, SendReviewerReassignmentNotificationDto } from './dto/notification.dto';

interface DeliveryLogBase {
  orgId: string | null;
  module: string;
  eventType: string;
  referenceId: string;
  recipientName: string;
  recipientEmail: string;
  subject: string;
  body: string;
  initiatedBy: string;
}

const PLACEHOLDER_PATTERN = /{{\s*([A-Za-z][A-Za-z0-9]*)\s*}}/g;

@Injectable()
export class NotificationsService {
  constructor(@Inject(CORE_DB) private readonly db: CoreDb) {}

  async listReviewers(orgId: string, productId: string, user: AuthUser) {
    const module = await this.requireActiveModuleMember(orgId, productId, user);
    return this.reviewerRows(orgId, productId, module.teamId);
  }

  async sendRequestReview(input: SendRequestReviewNotificationDto, user: AuthUser) {
    const module = await this.requireActiveModuleMember(input.orgId, input.productId, user);
    const reviewers = await this.reviewerRows(input.orgId, input.productId, module.teamId);
    const reviewer = reviewers.find((candidate) => candidate.id === input.reviewerUserId);
    if (!reviewer) throw new BadRequestException('Selected user is not an eligible CreditGuard reviewer');

    const rendered = await this.renderTemplate(input.productId, 'request-review', {
      recipientName: reviewer.displayName,
      requestNumber: input.requestNumber,
      instrumentType: input.instrumentType,
      applicant: input.applicant,
      beneficiary: input.beneficiary,
      amount: input.amount.toLocaleString('en-US'),
      currency: input.currency.toUpperCase(),
      requestedBy: input.requestedBy,
    });
    const logBase = {
      orgId: input.orgId,
      module: 'CreditGuard',
      eventType: 'Request Review',
      referenceId: input.requestId,
      recipientName: reviewer.displayName,
      recipientEmail: reviewer.email,
      subject: rendered.subject,
      body: rendered.body,
      initiatedBy: user.id,
    };
    return this.deliver(logBase);
  }

  async sendReviewerReassignment(input: SendReviewerReassignmentNotificationDto, user: AuthUser) {
    const module = await this.requireActiveModuleMember(input.orgId, input.productId, user);
    const reviewers = await this.reviewerRows(input.orgId, input.productId, module.teamId);
    const newReviewer = reviewers.find((candidate) => candidate.id === input.newReviewerUserId);
    if (!newReviewer) throw new BadRequestException('Selected user is not an eligible CreditGuard reviewer');
    if (input.previousReviewerUserId === input.newReviewerUserId) {
      throw new BadRequestException('Previous and new reviewers must be different');
    }

    const [previousReviewer] = await this.db
      .select({ displayName: users.displayName, email: users.email })
      .from(users)
      .innerJoin(organisationUsers, and(
        eq(organisationUsers.userId, users.id),
        eq(organisationUsers.orgId, input.orgId),
      ))
      .where(eq(users.id, input.previousReviewerUserId));
    if (!previousReviewer) throw new BadRequestException('Previous reviewer is not a member of this organisation');

    const rendered = await this.renderTemplate(input.productId, 'review-reassignment', {
      recipientName: previousReviewer.displayName,
      requestNumber: input.requestNumber,
      newReviewerName: newReviewer.displayName,
    });
    return this.deliver({
      orgId: input.orgId,
      module: 'CreditGuard',
      eventType: 'Review Reassignment',
      referenceId: input.requestId,
      recipientName: previousReviewer.displayName,
      recipientEmail: previousReviewer.email,
      subject: rendered.subject,
      body: rendered.body,
      initiatedBy: user.id,
    });
  }

  listEmailLogs(module?: string, status?: string) {
    const filters = [
      module?.trim() ? eq(emailDeliveryLogs.module, module.trim()) : undefined,
      status?.trim() ? eq(emailDeliveryLogs.status, status.trim()) : undefined,
    ].filter((filter): filter is NonNullable<typeof filter> => !!filter);
    return this.db
      .select({
        id: emailDeliveryLogs.id,
        orgId: emailDeliveryLogs.orgId,
        module: emailDeliveryLogs.module,
        eventType: emailDeliveryLogs.eventType,
        referenceId: emailDeliveryLogs.referenceId,
        recipientName: emailDeliveryLogs.recipientName,
        recipientEmail: emailDeliveryLogs.recipientEmail,
        subject: emailDeliveryLogs.subject,
        status: emailDeliveryLogs.status,
        smtpConfigurationId: emailDeliveryLogs.smtpConfigurationId,
        smtpConfigurationName: emailDeliveryLogs.smtpConfigurationName,
        providerMessageId: emailDeliveryLogs.providerMessageId,
        errorMessage: emailDeliveryLogs.errorMessage,
        initiatedBy: emailDeliveryLogs.initiatedBy,
        sentAt: emailDeliveryLogs.sentAt,
        createdAt: emailDeliveryLogs.createdAt,
      })
      .from(emailDeliveryLogs)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(emailDeliveryLogs.createdAt))
      .limit(200);
  }

  async retryEmailLog(logId: string, user: AuthUser) {
    const [failedLog] = await this.db
      .select()
      .from(emailDeliveryLogs)
      .where(and(eq(emailDeliveryLogs.id, logId), eq(emailDeliveryLogs.status, 'Failed')));
    if (!failedLog) throw new NotFoundException('Failed email delivery log not found');

    return this.deliver({
      orgId: failedLog.orgId,
      module: failedLog.module,
      eventType: failedLog.eventType,
      referenceId: failedLog.referenceId,
      recipientName: failedLog.recipientName,
      recipientEmail: failedLog.recipientEmail,
      subject: failedLog.subject,
      body: failedLog.bodyCiphertext ? decryptSecret(failedLog.bodyCiphertext) : [
        `Hello ${failedLog.recipientName},`,
        '',
        `This is a retry of the ${failedLog.module} ${failedLog.eventType} notification.`,
        `Reference: ${failedLog.referenceId}`,
        '',
        'Sign in to Designer Platform for more information.',
      ].join('\n'),
      initiatedBy: user.id,
    });
  }

  listEmailTemplates() {
    return this.db
      .select({
        id: emailTemplates.id,
        productId: emailTemplates.productId,
        productCode: products.code,
        productName: products.name,
        eventKey: emailTemplates.eventKey,
        eventName: emailTemplates.eventName,
        subjectTemplate: emailTemplates.subjectTemplate,
        bodyTemplate: emailTemplates.bodyTemplate,
        availablePlaceholders: emailTemplates.availablePlaceholders,
        updatedAt: emailTemplates.updatedAt,
      })
      .from(emailTemplates)
      .innerJoin(products, eq(products.id, emailTemplates.productId))
      .orderBy(asc(products.name), asc(emailTemplates.eventName));
  }

  async updateEmailTemplate(
    id: string,
    input: { subjectTemplate: string; bodyTemplate: string },
    userId: string,
  ) {
    const [template] = await this.db.select().from(emailTemplates).where(eq(emailTemplates.id, id));
    if (!template) throw new NotFoundException('Email template not found');
    const subjectTemplate = input.subjectTemplate.trim();
    const bodyTemplate = input.bodyTemplate.trim();
    if (!subjectTemplate || !bodyTemplate) throw new BadRequestException('Subject and body are required');
    this.validatePlaceholders(subjectTemplate, template.availablePlaceholders);
    this.validatePlaceholders(bodyTemplate, template.availablePlaceholders);
    const [updated] = await this.db
      .update(emailTemplates)
      .set({ subjectTemplate, bodyTemplate, updatedBy: userId, updatedAt: new Date() })
      .where(eq(emailTemplates.id, id))
      .returning();
    return updated;
  }

  private async renderTemplate(productId: string, eventKey: string, values: Record<string, string>) {
    const [template] = await this.db
      .select()
      .from(emailTemplates)
      .where(and(eq(emailTemplates.productId, productId), eq(emailTemplates.eventKey, eventKey)));
    if (!template) throw new NotFoundException(`Email template is not configured for event ${eventKey}`);
    const render = (value: string) => value.replace(PLACEHOLDER_PATTERN, (_match, key: string) => {
      if (!(key in values)) throw new BadRequestException(`Email template value is unavailable: ${key}`);
      return values[key];
    });
    return { subject: render(template.subjectTemplate), body: render(template.bodyTemplate) };
  }

  private validatePlaceholders(value: string, available: string[]) {
    const unknown = [...value.matchAll(PLACEHOLDER_PATTERN)]
      .map((match) => match[1])
      .filter((placeholder) => !available.includes(placeholder));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown email template placeholders: ${[...new Set(unknown)].join(', ')}`);
    }
  }

  private async deliver(logBase: DeliveryLogBase) {
    const { body, ...logValues } = logBase;
    const bodyCiphertext = encryptSecret(body);
    const [smtp] = await this.db
      .select()
      .from(smtpConfigurations)
      .where(eq(smtpConfigurations.enabled, true))
      .orderBy(desc(smtpConfigurations.isDefault), asc(smtpConfigurations.priority))
      .limit(1);

    if (!smtp) {
      const message = 'No enabled SMTP configuration is available';
      const [log] = await this.db.insert(emailDeliveryLogs).values({
        ...logValues,
        bodyCiphertext,
        status: 'Failed',
        errorMessage: message,
      }).returning({ id: emailDeliveryLogs.id });
      return { status: 'failed' as const, logId: log.id, message };
    }

    try {
      const transport = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        tls: smtp.ignoreTlsCertificateErrors || process.env.NEXT_PRIVATE_SMTP_UNSAFE_IGNORE_TLS?.toLowerCase() === 'true'
          ? { rejectUnauthorized: false }
          : undefined,
        auth: smtp.username && smtp.passwordSecret
          ? { user: smtp.username, pass: decryptSecret(smtp.passwordSecret) }
          : undefined,
      });
      const result = await transport.sendMail({
        from: { name: smtp.fromName, address: smtp.fromEmail },
        to: { name: logBase.recipientName, address: logBase.recipientEmail },
        subject: logBase.subject,
        text: logBase.body,
      });
      const [log] = await this.db.insert(emailDeliveryLogs).values({
        ...logValues,
        bodyCiphertext,
        status: 'Sent',
        smtpConfigurationId: smtp.id,
        smtpConfigurationName: smtp.name,
        providerMessageId: result.messageId?.slice(0, 300) || null,
        sentAt: new Date(),
      }).returning({ id: emailDeliveryLogs.id });
      return { status: 'sent' as const, logId: log.id };
    } catch (error) {
      const message = this.safeError(error);
      const [log] = await this.db.insert(emailDeliveryLogs).values({
        ...logValues,
        bodyCiphertext,
        status: 'Failed',
        smtpConfigurationId: smtp.id,
        smtpConfigurationName: smtp.name,
        errorMessage: message,
      }).returning({ id: emailDeliveryLogs.id });
      return { status: 'failed' as const, logId: log.id, message };
    }
  }

  private async requireActiveModuleMember(orgId: string, productId: string, user: AuthUser) {
    if (!orgId || !productId) throw new BadRequestException('orgId and productId are required');
    const [membership] = await this.db
      .select({ membership: organisationUsers.membership })
      .from(organisationUsers)
      .where(and(
        eq(organisationUsers.orgId, orgId),
        eq(organisationUsers.userId, user.id),
        eq(organisationUsers.status, 'active'),
      ));
    if (!membership) throw new ForbiddenException('Active organisation membership is required');
    const canSubmit = membership.membership === 'Owner'
      || membership.membership === 'Admin'
      || user.globalRoles.some((role) => ['Global Administrator', 'CreditGuard Requestor', 'CreditGuard Reviewer'].includes(role));
    if (!canSubmit) throw new ForbiddenException('CreditGuard request access is required');
    const [module] = await this.db
      .select({ teamId: organisationModules.teamId })
      .from(organisationModules)
      .where(and(
        eq(organisationModules.orgId, orgId),
        eq(organisationModules.productId, productId),
        eq(organisationModules.status, 'active'),
        or(isNull(organisationModules.validTo), gt(organisationModules.validTo, new Date())),
      ));
    if (!module) throw new NotFoundException('Active organisation module assignment not found');
    return module;
  }

  private reviewerRows(orgId: string, productId: string, teamId: string | null) {
    const baseFilter = and(
      eq(roles.productId, productId),
      eq(roles.name, 'CreditGuard Reviewer'),
      isNull(userRoles.orgId),
      eq(organisationUsers.orgId, orgId),
      eq(organisationUsers.status, 'active'),
    );
    if (teamId) {
      return this.db
        .select({ id: users.id, displayName: users.displayName, email: users.email })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .innerJoin(users, eq(users.id, userRoles.userId))
        .innerJoin(organisationUsers, eq(organisationUsers.userId, users.id))
        .innerJoin(organisationTeamUsers, eq(organisationTeamUsers.userId, users.id))
        .where(and(baseFilter, eq(organisationTeamUsers.teamId, teamId)))
        .orderBy(asc(users.displayName));
    }
    return this.db
      .select({ id: users.id, displayName: users.displayName, email: users.email })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .innerJoin(users, eq(users.id, userRoles.userId))
      .innerJoin(organisationUsers, eq(organisationUsers.userId, users.id))
      .where(baseFilter)
      .orderBy(asc(users.displayName));
  }

  private safeError(error: unknown) {
    const smtpError = error as {
      message?: unknown;
      code?: unknown;
      response?: unknown;
      responseCode?: unknown;
      command?: unknown;
      errno?: unknown;
      syscall?: unknown;
      address?: unknown;
      port?: unknown;
    };
    const value = (field: unknown) => ['string', 'number'].includes(typeof field) ? String(field) : null;
    const message = error instanceof Error ? error.message : value(smtpError?.message) ?? 'SMTP delivery failed';
    const response = value(smtpError?.response);
    const networkLocation = [value(smtpError?.address), value(smtpError?.port)].filter(Boolean).join(':');
    const details = [
      message,
      value(smtpError?.code) ? `Code: ${value(smtpError.code)}` : null,
      value(smtpError?.responseCode) ? `SMTP status: ${value(smtpError.responseCode)}` : null,
      response && response !== message ? `Server response: ${response}` : null,
      value(smtpError?.command) ? `SMTP command: ${value(smtpError.command)}` : null,
      value(smtpError?.syscall) ? `Network operation: ${value(smtpError.syscall)}` : null,
      networkLocation ? `Server: ${networkLocation}` : null,
      value(smtpError?.errno) && value(smtpError.errno) !== value(smtpError.code) ? `System error: ${value(smtpError.errno)}` : null,
    ].filter((detail): detail is string => !!detail);

    return details
      .join('\n')
      .replace(/:\/\/[^\s/@:]+:[^\s/@]+@/g, '://[redacted]@')
      .replace(/\b(bearer|pass(word)?|secret|token)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]')
      .slice(0, 4000);
  }
}