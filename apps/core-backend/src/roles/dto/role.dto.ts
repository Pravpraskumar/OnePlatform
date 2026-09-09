import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, IsUUID, MinLength, ValidateNested } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateRoleDto extends CreateRoleDto {}

export class RoleMenuAssignmentDto {
  @IsUUID()
  menuId!: string;

  @IsIn(['readonly', 'editable'])
  accessMode!: 'readonly' | 'editable';
}

export class UpdateRoleMenusDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoleMenuAssignmentDto)
  assignments!: RoleMenuAssignmentDto[];
}