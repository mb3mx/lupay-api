import {
  Controller,
  Get,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CancelacionesService } from './cancelaciones.service';

@ApiTags('Cancelaciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cancelaciones')
export class CancelacionesController {
  constructor(private readonly cancelacionesService: CancelacionesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Lista los registros cancelados/devueltos/reversados que vinieron en los archivos cargados',
  })
  @ApiQuery({ name: 'tipo', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getAll(
    @Query('tipo') tipo?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.cancelacionesService.getAll({
      tipo,
      dateFrom,
      dateTo,
      page,
      limit,
    });
  }

  @Get('counts')
  @ApiOperation({ summary: 'KPIs: conteos por tipo de cancelación' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async getCounts(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const data = await this.cancelacionesService.getCounts(dateFrom, dateTo);
    return { data };
  }
}
