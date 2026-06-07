import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ReconciliationService } from './reconciliation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReconcileDto, ManualReconcileDto } from './dto/reconcile.dto';
import { ReconciliationStatus } from '@prisma/client';

@ApiTags('Reconciliation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conciliacion')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post()
  @ApiOperation({ summary: 'Run reconciliation for a client' })
  async reconcile(@Body() reconcileDto: ReconcileDto): Promise<any> {
    const result = await this.reconciliationService.reconcileClient(reconcileDto);
    return { data: result };
  }

  @Post('run-by-date')
  @ApiOperation({ summary: 'Run reconciliation for a specific date' })
  async reconcileByDate(@Body() body: { date: string }): Promise<any> {
    const result = await this.reconciliationService.reconcileByDate(body.date);
    return { data: result };
  }

  @Get('unmatched')
  @ApiOperation({ summary: 'Get unmatched transactions for a date' })
  @ApiQuery({ name: 'date', required: true, type: String })
  async getUnmatched(@Query('date') date: string) {
    const data = await this.reconciliationService.getUnmatchedByDate(date);
    return { data };
  }

  @Post('manual')
  @ApiOperation({ summary: 'Manually reconcile a transaction with a settlement' })
  async manualReconcile(@Body() manualReconcileDto: ManualReconcileDto) {
    const reconciliation = await this.reconciliationService.manualReconcile(
      manualReconcileDto,
    );
    return { data: reconciliation };
  }

  @Get('available-dates')
  @ApiOperation({ summary: 'Get dates that have loaded transactions' })
  async getAvailableDates() {
    const data = await this.reconciliationService.getAvailableDates();
    return { data };
  }

  @Get('results')
  @ApiOperation({ summary: 'Get all transactions with reconciliation status' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'auth', required: false, description: 'Filtrar por número de autorización (ignora fechas)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getResults(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('status') status?: string,
    @Query('auth') auth?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.reconciliationService.getResults({
      dateFrom,
      dateTo,
      status,
      auth,
      page,
      limit,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Get all reconciliations' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'clientId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ReconciliationStatus })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('clientId') clientId?: any,
    @Query('status') status?: ReconciliationStatus,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (clientId) {
      where.transaction = { clientId };
    }
    if (status) {
      where.status = status;
    }

    const result = await this.reconciliationService.findAll({ skip, take: limit, where });

    return {
      data: result.data,
      meta: {
        page,
        limit,
        total: result.meta.total,
        totalPages: Math.ceil(result.meta.total / limit),
      },
    };
  }

  @Get('stats/:clientId')
  @ApiOperation({ summary: 'Get reconciliation statistics for a client' })
  @ApiParam({ name: 'clientId', description: 'Client ID' })
  async getStats(@Param('clientId') clientId: any) {
    const stats = await this.reconciliationService.getReconciliationStats(clientId);
    return { data: stats };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get reconciliation by ID' })
  @ApiParam({ name: 'id', description: 'Reconciliation ID' })
  async findOne(@Param('id') id: any) {
    const reconciliation = await this.reconciliationService.findById(id);
    return { data: reconciliation };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a reconciliation' })
  @ApiParam({ name: 'id', description: 'Reconciliation ID' })
  async remove(@Param('id') id: any) {
    await this.reconciliationService.deleteReconciliation(id);
    return { success: true };
  }
}
