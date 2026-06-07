import { IsEmail, IsString, MinLength, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'juan@example.com' })
  @IsEmail({}, { message: 'Correo invalido' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(6, { message: 'La contrasena debe tener al menos 6 caracteres' })
  @IsNotEmpty()
  password: string;

  @ApiProperty({ example: 'Juan' })
  @IsString()
  @MinLength(2, { message: 'Nombre invalido' })
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Perez' })
  @IsString()
  @MinLength(2, { message: 'Apellido invalido' })
  @IsNotEmpty()
  lastName: string;
}
