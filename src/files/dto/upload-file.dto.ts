import { IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FileType } from '../../common/enums';

export class UploadFileDto {
  @ApiProperty({ enum: FileType, description: 'Type of file being uploaded' })
  @IsEnum(FileType)
  @IsNotEmpty()
  fileType: FileType;

  @ApiProperty({ description: 'Client ID for the file data' })
  @IsUUID()
  @IsNotEmpty()
  clientId: string;
}
