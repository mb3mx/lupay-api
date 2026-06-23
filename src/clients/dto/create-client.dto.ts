import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsNumber,
  Min,
  Max,
  Length,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreatePaymentAccountDto } from './payment-account.dto';

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

  @ApiPropertyOptional({ example: 'ABC123456XYZ' })
  @IsString()
  @IsOptional()
  taxId?: string;

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

  @ApiProperty({ example: 'activation@lupay.com', description: 'Activation email (unique)' })
  @IsEmail()
  @IsNotEmpty()
  activationEmail: string;

  @ApiPropertyOptional({ example: '01610017202503130153', description: 'Terminal serial number' })
  @IsString()
  @IsOptional()
  terminal?: string;

  @ApiPropertyOptional({ example: '24 HORAS', description: 'Reintegro turnaround time' })
  @IsString()
  @IsOptional()
  reintegroTime?: string;

  @ApiPropertyOptional({ example: '+52 555 123 4567' })
  @IsString()
  @IsOptional()
  contactPhone?: string;

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

  @ApiPropertyOptional({ type: [CreatePaymentAccountDto], description: 'Cuentas de pago asociadas (opcional)' })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreatePaymentAccountDto)
  paymentAccounts?: CreatePaymentAccountDto[];
}
