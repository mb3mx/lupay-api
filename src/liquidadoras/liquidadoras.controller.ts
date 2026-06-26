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
import { LiquidadorasService } from './liquidadoras.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { CreateLiquidadoraDto } from './dto/create-liquidadora.dto';
import { UpdateLiquidadoraDto } from './dto/update-liquidadora.dto';

@ApiTags('Liquidadoras')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('liquidadoras')
export class LiquidadorasController {
  constructor(private readonly svc: LiquidadorasService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.USER)
  @ApiOperation({ summary: 'Listar liquidadoras (catalogo)' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'isActive', required: false, enum: ['true', 'false', 'all'] })
  async findAll(
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    const items = await this.svc.findAll(search, isActive);
    return items.map((l) => ({
      id: String(l.id),
      nombre: l.nombre,
      razonSocial: l.razonSocial,
      banco: l.banco,
      clabe: l.clabe,
      isActive: l.isActive,
    }));
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear liquidadora (ADMIN only)' })
  async create(@Body() dto: CreateLiquidadoraDto) {
    const l = await this.svc.create(dto);
    return {
      id: String(l.id),
      nombre: l.nombre,
      razonSocial: l.razonSocial,
      banco: l.banco,
      clabe: l.clabe,
      isActive: l.isActive,
    };
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar liquidadora (ADMIN only)' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateLiquidadoraDto) {
    const l = await this.svc.update(id, dto);
    return {
      id: String(l.id),
      nombre: l.nombre,
      razonSocial: l.razonSocial,
      banco: l.banco,
      clabe: l.clabe,
      isActive: l.isActive,
    };
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Desactivar liquidadora - soft delete (ADMIN only)' })
  @ApiParam({ name: 'id' })
  async remove(@Param('id') id: string) {
    await this.svc.delete(id);
    return { success: true };
  }
}
