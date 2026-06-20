import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContracargosService } from './contracargos.service';
import { ContracargoStatus } from '@prisma/client';

@ApiTags('Contracargos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('contracargos')
export class ContracargosController {
  constructor(private readonly contracargosService: ContracargosService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new contracargo' })
  async create(@Body() body: {
    transactionId: string;
    monto: number;
    motivo?: string;
    correoContacto?: string;
    observaciones?: string;
  }) {
    const data = await this.contracargosService.create({ ...body, transactionId: BigInt(body.transactionId) });
    return { data };
  }

  @Get()
  @ApiOperation({ summary: 'List contracargos' })
  @ApiQuery({ name: 'status', required: false, enum: ContracargoStatus })
  async findAll(
    @Query('status') status?: ContracargoStatus,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.contracargosService.findAll({ status, page, limit });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update contracargo' })
  async update(
    @Param('id') id: string,
    @Body() body: {
      status?: ContracargoStatus;
      fechaEnvioDoc?: string;
      fechaContestacion?: string;
      observaciones?: string;
    },
  ) {
    const data = await this.contracargosService.update(BigInt(id), body);
    return { data };
  }
}
