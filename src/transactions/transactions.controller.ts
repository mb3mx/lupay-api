import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FilterTransactionsDto } from './dto/filter-transactions.dto';

@ApiTags('Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all transactions with filters' })
  async findAll(@Query() filters: FilterTransactionsDto) {
    return this.transactionsService.findAll(filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transaction by ID' })
  @ApiParam({ name: 'id', description: 'Transaction ID' })
  async findOne(@Param('id') id: any) {
    const transaction = await this.transactionsService.findById(id);
    return { data: transaction };
  }

  @Get('client/:clientId/unreconciled')
  @ApiOperation({ summary: 'Get unreconciled transactions for a client' })
  @ApiParam({ name: 'clientId', description: 'Client ID' })
  async getUnreconciled(@Param('clientId') clientId: any) {
    const transactions = await this.transactionsService.getUnreconciledTransactions(clientId);
    return { data: transactions };
  }
}
