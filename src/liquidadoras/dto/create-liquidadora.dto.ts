import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateLiquidadoraDto {
  @ApiProperty({ example: 'Liquidadora ABC' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({ example: 'Liquidadora ABC SA de CV' })
  @IsString()
  @IsNotEmpty()
  razonSocial: string;

  @ApiProperty({ example: 'Santander' })
  @IsString()
  @IsNotEmpty()
  banco: string;

  @ApiProperty({ example: '014180012345678901' })
  @IsString()
  @IsNotEmpty()
  clabe: string;
}
