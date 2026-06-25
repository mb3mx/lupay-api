import { IsString, IsNotEmpty, IsEnum, IsArray, ArrayUnique } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PermissionAction, UserRole } from '../../common/enums';

export class CreatePermissionDto {
  @ApiProperty({ example: 'users' })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({ enum: PermissionAction, example: PermissionAction.READ })
  @IsEnum(PermissionAction)
  action: PermissionAction;

  @ApiProperty({ enum: UserRole, isArray: true, example: [UserRole.ADMIN] })
  @IsArray()
  @ArrayUnique()
  @IsEnum(UserRole, { each: true })
  roles: UserRole[];
}
