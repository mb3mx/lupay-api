import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SocialLoginDto {
  @ApiProperty({
    description: 'idToken (Google) o accessToken (Facebook) emitido por el SDK del proveedor en el cliente',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}
