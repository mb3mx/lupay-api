import { PartialType } from '@nestjs/swagger';
import { CreateLiquidadoraDto } from './create-liquidadora.dto';

export class UpdateLiquidadoraDto extends PartialType(CreateLiquidadoraDto) {}
