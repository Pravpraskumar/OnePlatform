import { ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateStatusDto {
  @IsIn(['active', 'suspended', 'pending'])
  status!: 'active' | 'suspended' | 'pending';
}

export class UpdateUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message: 'username may contain only letters, numbers, dots, hyphens and underscores',
  })
  username!: string;

  @IsIn(['active', 'suspended', 'pending'])
  status!: 'active' | 'suspended' | 'pending';
}

export class CreateUserDto extends UpdateUserDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class BulkUserStatusDto extends UpdateStatusDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  userIds!: string[];
}

export class RoleDto {
  @IsString()
  roleName!: string;

  @IsOptional()
  @IsUUID()
  orgId?: string;
}

export class RoleScopeDto {
  @IsOptional()
  @IsUUID()
  orgId?: string;
}

export class UpdateUserNotificationPreferencesDto {
  @IsBoolean()
  accessChanges!: boolean;

  @IsBoolean()
  projectUpdates!: boolean;

  @IsBoolean()
  sessionAlerts!: boolean;

  @IsBoolean()
  platformAnnouncements!: boolean;

  @IsIn(['instant', 'daily', 'weekly', 'off'])
  digest!: 'instant' | 'daily' | 'weekly' | 'off';
}
