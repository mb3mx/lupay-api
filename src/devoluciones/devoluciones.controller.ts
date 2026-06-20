import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DevolucionesService } from './devoluciones.service';
import { DevolucionStatus } from '@prisma/client';

@ApiTags('Devoluciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('devoluciones')
export class DevolucionesController {
  constructor(private readonly devolucionesService: DevolucionesService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new devolucion' })
  async create(@Body() body: { transactionId: string; monto: number; observaciones?: string }) {
    const data = await this.devolucionesService.create(BigInt(body.transactionId), body.monto, body.observaciones);
    return { data };
  }

  @Get()
  @ApiOperation({ summary: 'List devoluciones' })
  @ApiQuery({ name: 'status', required: false, enum: DevolucionStatus })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(
    @Query('status') status?: DevolucionStatus,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    const result = await this.devolucionesService.findAll({ status, page, limit });
    return result;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update devolucion status' })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: DevolucionStatus; fechaDescuento?: string },
  ) {
    const data = await this.devolucionesService.updateStatus(BigInt(id), body.status, body.fechaDescuento);
    return { data };
  }
}
