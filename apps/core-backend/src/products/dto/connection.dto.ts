import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class UpsertConnectionDto {
  @IsOptional()
  @IsIn(['postgresql', 'mssql'])
  databaseType?: 'postgresql' | 'mssql';

  @IsString()
  @MinLength(1)
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsString()
  @MinLength(1)
  database!: string;

  @IsString()
  @MinLength(1)
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsBoolean()
  ssl!: boolean;
}
