import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTerminalDto {
  @ApiProperty({ example: 'TERM001234', description: 'Terminal serial number' })
  @IsString()
  @IsNotEmpty()
  serialNumber: string;

  @ApiProperty({ example: 'Verifone Vx520' })
  @IsString()
  @IsNotEmpty()
  model: string;

  @ApiProperty({ example: 'CLI001', description: 'Client code' })
  @IsString()
  @IsNotEmpty()
  clientCode: string;

  @ApiPropertyOptional({ example: 'Main Branch' })
  @IsString()
  @IsOptional()
  location?: string;
}
