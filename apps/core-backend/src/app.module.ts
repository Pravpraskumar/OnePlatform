import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './db/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SettingsModule } from './settings/settings.module';
import { OrganisationsModule } from './organisations/organisations.module';
import { MenusModule } from './menus/menus.module';
import { ProductsModule } from './products/products.module';
import { LicensingModule } from './licensing/licensing.module';
import { RolesModule } from './roles/roles.module';
import { ProjectsModule } from './projects/projects.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    SettingsModule,
    AuthModule,
    UsersModule,
    OrganisationsModule,
    MenusModule,
    ProductsModule,
    LicensingModule,
    RolesModule,
    ProjectsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
