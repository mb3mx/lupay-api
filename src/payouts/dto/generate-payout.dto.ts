import { IsUUID, IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GeneratePayoutDto {
  @ApiProperty({ description: 'Client ID' })
  @IsUUID()
  clientId: any;

  @ApiProperty({ description: 'Payout date (YYYY-MM-DD)' })
  @IsDateString()
  payoutDate: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class ApprovePayoutDto {
  @ApiPropertyOptional({ description: 'Payment reference' })
  @IsString()
  @IsOptional()
  paymentReference?: string;
}
