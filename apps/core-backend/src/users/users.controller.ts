import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { BulkUserStatusDto, RoleDto, RoleScopeDto, UpdateStatusDto, UpdateUserDto, UpdateUserNotificationPreferencesDto } from './dto/user.dto';
import { Roles } from '../auth/roles.decorator';

// Global user administration; restricted to Global Administrators.
@Controller('users')
@Roles('Global Administrator')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.listAll();
  }

  @Get('roles')
  roles() {
    return this.users.listRoles();
  }

  @Get(':id/settings')
  settings(@Param('id') id: string) {
    return this.users.getUserSettings(id);
  }

  @Patch(':id/settings/notifications')
  updateNotificationPreferences(
    @Param('id') id: string,
    @Body() dto: UpdateUserNotificationPreferencesDto,
  ) {
    return this.users.updateNotificationPreferences(id, dto);
  }

  @Patch('bulk/status')
  bulkUpdateStatus(@Body() dto: BulkUserStatusDto) {
    return this.users.bulkUpdateStatus(dto.userIds, dto.status);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.users.updateStatus(id, dto.status);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Post(':id/roles')
  assignRole(@Param('id') id: string, @Body() dto: RoleDto) {
    return this.users.assignRole(id, dto.roleName, dto.orgId);
  }

  @Delete(':id/roles/:roleName')
  removeRole(
    @Param('id') id: string,
    @Param('roleName') roleName: string,
    @Query() scope: RoleScopeDto,
  ) {
    return this.users.removeRole(id, roleName, scope.orgId);
  }
}
