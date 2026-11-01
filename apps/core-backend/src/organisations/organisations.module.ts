import { Module } from '@nestjs/common';
import { OrganisationsService } from './organisations.service';
import { OrganisationsController } from './organisations.controller';
import { CaptureProIntegrationsController } from './capture-pro-integrations.controller';
import { CaptureProIntegrationsService } from './capture-pro-integrations.service';

@Module({
  controllers: [OrganisationsController, CaptureProIntegrationsController],
  providers: [OrganisationsService, CaptureProIntegrationsService],
  exports: [OrganisationsService],
})
export class OrganisationsModule {}
