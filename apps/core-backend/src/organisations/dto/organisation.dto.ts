import { ArrayUnique, IsArray, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';

export class CreateOrganisationDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase letters, numbers or hyphens' })
  slug!: string;
}

export class UpdateOrganisationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase letters, numbers or hyphens' })
  slug?: string;
}

export class UpdateOrgStatusDto {
  @IsIn(['active', 'suspended', 'pending'])
  status!: 'active' | 'suspended' | 'pending';
}

export class AssignModuleDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(0)
  licensedSeats!: number;

  @IsOptional()
  validTo?: string;
}

export class AssignProjectModuleDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  projectId!: string;

  @IsInt()
  @Min(1)
  allocatedSeats!: number;
}

export class SetModuleProjectDto {
  @IsUUID()
  projectId!: string;
}

export class AddOrganisationMemberDto {
  @IsEmail()
  email!: string;

  @IsIn(['Admin', 'Member'])
  membership!: 'Admin' | 'Member';
}

export class UpdateOrganisationMemberDto {
  @IsOptional()
  @IsIn(['Admin', 'Member'])
  membership?: 'Admin' | 'Member';

  @IsOptional()
  @IsIn(['active', 'suspended'])
  status?: 'active' | 'suspended';
}

export class UpdateOrganisationMemberProjectsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  projectIds!: string[];
}

export class CreateOrganisationTeamDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpdateOrganisationTeamDto extends CreateOrganisationTeamDto {}

export class UpdateOrganisationTeamMembersDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  userIds!: string[];
}

export class AssignModuleTeamDto {
  @IsOptional()
  @IsUUID()
  teamId?: string | null;
}
