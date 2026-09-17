import { Type } from 'class-transformer';
import { IsNumber, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class SendRequestReviewNotificationDto {
  @IsUUID()
  orgId!: string;

  @IsUUID()
  productId!: string;

  @IsUUID()
  reviewerUserId!: string;

  @IsUUID()
  requestId!: string;

  @IsString()
  @MaxLength(40)
  requestNumber!: string;

  @IsString()
  @MaxLength(80)
  instrumentType!: string;

  @IsString()
  @MaxLength(200)
  applicant!: string;

  @IsString()
  @MaxLength(200)
  beneficiary!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsString()
  @MaxLength(3)
  currency!: string;

  @IsString()
  @MaxLength(200)
  requestedBy!: string;
}

export class SendReviewerReassignmentNotificationDto {
  @IsUUID()
  orgId!: string;

  @IsUUID()
  productId!: string;

  @IsUUID()
  previousReviewerUserId!: string;

  @IsUUID()
  newReviewerUserId!: string;

  @IsUUID()
  requestId!: string;

  @IsString()
  @MaxLength(40)
  requestNumber!: string;
}