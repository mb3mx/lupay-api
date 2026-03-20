import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateClientDto {
  @ApiProperty({ example: 'CLI001', description: 'Client unique code' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Tienda Electronica ABC' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'ABC Electronics SA de CV' })
  @IsString()
  @IsNotEmpty()
  businessName: string;

  @ApiProperty({ example: 'ABC123456XYZ' })
  @IsString()
  @IsNotEmpty()
  taxId: string;

  @ApiProperty({ example: 2.5, description: 'Commission percentage' })
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionTotal: number;

  @ApiPropertyOptional({ example: 'Juan Perez' })
  @IsString()
  @IsOptional()
  contactName?: string;

  @ApiPropertyOptional({ example: 'juan@abc-electronics.com' })
  @IsEmail()
  @IsOptional()
  contactEmail?: string;

  @ApiPropertyOptional({ example: '+52 555 123 4567' })
  @IsString()
  @IsOptional()
  contactPhone?: string;

  @ApiPropertyOptional({ example: 'BBVA' })
  @IsString()
  @IsOptional()
  bankName?: string;

  @ApiPropertyOptional({ example: '0123456789' })
  @IsString()
  @IsOptional()
  bankAccount?: string;

  @ApiPropertyOptional({ example: '012345678901234567' })
  @IsString()
  @IsOptional()
  bankClabe?: string;
}
