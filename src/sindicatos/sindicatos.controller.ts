import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiQuery,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { SindicatosService } from './sindicatos.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { CreateSindicatoDto } from './dto/create-sindicato.dto';
import { UpdateSindicatoDto } from './dto/update-sindicato.dto';

@ApiTags('Sindicatos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sindicatos')
export class SindicatosController {
  constructor(private readonly svc: SindicatosService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.USER)
  @ApiOperation({ summary: 'Listar sindicatos (catalogo)' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'isActive', required: false, enum: ['true', 'false', 'all'] })
  async findAll(
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    const items = await this.svc.findAll(search, isActive);
    // Retornar el array directo: el TransformInterceptor lo envuelve en { success, data }
    return items.map((s) => ({
      id: String(s.id),
      nombre: s.nombre,
      banco: s.banco,
      clabe: s.clabe,
      isActive: s.isActive,
    }));
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear sindicato (ADMIN only)' })
  async create(@Body() dto: CreateSindicatoDto) {
    const s = await this.svc.create(dto);
    return {
      id: String(s.id),
      nombre: s.nombre,
      banco: s.banco,
      clabe: s.clabe,
      isActive: s.isActive,
    };
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar sindicato (ADMIN only)' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateSindicatoDto) {
    const s = await this.svc.update(id, dto);
    return {
      id: String(s.id),
      nombre: s.nombre,
      banco: s.banco,
      clabe: s.clabe,
      isActive: s.isActive,
    };
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Desactivar sindicato - soft delete (ADMIN only)' })
  @ApiParam({ name: 'id' })
  async remove(@Param('id') id: string) {
    await this.svc.delete(id);
    return { success: true };
  }
}
