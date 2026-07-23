import { IsString, IsNumber, IsOptional, IsEnum, IsObject } from 'class-validator';
import { Prisma } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum SubscriptionPaymentType {
  NEW_SUBSCRIPTION = 'NEW_SUBSCRIPTION',
  RENEWAL = 'RENEWAL',
  UPGRADE = 'UPGRADE',
}

export class InitiatePaymentDto {
  @ApiProperty({ description: 'Unique order ID' })
  @IsString()
  orderId: string;

  @ApiProperty({ description: 'Subscription plan ID' })
  @IsNumber()
  planId: number;

  @ApiProperty({ description: 'Payment amount' })
  @IsString()
  amount: string;

  @ApiProperty({ description: 'Currency code', default: 'INR' })
  @IsString()
  currency: string;

  @ApiProperty({ description: 'Redirect URL after payment' })
  @IsString()
  redirectUrl: string;

  @ApiProperty({ description: 'Cancel URL if payment is cancelled' })
  @IsString()
  cancelUrl: string;

  @ApiProperty({ description: 'Billing name' })
  @IsString()
  billingName: string;

  @ApiPropertyOptional({ description: 'Billing address' })
  @IsOptional()
  @IsString()
  billingAddress?: string;

  @ApiPropertyOptional({ description: 'Billing city' })
  @IsOptional()
  @IsString()
  billingCity?: string;

  @ApiPropertyOptional({ description: 'Billing state' })
  @IsOptional()
  @IsString()
  billingState?: string;

  @ApiPropertyOptional({ description: 'Billing ZIP code' })
  @IsOptional()
  @IsString()
  billingZip?: string;

  @ApiPropertyOptional({ description: 'Billing country' })
  @IsOptional()
  @IsString()
  billingCountry?: string;

  @ApiPropertyOptional({ description: 'Billing telephone' })
  @IsOptional()
  @IsString()
  billingTel?: string;

  @ApiPropertyOptional({ description: 'Billing email' })
  @IsOptional()
  @IsString()
  billingEmail?: string;

  @ApiProperty({ description: 'Payment type', enum: SubscriptionPaymentType, default: SubscriptionPaymentType.NEW_SUBSCRIPTION })
  @IsEnum(SubscriptionPaymentType)
  paymentType: SubscriptionPaymentType;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Prisma.InputJsonValue;
}
