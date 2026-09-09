import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, ne } from 'drizzle-orm';
import { CORE_DB } from '../db/database.module';
import type { CoreDb } from '../db';
import { organisations, projects, users } from '../db/schema';
import type { CreateProjectDto, ProjectStatus, UpdateProjectDto } from './dto/project.dto';

@Injectable()
export class ProjectsService {
  constructor(@Inject(CORE_DB) private readonly db: CoreDb) {}

  private async globalOrganisationId() {
    const [organisation] = await this.db
      .select({ id: organisations.id })
      .from(organisations)
      .where(eq(organisations.slug, 'global'));
    if (!organisation) throw new NotFoundException('Global organisation not found');
    return organisation.id;
  }

  private async assertCodeAvailable(orgId: string, code: string, exceptId?: string) {
    const condition = exceptId
      ? and(eq(projects.orgId, orgId), eq(projects.code, code), ne(projects.id, exceptId))
      : and(eq(projects.orgId, orgId), eq(projects.code, code));
    const existing = await this.db.select({ id: projects.id }).from(projects).where(condition);
    if (existing.length > 0) throw new ConflictException('A project with this code already exists');
  }

  private async assertManager(managerUserId: string) {
    const [manager] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, managerUserId), eq(users.status, 'active')));
    if (!manager) throw new NotFoundException('Active project manager not found');
  }

  async list() {
    const orgId = await this.globalOrganisationId();
    return this.db
      .select({
        id: projects.id,
        code: projects.code,
        name: projects.name,
        description: projects.description,
        status: projects.status,
        managerUserId: projects.managerUserId,
        managerName: users.displayName,
        managerEmail: users.email,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .innerJoin(users, eq(projects.managerUserId, users.id))
      .where(eq(projects.orgId, orgId))
      .orderBy(asc(projects.code));
  }

  listManagers() {
    return this.db
      .select({ id: users.id, displayName: users.displayName, email: users.email })
      .from(users)
      .where(eq(users.status, 'active'))
      .orderBy(asc(users.displayName));
  }

  async create(input: CreateProjectDto) {
    const orgId = await this.globalOrganisationId();
    const code = input.code.trim().toUpperCase();
    await Promise.all([
      this.assertCodeAvailable(orgId, code),
      this.assertManager(input.managerUserId),
    ]);
    const [created] = await this.db
      .insert(projects)
      .values({ ...input, code, name: input.name.trim(), description: input.description.trim(), orgId })
      .returning();
    return created;
  }

  async update(id: string, input: UpdateProjectDto) {
    const orgId = await this.globalOrganisationId();
    const [existing] = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.orgId, orgId)));
    if (!existing) throw new NotFoundException('Project not found');

    const code = input.code?.trim().toUpperCase();
    if (code) await this.assertCodeAvailable(orgId, code, id);
    if (input.managerUserId) await this.assertManager(input.managerUserId);

    const [updated] = await this.db
      .update(projects)
      .set({
        code: code ?? existing.code,
        name: input.name?.trim() ?? existing.name,
        description: input.description?.trim() ?? existing.description,
        status: (input.status ?? existing.status) as ProjectStatus,
        managerUserId: input.managerUserId ?? existing.managerUserId,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning();
    return updated;
  }
}