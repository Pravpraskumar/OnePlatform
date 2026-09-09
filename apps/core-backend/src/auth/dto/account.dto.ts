import { IsEmail, IsHexColor, IsIn, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateAccountProfileDto {
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
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class DeleteAccountDto {
  @IsOptional()
  @IsString()
  currentPassword?: string;
}

export class UpdateThemePreferencesDto {
  @IsIn(['light', 'dark'])
  mode!: 'light' | 'dark';

  @IsIn(['slate', 'ocean', 'forest', 'rose'])
  preset!: 'slate' | 'ocean' | 'forest' | 'rose';

  @IsNumber()
  @Min(0)
  @Max(16)
  radius!: number;

  @IsHexColor()
  brandColor!: string;
}