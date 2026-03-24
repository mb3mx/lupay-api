import { IsUUID, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReconcileDto {
  @ApiProperty({ description: 'Client ID to reconcile' })
  @IsUUID()
  clientId: any;

  @ApiPropertyOptional({ description: 'Specific transaction ID to reconcile' })
  @IsUUID()
  @IsOptional()
  transactionId?: any;

  @ApiPropertyOptional({ description: 'Specific settlement ID to reconcile' })
  @IsUUID()
  @IsOptional()
  settlementId?: any;
}

export class ManualReconcileDto {
  @ApiProperty({ description: 'Transaction ID' })
  @IsUUID()
  transactionId: any;

  @ApiProperty({ description: 'Settlement ID' })
  @IsUUID()
  settlementId: any;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}
