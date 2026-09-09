import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export const projectStatuses = ['planned', 'active', 'on_hold', 'completed', 'cancelled'] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'code may contain only letters, numbers, hyphens and underscores' })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(2)
  description!: string;

  @IsIn(projectStatuses)
  status!: ProjectStatus;

  @IsUUID()
  managerUserId!: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'code may contain only letters, numbers, hyphens and underscores' })
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  description?: string;

  @IsOptional()
  @IsIn(projectStatuses)
  status?: ProjectStatus;

  @IsOptional()
  @IsUUID()
  managerUserId?: string;
}