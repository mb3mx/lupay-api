import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsNumber,
  Min,
  Max,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
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

  @ApiPropertyOptional({ example: '012345678901234567', description: 'CLABE bancaria (18 digitos)' })
  @IsString()
  @IsOptional()
  @Length(18, 18, { message: 'bankClabe debe tener exactamente 18 caracteres' })
  bankClabe?: string;

  @ApiPropertyOptional({ example: 'AFL00123' })
  @IsString()
  @IsOptional()
  afiliacion?: string;

  @ApiPropertyOptional({ example: 1, description: 'ID del sindicato (opcional)' })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  sindicatoId?: number;

  @ApiPropertyOptional({ example: 1, description: 'ID de la liquidadora (opcional)' })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  liquidadoraId?: number;
}
