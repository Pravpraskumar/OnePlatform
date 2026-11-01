import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { FoundryController } from './foundry.controller';

@Module({
  controllers: [ProductsController, FoundryController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
