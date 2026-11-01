import { BadRequestException, Body, Controller, Get, Header, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ProductAuthGuard, type ProductAuthenticatedRequest } from './auth/product-auth.guard';
import { FoundryChatService } from './foundry-chat.service';

function bodyObject(input: unknown, allowed: string[]) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !allowed.includes(key))) throw new BadRequestException('Invalid chat request.');
  return input as Record<string, unknown>;
}

@Controller('agent-chat')
@UseGuards(ProductAuthGuard)
export class FoundryChatController {
  constructor(private readonly chat: FoundryChatService) {}

  @Get('status')
  @Header('Cache-Control', 'no-store')
  status(@Query('orgId') orgId: unknown, @Req() request: ProductAuthenticatedRequest) { return this.chat.status(orgId, request.user!, request.headers.authorization!); }

  @Get('conversations')
  @Header('Cache-Control', 'no-store')
  list(@Query('orgId') orgId: unknown, @Req() request: ProductAuthenticatedRequest) { return this.chat.list(orgId, request.user!, request.headers.authorization!); }

  @Post('conversations')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  create(@Body() input: unknown, @Req() request: ProductAuthenticatedRequest) {
    const body = bodyObject(input, ['orgId']);
    return this.chat.create(body.orgId, request.user!, request.headers.authorization!);
  }

  @Get('conversations/:id')
  @Header('Cache-Control', 'no-store')
  messages(@Query('orgId') orgId: unknown, @Param('id') id: string, @Req() request: ProductAuthenticatedRequest) { return this.chat.messages(orgId, id, request.user!, request.headers.authorization!); }

  @Post('conversations/:id/messages')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  send(@Body() input: unknown, @Param('id') id: string, @Req() request: ProductAuthenticatedRequest) {
    const body = bodyObject(input, ['orgId', 'message', 'context']);
    if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 8000) throw new BadRequestException('Enter a message of up to 8,000 characters.');
    const context = body.context === undefined ? {} : bodyObject(body.context, ['opportunityId', 'vesselId', 'charterId']);
    for (const value of Object.values(context)) if (typeof value !== 'string' || value.length > 100) throw new BadRequestException('Invalid source selection.');
    return this.chat.send(body.orgId, id, body.message.trim(), {
      opportunityId: typeof context.opportunityId === 'string' ? context.opportunityId : undefined,
      vesselId: typeof context.vesselId === 'string' ? context.vesselId : undefined,
      charterId: typeof context.charterId === 'string' ? context.charterId : undefined,
    }, request.user!, request.headers.authorization!);
  }
}