import { IsIP, IsOptional, IsUUID } from 'class-validator';

export class OpenSessionDto {
  @IsUUID()
  orgId!: string;

  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsIP()
  ip?: string;
}

export class OpenAdministrationSessionDto {
  @IsUUID()
  orgId!: string;

  @IsOptional()
  @IsIP()
  ip?: string;
}
