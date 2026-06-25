import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSindicatoDto {
  @ApiProperty({ example: 'Sindicato Nacional XYZ' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({ example: 'BBVA' })
  @IsString()
  @IsNotEmpty()
  banco: string;

  @ApiProperty({ example: '012345678901234567' })
  @IsString()
  @IsNotEmpty()
  clabe: string;
}
