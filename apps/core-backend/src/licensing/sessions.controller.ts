import { Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { SessionsService } from './sessions.service';
import { OpenAdministrationSessionDto, OpenSessionDto } from './dto/open-session.dto';
import { ListSessionsDto } from './dto/list-sessions.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  list(@Query() query: ListSessionsDto, @CurrentUser() user: AuthUser) {
    return this.sessions.listRunning(query.orgId, user);
  }

  @Post()
  open(@Body() dto: OpenSessionDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.sessions.open({
      userId: user.id,
      orgId: dto.orgId,
      productId: dto.productId,
      projectId: dto.projectId,
      ip: dto.ip ?? req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('administration')
  openAdministration(
    @Body() dto: OpenAdministrationSessionDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.sessions.openAdministration({
      userId: user.id,
      orgId: dto.orgId,
      ip: dto.ip ?? req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':id/heartbeat')
  heartbeat(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.sessions.heartbeat(id, user.id);
  }

  @Delete(':id')
  close(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.sessions.close(id, user.id);
  }

  @Get('usage')
  usage(@Query('orgId') orgId: string, @Query('productId') productId: string) {
    return this.sessions.usage(orgId, productId);
  }
}
