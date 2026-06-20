import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../common/enums';

export class CreateUserDto {
  @ApiProperty({ example: 'usuario@lupay.test' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'admin123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Juan' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Perez' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ enum: UserRole, example: UserRole.USER })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiPropertyOptional({
    example: 5,
    description: 'Requerido cuando role=CLIENT',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  clientId?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
