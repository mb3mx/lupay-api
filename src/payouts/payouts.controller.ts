import {
  Controller,
  Get,
  Post,
  Patch,
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
import { PayoutsService } from './payouts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GeneratePayoutDto, ApprovePayoutDto } from './dto/generate-payout.dto';
import { PayoutStatus } from '@prisma/client';

@ApiTags('Payouts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payouts')
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate a new payout' })
  async generate(@Body() generatePayoutDto: GeneratePayoutDto): Promise<any> {
    const result = await this.payoutsService.generatePayout(generatePayoutDto);
    return {
      data: {
        payout: result.payout,
        summary: result.summary,
      },
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all payouts' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'clientId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: PayoutStatus })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('clientId') clientId?: any,
    @Query('status') status?: PayoutStatus,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (clientId) where.clientId = clientId;
    if (status) where.status = status;

    const result = await this.payoutsService.findAll({ skip, take: limit, where });

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
  @ApiOperation({ summary: 'Get payout by ID' })
  @ApiParam({ name: 'id', description: 'Payout ID' })
  async findOne(@Param('id') id: any) {
    const payout = await this.payoutsService.findById(id);
    return { data: payout };
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve a payout' })
  @ApiParam({ name: 'id', description: 'Payout ID' })
  async approve(
    @Param('id') id: any,
    @Body() approvePayoutDto: ApprovePayoutDto,
  ) {
    const payout = await this.payoutsService.approvePayout(id, approvePayoutDto);
    return { data: payout };
  }

  @Patch(':id/pay')
  @ApiOperation({ summary: 'Mark payout as paid' })
  @ApiParam({ name: 'id', description: 'Payout ID' })
  async markAsPaid(@Param('id') id: any) {
    const payout = await this.payoutsService.markAsPaid(id);
    return { data: payout };
  }

  @Get('client/:clientId/summary')
  @ApiOperation({ summary: 'Get payout summary for a client' })
  @ApiParam({ name: 'clientId', description: 'Client ID' })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  async getSummary(
    @Param('clientId') clientId: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const summary = await this.payoutsService.getPayoutSummary(
      clientId,
      new Date(startDate),
      new Date(endDate),
    );
    return { data: summary };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a payout' })
  @ApiParam({ name: 'id', description: 'Payout ID' })
  async remove(@Param('id') id: any) {
    await this.payoutsService.deletePayout(id);
    return { success: true };
  }
}
