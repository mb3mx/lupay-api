import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PaymentAccountType {
  KUSPIT = 'KUSPIT',
  INNTEC = 'INNTEC',
  BANK = 'BANK',
}

export class CreatePaymentAccountDto {
  @ApiProperty({ enum: PaymentAccountType, example: 'KUSPIT' })
  @IsEnum(PaymentAccountType)
  @IsNotEmpty()
  type: PaymentAccountType;

  @ApiProperty({ example: '653180003810218440' })
  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @ApiPropertyOptional({ example: 'JUAN PEREZ' })
  @IsString()
  @IsOptional()
  holderName?: string;

  @ApiPropertyOptional({ example: 'KUSPIT' })
  @IsString()
  @IsOptional()
  bankName?: string;

  @ApiPropertyOptional({ example: 50.0, description: 'Percentage of the client payout to route to this account' })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  payoutPercentage?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
