import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { CreateRoleDto, UpdateRoleDto, UpdateRoleMenusDto } from './dto/role.dto';
import { RolesService } from './roles.service';

@Controller('roles')
@Roles('Global Administrator')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list() {
    return this.roles.list();
  }

  @Get(':id/menus')
  listMenus(@Param('id') id: string) {
    return this.roles.listMenus(id);
  }

  @Post()
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Put(':id/menus')
  updateMenus(@Param('id') id: string, @Body() dto: UpdateRoleMenusDto) {
    return this.roles.updateMenus(id, dto.assignments);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.roles.remove(id);
  }

}