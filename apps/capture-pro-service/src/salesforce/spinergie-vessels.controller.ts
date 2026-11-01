import { BadRequestException, Body, Controller, Get, Header, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ProductAuthGuard, type ProductAuthenticatedRequest } from '../auth/product-auth.guard';
import { SalesforceOpportunitiesService } from './salesforce-opportunities.service';

@Controller('spinergie-vessels')
@UseGuards(ProductAuthGuard)
export class SpinergieVesselsController {
  constructor(private readonly service: SalesforceOpportunitiesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query('orgId') orgId: unknown, @Query('includeRemoved') includeRemoved: unknown, @Req() request: ProductAuthenticatedRequest) {
    return this.service.listSpinergieVessels(orgId, includeRemoved, request.user!, request.headers.authorization!);
  }

  @Get('sync-runs')
  @Header('Cache-Control', 'no-store')
  runs(@Query('orgId') orgId: unknown, @Req() request: ProductAuthenticatedRequest) {
    return this.service.spinergieSyncLog(orgId, request.user!, request.headers.authorization!);
  }

  @Post('sync')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  sync(@Body() body: { orgId?: unknown } | undefined, @Req() request: ProductAuthenticatedRequest) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => key !== 'orgId')) {
      throw new BadRequestException('Only an organisation identifier is accepted.');
    }
    return this.service.syncSpinergieVessels(body.orgId, request.user!, request.headers.authorization!);
  }
}

@Controller('spinergie-charters')
@UseGuards(ProductAuthGuard)
export class SpinergieChartersController {
  constructor(private readonly service: SalesforceOpportunitiesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query('orgId') orgId: unknown, @Query('includeRemoved') includeRemoved: unknown, @Req() request: ProductAuthenticatedRequest) {
    return this.service.listSpinergieCharters(orgId, includeRemoved, request.user!, request.headers.authorization!);
  }

  @Get('sync-runs')
  @Header('Cache-Control', 'no-store')
  runs(@Query('orgId') orgId: unknown, @Req() request: ProductAuthenticatedRequest) {
    return this.service.spinergieCharterSyncLog(orgId, request.user!, request.headers.authorization!);
  }

  @Post('sync')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  sync(@Body() body: { orgId?: unknown } | undefined, @Req() request: ProductAuthenticatedRequest) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => key !== 'orgId')) throw new BadRequestException('Only an organisation identifier is accepted.');
    return this.service.syncSpinergieCharters(body.orgId, request.user!, request.headers.authorization!);
  }
}