import { PartialType } from '@nestjs/swagger';
import { CreateSindicatoDto } from './create-sindicato.dto';

export class UpdateSindicatoDto extends PartialType(CreateSindicatoDto) {}
