import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateEmailTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subjectTemplate!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  bodyTemplate!: string;
}