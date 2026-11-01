import { Transform } from 'class-transformer';
import { IsIn, IsString, IsUrl, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class SalesforceIntegrationDto {
  @IsIn(['OAuth2.0'])
  authType!: 'OAuth2.0';

  @IsIn(['client_credentials'])
  grantType!: 'client_credentials';

  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  accessTokenUrl!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  clientId!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/, { message: 'clientSecret must not be blank' })
  @MaxLength(10000)
  clientSecret?: string;
}

export class SpinergieIntegrationDto {
  @IsString()
  @Matches(/\S/, { message: 'apiKey must not be blank' })
  @MaxLength(10000)
  apiKey!: string;
}
