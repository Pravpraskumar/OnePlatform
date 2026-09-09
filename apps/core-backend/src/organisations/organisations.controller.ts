import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { OrganisationsService } from './organisations.service';
import {
  AddOrganisationMemberDto,
  AssignModuleTeamDto,
  AssignModuleDto,
  AssignProjectModuleDto,
  CreateOrganisationTeamDto,
  CreateOrganisationDto,
  SetModuleProjectDto,
  UpdateOrgStatusDto,
  UpdateOrganisationMemberDto,
  UpdateOrganisationMemberProjectsDto,
  UpdateOrganisationTeamDto,
  UpdateOrganisationTeamMembersDto,
  UpdateOrganisationDto,
} from './dto/organisation.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { Roles } from '../auth/roles.decorator';

@Controller('organisations')
export class OrganisationsController {
  constructor(private readonly orgs: OrganisationsService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.orgs.listForUser(user);
  }

  @Get()
  @Roles('Global Administrator')
  all() {
    return this.orgs.listAll();
  }

  @Post()
  @Roles('Global Administrator')
  create(@Body() dto: CreateOrganisationDto, @CurrentUser() user: AuthUser) {
    return this.orgs.create({ ...dto, ownerUserId: user.id });
  }

  @Put(':id')
  @Roles('Global Administrator')
  update(@Param('id') id: string, @Body() dto: UpdateOrganisationDto) {
    return this.orgs.update(id, dto);
  }

  @Patch(':id/status')
  @Roles('Global Administrator')
  setStatus(@Param('id') id: string, @Body() dto: UpdateOrgStatusDto) {
    return this.orgs.setStatus(id, dto.status);
  }

  @Get(':id/modules')
  modules(@Param('id') id: string) {
    return this.orgs.listModules(id);
  }

  @Put(':id/modules')
  @Roles('Global Administrator')
  assignModule(@Param('id') id: string, @Body() dto: AssignModuleDto) {
    return this.orgs.assignModule({
      orgId: id,
      productId: dto.productId,
      licensedSeats: dto.licensedSeats,
      validTo: dto.validTo ? new Date(dto.validTo) : null,
    });
  }

  @Delete(':id/modules/:productId')
  @Roles('Global Administrator')
  removeModule(@Param('id') id: string, @Param('productId') productId: string) {
    return this.orgs.removeModule(id, productId);
  }

  @Get(':id/teams')
  teams(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.orgs.listTeams(id, user);
  }

  @Post(':id/teams')
  createTeam(
    @Param('id') id: string,
    @Body() dto: CreateOrganisationTeamDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orgs.createTeam(id, dto, user);
  }

  @Put(':id/teams/:teamId')
  updateTeam(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateOrganisationTeamDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orgs.updateTeam(id, teamId, dto, user);
  }

  @Put(':id/teams/:teamId/members')
  updateTeamMembers(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateOrganisationTeamMembersDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orgs.updateTeamMembers(id, teamId, dto.userIds, user);
  }

  @Delete(':id/teams/:teamId')
  removeTeam(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orgs.removeTeam(id, teamId, user);
  }

  @Put(':id/modules/:productId/team')
  assignModuleTeam(
    @Param('id') id: string,
    @Param('productId') productId: string,
    @Body() dto: AssignModuleTeamDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orgs.assignModuleTeam(id, productId, dto.teamId ?? null, user);
  }

  @Get(':id/project-modules')
  projectModules(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.orgs.listProjectModules(id, user);
  }

  @Put(':id/project-modules')
  assignProjectModule(
    @Param('id') id: string,
    @Body() dto: AssignProjectModuleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orgs.assignProjectModule(id, dto, user);
  }

  @Delete(':id/project-modules/:productId/:projectId')
  removeProjectModule(
    @Param('id') id: string,
    @Param('productId') productId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orgs.removeProjectModule(id, productId, projectId, user);
  }

  @Get(':id/modules/:productId/projects')
  moduleProjects(
    @Param('id') id: string,
    @Param('productId') productId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orgs.listModuleProjects(id, productId, user);
  }

  @Put(':id/modules/:productId/last-project')
  setModuleProject(
    @Param('id') id: string,
    @Param('productId') productId: string,
    @Body() dto: SetModuleProjectDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orgs.setLastModuleProject(id, productId, dto.projectId, user);
  }

  @Get(':id/team')
  team(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.orgs.listTeam(id, user);
  }

  @Get(':id/available-users')
  availableUsers(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.orgs.listAvailableUsers(id, user);
  }

  @Get(':id/member-projects')
  memberProjects(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.orgs.listMemberProjects(id, user);
  }

  @Post(':id/team')
  addTeamMember(
    @Param('id') id: string,
    @Body() dto: AddOrganisationMemberDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orgs.addTeamMember(id, dto, user);
  }

  @Patch(':id/team/:userId')
  updateTeamMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateOrganisationMemberDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orgs.updateTeamMember(id, userId, dto, user);
  }

  @Put(':id/team/:userId/projects')
  updateMemberProjects(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateOrganisationMemberProjectsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orgs.updateMemberProjects(id, userId, dto.projectIds, user);
  }

  @Delete(':id/team/:userId')
  removeTeamMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orgs.removeTeamMember(id, userId, user);
  }
}
