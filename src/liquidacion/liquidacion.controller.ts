import { Controller, Post, Get, Param, Body, Res, UseGuards } from '@nestjs/common';
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
  async generate(@Body() body: { fecha: string }) {
    const data = await this.liquidacionService.generate(body.fecha);
    return { data };
  }

  @Get()
  @ApiOperation({ summary: 'List all liquidations' })
  async findAll() {
    const data = await this.liquidacionService.findAll();
    return { data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get liquidation detail' })
  async findOne(@Param('id') id: string) {
    const data = await this.liquidacionService.findById(BigInt(id));
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
