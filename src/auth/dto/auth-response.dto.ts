import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../common/enums';

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  user: {
    id: any;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  };
}
