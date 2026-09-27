import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';
import { Roles } from '../auth/roles.decorator';
import { SendRequestReviewNotificationDto, SendReviewerReassignmentNotificationDto } from './dto/notification.dto';
import { NotificationsService } from './notifications.service';
import { UpdateEmailTemplateDto } from './dto/email-template.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('reviewers')
  reviewers(
    @Query('orgId') orgId: string,
    @Query('productId') productId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notifications.listReviewers(orgId, productId, user);
  }

  @Post('request-review')
  sendRequestReview(@Body() dto: SendRequestReviewNotificationDto, @CurrentUser() user: AuthUser) {
    return this.notifications.sendRequestReview(dto, user);
  }

  @Post('reviewer-reassignment')
  sendReviewerReassignment(@Body() dto: SendReviewerReassignmentNotificationDto, @CurrentUser() user: AuthUser) {
    return this.notifications.sendReviewerReassignment(dto, user);
  }

  @Get('email-logs')
  @Roles('Global Administrator')
  emailLogs(@Query('module') module?: string, @Query('status') status?: string) {
    return this.notifications.listEmailLogs(module, status);
  }

  @Post('email-logs/:id/retry')
  @Roles('Global Administrator')
  retryEmail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.notifications.retryEmailLog(id, user);
  }

  @Get('email-templates')
  @Roles('Global Administrator')
  emailTemplates() {
    return this.notifications.listEmailTemplates();
  }

  @Put('email-templates/:id')
  @Roles('Global Administrator')
  updateEmailTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmailTemplateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notifications.updateEmailTemplate(id, dto, user.id);
  }
}