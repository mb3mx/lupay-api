import {
  Controller,
  Get,
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
import { SettlementsService } from './settlements.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Settlements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('settlements')
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all settlements' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'clientId', required: false, type: String })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('clientId') clientId?: string,
  ) {
    const skip = (page - 1) * limit;
    const where = clientId ? { clientId } : undefined;

    const result = await this.settlementsService.findAll({ skip, take: limit, where });

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

  @Get(':id')
  @ApiOperation({ summary: 'Get settlement by ID' })
  @ApiParam({ name: 'id', description: 'Settlement ID' })
  async findOne(@Param('id') id: string) {
    const settlement = await this.settlementsService.findById(id);
    return { data: settlement };
  }

  @Get('client/:clientId/unreconciled')
  @ApiOperation({ summary: 'Get unreconciled settlements for a client' })
  @ApiParam({ name: 'clientId', description: 'Client ID' })
  async getUnreconciled(@Param('clientId') clientId: string) {
    const settlements = await this.settlementsService.getUnreconciledSettlements(clientId);
    return { data: settlements };
  }
}
