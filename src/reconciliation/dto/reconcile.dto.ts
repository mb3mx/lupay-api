import { IsUUID, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReconcileDto {
  @ApiProperty({ description: 'Client ID to reconcile' })
  @IsUUID()
  clientId: string;

  @ApiPropertyOptional({ description: 'Specific transaction ID to reconcile' })
  @IsUUID()
  @IsOptional()
  transactionId?: string;

  @ApiPropertyOptional({ description: 'Specific settlement ID to reconcile' })
  @IsUUID()
  @IsOptional()
  settlementId?: string;
}

export class ManualReconcileDto {
  @ApiProperty({ description: 'Transaction ID' })
  @IsUUID()
  transactionId: string;

  @ApiProperty({ description: 'Settlement ID' })
  @IsUUID()
  settlementId: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}
