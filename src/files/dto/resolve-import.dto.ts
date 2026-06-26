import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsArray, ValidateNested, IsOptional, IsString, IsIn, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { FileType } from '../../common/enums';

export class ClientUpdateIssue {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @ApiProperty({ enum: ['name', 'activationEmail'] })
  @IsIn(['name', 'activationEmail'])
  field: 'name' | 'activationEmail';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  value: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  terminal?: string;
}

export class ClientCreateIssue {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty()
  @IsString()
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
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  taxId?: string;

  @ApiProperty()
  @IsNumber()
  commissionTotal: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  liquidadoraId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
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
