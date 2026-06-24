import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsArray, ValidateNested, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { FileType } from '../../common/enums';

export class ClientUpdateIssue {
  @ApiProperty()
  clientId: string;

  @ApiProperty({ enum: ['name', 'activationEmail'] })
  field: 'name' | 'activationEmail';

  @ApiProperty()
  value: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  terminal?: string;
}

export class ClientCreateIssue {
  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  @IsNotEmpty()
  activationEmail: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  terminal?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  reintegroTime?: string;

  @ApiProperty()
  code: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  taxId?: string;

  @ApiProperty()
  commissionTotal: number;

  @ApiProperty({ required: false })
  @IsOptional()
  liquidadoraId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  sindicatoId?: number;
}

export class ResolvedIssuesDto {
  @ApiProperty({ type: [ClientUpdateIssue] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClientUpdateIssue)
  updates: ClientUpdateIssue[];

  @ApiProperty({ type: [ClientCreateIssue] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClientCreateIssue)
  newClients: ClientCreateIssue[];
}

export class ResolveImportDto {
  @ApiProperty()
  @IsNotEmpty()
  tempFileId: string;

  @ApiProperty()
  @IsNotEmpty()
  originalName: string;

  @ApiProperty({ enum: FileType })
  @IsEnum(FileType)
  @IsNotEmpty()
  fileType: FileType;

  @ApiProperty()
  @IsNotEmpty()
  clientId: string;

  @ApiProperty({ type: ResolvedIssuesDto })
  @ValidateNested()
  @Type(() => ResolvedIssuesDto)
  resolvedIssues: ResolvedIssuesDto;
}
