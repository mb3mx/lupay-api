import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiQuery, ApiOperation } from '@nestjs/swagger';
import { LiquidadorasService } from './liquidadoras.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';

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
  async findAll(@Query('search') search?: string) {
    const items = await this.svc.findAll(search);
    return items.map((l) => ({
      id: String(l.id),
      nombre: l.nombre,
      razonSocial: l.razonSocial,
      banco: l.banco,
      clabe: l.clabe,
    }));
  }
}
