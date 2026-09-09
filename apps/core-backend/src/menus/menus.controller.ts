import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { MenusService } from './menus.service';
import { AssignMenuDto, CreateMenuDto } from './dto/menu.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';

@Controller('menus')
export class MenusController {
  constructor(private readonly menus: MenusService) {}

  @Public()
  @Get('public')
  publicMenus() {
    return this.menus.publicMenus();
  }

  // Role-filtered navigation tree for the authenticated user (sidebar).
  @Get('mine')
  mine(@CurrentUser() user: AuthUser, @Query('orgId') orgId?: string) {
    return this.menus.menusForUser(user, orgId);
  }

  @Get()
  @Roles('Global Administrator')
  all() {
    return this.menus.listAll();
  }

  @Post()
  @Roles('Global Administrator')
  create(@Body() dto: CreateMenuDto) {
    return this.menus.create(dto);
  }

  @Post('assign')
  @Roles('Global Administrator')
  assign(@Body() dto: AssignMenuDto) {
    return this.menus.assignToRole(dto.roleId, dto.menuId);
  }

  @Get('roles')
  @Roles('Global Administrator')
  roles() {
    return this.menus.listRoles();
  }
}
