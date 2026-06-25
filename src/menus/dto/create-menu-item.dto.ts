import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsInt,
  IsEnum,
  IsArray,
  ArrayUnique,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MenuItemType, UserRole } from '../../common/enums';

export class CreateMenuItemDto {
  @ApiProperty({ example: 'Conciliación' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ example: 'NAV.RECONCILIATION' })
  @IsString()
  @IsOptional()
  translateKey?: string;

  @ApiProperty({ enum: MenuItemType, example: MenuItemType.ITEM })
  @IsEnum(MenuItemType)
  type: MenuItemType;

  @ApiPropertyOptional({ example: 'file-upload' })
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional({ example: '/conciliacion' })
  @IsString()
  @IsOptional()
  url?: string;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  exactMatch?: boolean;

  @ApiPropertyOptional({ example: 0 })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  order?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 1, description: 'ID del item padre (grupo/collapse), opcional' })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  parentId?: number;

  @ApiProperty({ enum: UserRole, isArray: true, example: [UserRole.ADMIN, UserRole.USER, UserRole.CLIENT] })
  @IsArray()
  @ArrayUnique()
  @IsEnum(UserRole, { each: true })
  roles: UserRole[];
}
