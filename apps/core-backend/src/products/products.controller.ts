import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ProductsService } from './products.service';
import { UpsertConnectionDto } from './dto/connection.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { Roles } from '../auth/roles.decorator';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('orgId') orgId?: string) {
    return this.products.listProducts(user, orgId);
  }

  @Get(':id/connection')
  @Roles('Global Administrator')
  getConnection(@Param('id') id: string) {
    return this.products.getConnection(id);
  }

  @Put(':id/connection')
  @Roles('Global Administrator')
  upsertConnection(
    @Param('id') id: string,
    @Body() dto: UpsertConnectionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.products.upsertConnection({ productId: id, ...dto, updatedBy: user.id });
  }
}
