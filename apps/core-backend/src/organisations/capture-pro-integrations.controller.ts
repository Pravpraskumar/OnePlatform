import { Body, Controller, Delete, Get, Header, Headers, HttpCode, Param, ParseUUIDPipe, Post, Put, ValidationPipe } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { CaptureProIntegrationsService } from './capture-pro-integrations.service';
import { SalesforceIntegrationDto, SpinergieIntegrationDto } from './dto/capture-pro-integration.dto';

const validation = { whitelist: true, forbidNonWhitelisted: true, transform: true, validationError: { target: false, value: false } };

// Mapped body types preserve unknown fields until the strict route-specific validation pipe runs.
@Controller('organisations/:orgId/modules/:productId/integrations/capture-pro')
export class CaptureProIntegrationsController {
  constructor(private readonly integrations: CaptureProIntegrationsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  get(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.integrations.get(orgId, productId, user);
  }

  @Put('salesforce')
  @Header('Cache-Control', 'no-store')
  saveSalesforce(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body(new ValidationPipe({ ...validation, expectedType: SalesforceIntegrationDto })) input: Pick<SalesforceIntegrationDto, keyof SalesforceIntegrationDto>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.integrations.saveSalesforce(orgId, productId, input, user);
  }

  @Put('spinergie')
  @Header('Cache-Control', 'no-store')
  saveSpinergie(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body(new ValidationPipe({ ...validation, expectedType: SpinergieIntegrationDto })) input: Pick<SpinergieIntegrationDto, keyof SpinergieIntegrationDto>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.integrations.saveSpinergie(orgId, productId, input, user);
  }

  @Post('salesforce/opportunities/extract')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  extractSalesforceOpportunities(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Headers('x-capturepro-service-key') serviceKey: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.integrations.extractSalesforceOpportunities(orgId, productId, serviceKey, user);
  }

  @Post('salesforce/accounts/extract')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  extractSalesforceAccounts(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Headers('x-capturepro-service-key') serviceKey: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.integrations.extractSalesforceAccounts(orgId, productId, serviceKey, user);
  }

  @Post('salesforce/competitors/extract')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  extractSalesforceCompetitors(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Headers('x-capturepro-service-key') serviceKey: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.integrations.extractSalesforceCompetitors(orgId, productId, serviceKey, user);
  }

  @Post('salesforce/bid-budgets/extract')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  extractSalesforceBidBudgets(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Headers('x-capturepro-service-key') serviceKey: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.integrations.extractSalesforceBidBudgets(orgId, productId, serviceKey, user);
  }

  @Post('salesforce/fabrication-yards/extract')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  extractSalesforceFabricationYards(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Headers('x-capturepro-service-key') serviceKey: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.integrations.extractSalesforceFabricationYards(orgId, productId, serviceKey, user);
  }

  @Post('salesforce/vessels/extract')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  extractSalesforceVessels(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Headers('x-capturepro-service-key') serviceKey: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.integrations.extractSalesforceVessels(orgId, productId, serviceKey, user);
  }

  @Post('spinergie/vessels/extract')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  extractSpinergieVessels(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Headers('x-capturepro-service-key') serviceKey: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.integrations.extractSpinergieVessels(orgId, productId, serviceKey, user);
  }

  @Post('spinergie/charters/extract')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  extractSpinergieCharters(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Headers('x-capturepro-service-key') serviceKey: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.integrations.extractSpinergieCharters(orgId, productId, serviceKey, user);
  }

  @Delete('salesforce')
  @Header('Cache-Control', 'no-store')
  removeSalesforce(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.integrations.remove(orgId, productId, 'salesforce', user);
  }

  @Delete('spinergie')
  @Header('Cache-Control', 'no-store')
  removeSpinergie(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.integrations.remove(orgId, productId, 'spinergie', user);
  }
}
