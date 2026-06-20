import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiQuery, ApiOperation } from '@nestjs/swagger';
import { SindicatosService } from './sindicatos.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';

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
  async findAll(@Query('search') search?: string) {
    const items = await this.svc.findAll(search);
    // Retornar el array directo: el TransformInterceptor lo envuelve en { success, data }
    return items.map((s) => ({
      id: String(s.id),
      nombre: s.nombre,
      banco: s.banco,
      clabe: s.clabe,
    }));
  }
}
