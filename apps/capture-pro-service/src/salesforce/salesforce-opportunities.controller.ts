import { Body, Controller, Get, Header, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ProductAuthGuard, type ProductAuthenticatedRequest } from '../auth/product-auth.guard';
import { SalesforceOpportunitiesService } from './salesforce-opportunities.service';

@Controller('salesforce-opportunities')
@UseGuards(ProductAuthGuard)
export class SalesforceOpportunitiesController {
  constructor(private readonly service: SalesforceOpportunitiesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query('orgId') orgId: unknown, @Query('includeRemoved') includeRemoved: unknown, @Req() request: ProductAuthenticatedRequest) {
    return this.service.list(orgId, includeRemoved, request.user!, request.headers.authorization!);
  }

  @Get('sync-status')
  @Header('Cache-Control', 'no-store')
  syncStatus(@Query('orgId') orgId: unknown, @Req() request: ProductAuthenticatedRequest) {
    return this.service.syncStatus(orgId, request.user!, request.headers.authorization!);
  }

  @Get('sync-runs')
  @Header('Cache-Control', 'no-store')
  syncRuns(@Query('orgId') orgId: unknown, @Req() request: ProductAuthenticatedRequest) {
    return this.service.syncRuns(orgId, request.user!, request.headers.authorization!);
  }

  @Post('sync')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  sync(@Body() body: { orgId?: unknown } | undefined, @Req() request: ProductAuthenticatedRequest) {
    return this.service.sync(body?.orgId, request.user!, request.headers.authorization!);
  }
}

@Controller('salesforce-accounts')
@UseGuards(ProductAuthGuard)
export class SalesforceAccountsController {
  constructor(private readonly service: SalesforceOpportunitiesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query('orgId') orgId: unknown, @Query('includeRemoved') includeRemoved: unknown, @Req() request: ProductAuthenticatedRequest) {
    return this.service.listAccounts(orgId, includeRemoved, request.user!, request.headers.authorization!);
  }

  @Post('sync')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  sync(@Body() body: { orgId?: unknown } | undefined, @Req() request: ProductAuthenticatedRequest) {
    return this.service.syncAccounts(body?.orgId, request.user!, request.headers.authorization!);
  }
}

@Controller('salesforce-competitors')
@UseGuards(ProductAuthGuard)
export class SalesforceCompetitorsController {
  constructor(private readonly service: SalesforceOpportunitiesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query('orgId') orgId: unknown, @Query('includeRemoved') includeRemoved: unknown, @Req() request: ProductAuthenticatedRequest) {
    return this.service.listCompetitors(orgId, includeRemoved, request.user!, request.headers.authorization!);
  }

  @Post('sync')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  sync(@Body() body: { orgId?: unknown } | undefined, @Req() request: ProductAuthenticatedRequest) {
    return this.service.syncCompetitors(body?.orgId, request.user!, request.headers.authorization!);
  }
}

@Controller('salesforce-bid-budgets')
@UseGuards(ProductAuthGuard)
export class SalesforceBidBudgetsController {
  constructor(private readonly service: SalesforceOpportunitiesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query('orgId') orgId: unknown, @Query('includeRemoved') includeRemoved: unknown, @Req() request: ProductAuthenticatedRequest) {
    return this.service.listBidBudgets(orgId, includeRemoved, request.user!, request.headers.authorization!);
  }

  @Post('sync')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  sync(@Body() body: { orgId?: unknown } | undefined, @Req() request: ProductAuthenticatedRequest) {
    return this.service.syncBidBudgets(body?.orgId, request.user!, request.headers.authorization!);
  }
}
@Controller('salesforce-fabrication-yards')
@UseGuards(ProductAuthGuard)
export class SalesforceFabricationYardsController {
  constructor(private readonly service: SalesforceOpportunitiesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query('orgId') orgId: unknown, @Query('includeRemoved') includeRemoved: unknown, @Req() request: ProductAuthenticatedRequest) {
    return this.service.listFabricationYards(orgId, includeRemoved, request.user!, request.headers.authorization!);
  }

  @Post('sync')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  sync(@Body() body: { orgId?: unknown } | undefined, @Req() request: ProductAuthenticatedRequest) {
    return this.service.syncFabricationYards(body?.orgId, request.user!, request.headers.authorization!);
  }
}
@Controller('salesforce-vessels')
@UseGuards(ProductAuthGuard)
export class SalesforceVesselsController {
  constructor(private readonly service: SalesforceOpportunitiesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query('orgId') orgId: unknown, @Query('includeRemoved') includeRemoved: unknown, @Req() request: ProductAuthenticatedRequest) {
    return this.service.listVessels(orgId, includeRemoved, request.user!, request.headers.authorization!);
  }

  @Post('sync')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  sync(@Body() body: { orgId?: unknown } | undefined, @Req() request: ProductAuthenticatedRequest) {
    return this.service.syncVessels(body?.orgId, request.user!, request.headers.authorization!);
  }
}