import { Controller, Post, Get, Param, Body, Res, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LiquidacionService } from './liquidacion.service';

@ApiTags('Liquidacion')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('liquidacion')
export class LiquidacionController {
  constructor(private readonly liquidacionService: LiquidacionService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate liquidation for a date' })
  async generate(@Body() body: { fecha: string; force?: boolean }) {
    const data = await this.liquidacionService.generate(body.fecha, !!body.force);
    return { data };
  }

  @Get()
  @ApiOperation({ summary: 'List all liquidations' })
  async findAll(@Query('includeCancelled') includeCancelled?: string) {
    const data = await this.liquidacionService.findAll(includeCancelled === 'true');
    return { data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get liquidation detail' })
  async findOne(@Param('id') id: string) {
    const data = await this.liquidacionService.findById(BigInt(id));
    return { data };
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a CALCULADA liquidation (soft delete)' })
  async cancel(@Param('id') id: string) {
    const data = await this.liquidacionService.cancel(BigInt(id));
    return { data };
  }

  @Get(':id/export')
  @ApiOperation({ summary: 'Export liquidation to Excel' })
  async export(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.liquidacionService.exportExcel(BigInt(id));
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="liquidacion_${id}.xlsx"`,
    );
    res.send(buffer);
  }
}
