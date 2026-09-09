import { IsUUID } from 'class-validator';

export class ListSessionsDto {
  @IsUUID()
  orgId!: string;
}