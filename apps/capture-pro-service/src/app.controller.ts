import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ProductAuthGuard, type ProductAuthenticatedRequest } from './auth/product-auth.guard';
import { CaptureProService } from './capture-pro.service';

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'capture-pro-service', time: new Date().toISOString() };
  }
}

@Controller()
@UseGuards(ProductAuthGuard)
export class CaptureProController {
  constructor(private readonly service: CaptureProService) {}

  private user(request: ProductAuthenticatedRequest) {
    return request.user!;
  }

  @Get('overview')
  overview(@Query('orgId') orgId: string, @Req() request: ProductAuthenticatedRequest) {
    return this.service.overview(orgId, this.user(request));
  }

  @Get('opportunities')
  listOpportunities(@Query('orgId') orgId: string, @Req() request: ProductAuthenticatedRequest) {
    return this.service.listOpportunities(orgId, this.user(request));
  }

  @Post('opportunities')
  createOpportunity(@Body() input: Record<string, unknown>, @Req() request: ProductAuthenticatedRequest) {
    return this.service.createOpportunity(String(input.orgId ?? ''), input, this.user(request));
  }

  @Get('data-sets')
  listDataSets(@Query('orgId') orgId: string, @Req() request: ProductAuthenticatedRequest) {
    return this.service.listDataSets(orgId, this.user(request));
  }

  @Get('data-sets/:dataSetId/documents')
  listSourceDocuments(@Param('dataSetId') dataSetId: string, @Query('orgId') orgId: string, @Req() request: ProductAuthenticatedRequest) {
    return this.service.listSourceDocuments(orgId, dataSetId, this.user(request));
  }

  @Post('data-sets/:dataSetId/documents')
  createSourceDocument(@Param('dataSetId') dataSetId: string, @Body() input: Record<string, unknown>, @Req() request: ProductAuthenticatedRequest) {
    return this.service.createSourceDocument(String(input.orgId ?? ''), dataSetId, input, this.user(request));
  }

  @Get('plans')
  listPlans(@Query('orgId') orgId: string, @Req() request: ProductAuthenticatedRequest) {
    return this.service.listPlans(orgId, this.user(request));
  }

  @Post('plans')
  createPlan(@Body() input: Record<string, unknown>, @Req() request: ProductAuthenticatedRequest) {
    return this.service.createPlan(String(input.orgId ?? ''), String(input.opportunityId ?? ''), this.user(request));
  }

  @Get('plans/:planId/source-documents')
  listPlanSourceDocuments(@Param('planId') planId: string, @Query('orgId') orgId: string, @Req() request: ProductAuthenticatedRequest) {
    return this.service.listPlanSourceDocuments(orgId, planId, this.user(request));
  }

  @Get('plans/:planId')
  getPlan(@Param('planId') planId: string, @Query('orgId') orgId: string, @Req() request: ProductAuthenticatedRequest) {
    return this.service.getPlan(orgId, planId, this.user(request));
  }

  @Patch('plans/:planId/sections/:sectionCode')
  updatePlanSection(@Param('planId') planId: string, @Param('sectionCode') sectionCode: string, @Body() input: Record<string, unknown>, @Req() request: ProductAuthenticatedRequest) {
    return this.service.updatePlanSection(String(input.orgId ?? ''), planId, sectionCode, input, this.user(request));
  }

  @Post('plans/:planId/versions')
  createPlanVersion(@Param('planId') planId: string, @Body() input: Record<string, unknown>, @Req() request: ProductAuthenticatedRequest) {
    return this.service.createPlanVersion(String(input.orgId ?? ''), planId, input.changeSummary, this.user(request));
  }

  @Post('plans/:planId/agent-runs')
  createAgentRun(@Param('planId') planId: string, @Body() input: Record<string, unknown>, @Req() request: ProductAuthenticatedRequest) {
    return this.service.createAgentRun(String(input.orgId ?? ''), planId, input, this.user(request));
  }

  @Patch('plans/:planId/status')
  updatePlanStatus(@Param('planId') planId: string, @Body() input: Record<string, unknown>, @Req() request: ProductAuthenticatedRequest) {
    return this.service.updatePlanStatus(String(input.orgId ?? ''), planId, input.status, this.user(request));
  }

  @Get('audit')
  listAudit(@Query('orgId') orgId: string, @Req() request: ProductAuthenticatedRequest) {
    return this.service.listAudit(orgId, this.user(request));
  }
}