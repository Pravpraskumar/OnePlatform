import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { HealthController, CaptureProController } from './app.controller';
import { ProductAuthGuard } from './auth/product-auth.guard';
import { CaptureProService } from './capture-pro.service';
import { DatabaseModule } from './db/database.module';
import {
  SalesforceAccountsController, SalesforceBidBudgetsController, SalesforceCompetitorsController, SalesforceFabricationYardsController,
  SalesforceOpportunitiesController, SalesforceVesselsController,
} from './salesforce/salesforce-opportunities.controller';
import { SalesforceOpportunitiesService } from './salesforce/salesforce-opportunities.service';
import { SpinergieChartersController, SpinergieVesselsController } from './salesforce/spinergie-vessels.controller';
import { FoundryChatController } from './foundry-chat.controller';
import { FoundryChatService } from './foundry-chat.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: resolve(__dirname, '../../../.env') }), DatabaseModule],
  controllers: [
    HealthController, CaptureProController, SalesforceOpportunitiesController, SalesforceAccountsController, SalesforceCompetitorsController,
    SalesforceBidBudgetsController, SalesforceFabricationYardsController, SalesforceVesselsController, SpinergieVesselsController, SpinergieChartersController, FoundryChatController,
  ],
  providers: [ProductAuthGuard, CaptureProService, SalesforceOpportunitiesService, FoundryChatService],
})
export class AppModule {}