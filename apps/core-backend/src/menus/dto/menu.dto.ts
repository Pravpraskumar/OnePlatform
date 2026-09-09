import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateMenuDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  route?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsIn(['Global', 'Secured'])
  type?: 'Global' | 'Secured';

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AssignMenuDto {
  @IsString()
  roleId!: string;

  @IsString()
  menuId!: string;
}
