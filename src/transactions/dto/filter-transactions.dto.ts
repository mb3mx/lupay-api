import {
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  IsEnum,
  IsNumber,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CardBrand, TransactionStatus } from '../../common/enums';

export class FilterTransactionsDto {
  @ApiPropertyOptional({ description: 'Client ID' })
  @IsUUID()
  @IsOptional()
  clientId?: any;

  @ApiPropertyOptional({ description: 'Terminal ID' })
  @IsUUID()
  @IsOptional()
  terminalId?: any;

  @ApiPropertyOptional({ description: 'Card brand' })
  @IsEnum(CardBrand)
  @IsOptional()
  cardBrand?: CardBrand;

  @ApiPropertyOptional({ description: 'Transaction status' })
  @IsEnum(TransactionStatus)
  @IsOptional()
  status?: TransactionStatus;

  @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Authorization number' })
  @IsString()
  @IsOptional()
  authorizationNumber?: string;

  @ApiPropertyOptional({ description: 'Transaction ID' })
  @IsString()
  @IsOptional()
  transactionId?: any;

  @ApiPropertyOptional({ description: 'Include excluded transactions' })
  @IsOptional()
  includeExcluded?: boolean;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsNumber()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 10 })
  @IsNumber()
  @Min(1)
  @IsOptional()
  limit?: number = 10;
}
