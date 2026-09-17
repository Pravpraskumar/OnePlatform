import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsHexColor, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';

export class UpdateSettingsDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsUUID()
  defaultOrgId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  sessionTimeoutMinutes?: number;

  @IsOptional()
  @IsHexColor()
  headerColor?: string;

  @IsOptional()
  @IsHexColor()
  headerTextColor?: string;

  @IsOptional()
  @IsBoolean()
  bannerEnabled?: boolean;

  @IsOptional()
  @IsHexColor()
  bannerBgColor?: string;

  @IsOptional()
  @IsHexColor()
  bannerTextColor?: string;

  @IsOptional()
  @IsString()
  bannerContent?: string | null;
}

export class SmtpConfigurationDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsOptional()
  @IsString()
  username?: string | null;

  @IsOptional()
  @IsString()
  password?: string;

  @IsString()
  @MinLength(1)
  fromName!: string;

  @IsEmail()
  fromEmail!: string;

  @IsBoolean()
  secure!: boolean;

  @IsBoolean()
  ignoreTlsCertificateErrors!: boolean;

  @IsBoolean()
  enabled!: boolean;

  @IsBoolean()
  isDefault!: boolean;

  @IsInt()
  @Min(0)
  priority!: number;
}

export class UpdateSmtpSettingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SmtpConfigurationDto)
  configurations!: SmtpConfigurationDto[];
}
