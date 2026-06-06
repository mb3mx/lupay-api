import {
  Controller, Get, Query, Res, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get summary KPIs for a date range' })
  @ApiQuery({ name: 'dateFrom', required: true })
  @ApiQuery({ name: 'dateTo', required: true })
  async getSummary(
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
  ) {
    const data = await this.dashboardService.getSummary(dateFrom, dateTo);
    return { data };
  }

  @Get('daily')
  @ApiOperation({ summary: 'Get daily breakdown by hour and card brand' })
  @ApiQuery({ name: 'date', required: true })
  async getDaily(@Query('date') date: string) {
    const data = await this.dashboardService.getDaily(date);
    return { data };
  }

  @Get('range')
  @ApiOperation({
    summary:
      'Get breakdown over a date range (hourly if same day, daily otherwise)',
  })
  @ApiQuery({ name: 'dateFrom', required: true })
  @ApiQuery({ name: 'dateTo', required: true })
  async getRange(
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
  ) {
    const data = await this.dashboardService.getRange(dateFrom, dateTo);
    return { data };
  }

  @Get('monthly')
  @ApiOperation({ summary: 'Get monthly breakdown with comparison' })
  @ApiQuery({ name: 'year', required: true })
  @ApiQuery({ name: 'month', required: true })
  async getMonthly(
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    const data = await this.dashboardService.getMonthly(+year, +month);
    return { data };
  }

  @Get('export')
  @ApiOperation({ summary: 'Export reconciliation report to Excel' })
  @ApiQuery({ name: 'dateFrom', required: true })
  @ApiQuery({ name: 'dateTo', required: true })
  @ApiQuery({ name: 'status', required: false, enum: ['MATCHED', 'NOT_FOUND', 'AMOUNT_MISMATCH'] })
  async export(
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('status') status: string | undefined,
    @Res() res: Response,
  ) {
    const buffer = await this.dashboardService.exportReport(dateFrom, dateTo, status);
    const suffix = status ? `_${status.toLowerCase()}` : '';
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="conciliacion_${dateFrom}_${dateTo}${suffix}.xlsx"`,
    );
    res.send(buffer);
  }
}
