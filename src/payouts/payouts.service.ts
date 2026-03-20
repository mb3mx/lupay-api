import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClientsService } from '../clients/clients.service';
import { TransactionsService } from '../transactions/transactions.service';
import {
  Payout,
  PayoutStatus,
  PayoutItem,
  Transaction,
} from '@prisma/client';
import { GeneratePayoutDto, ApprovePayoutDto } from './dto/generate-payout.dto';

interface PayoutCalculation {
  transaction: Transaction;
  grossAmount: number;
  fee: number;
  iva: number;
  commission: number;
  netAmount: number;
}

interface PayoutSummary {
  totalAmount: number;
  totalCommission: number;
  totalNet: number;
  transactionCount: number;
}

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
    private readonly transactionsService: TransactionsService,
  ) {}

  async generatePayout(data: GeneratePayoutDto): Promise<{
    payout: Payout;
    items: PayoutItem[];
    summary: PayoutSummary;
  }> {
    const { clientId, payoutDate } = data;

    // Validate client exists
    const client = await this.clientsService.findById(clientId);
    if (!client) {
      throw new NotFoundException(`Client with ID ${clientId} not found`);
    }

    const payoutDateObj = new Date(payoutDate);

    // Get transactions for this payout
    const transactions = await this.transactionsService.getTransactionsForPayout(
      clientId,
      payoutDateObj,
    );

    if (transactions.length === 0) {
      throw new BadRequestException(
        `No reconciled transactions found for payout date ${payoutDate}`,
      );
    }

    // Calculate payout items
    const calculations: PayoutCalculation[] = transactions.map((transaction) => {
      const grossAmount = transaction.amount;
      const fee = transaction.fee || 0;
      const iva = transaction.iva || 0;
      const commission = transaction.clientCommission || 0;
      const netAmount = grossAmount - fee - iva - commission;

      return {
        transaction,
        grossAmount,
        fee,
        iva,
        commission,
        netAmount,
      };
    });

    // Calculate totals
    const summary: PayoutSummary = {
      totalAmount: calculations.reduce((sum, calc) => sum + calc.grossAmount, 0),
      totalCommission: calculations.reduce((sum, calc) => sum + calc.commission, 0),
      totalNet: calculations.reduce((sum, calc) => sum + calc.netAmount, 0),
      transactionCount: calculations.length,
    };

    // Create payout and items in a transaction
    const result = await this.prisma.$transaction(async (prisma) => {
      // Create payout
      const payout = await prisma.payout.create({
        data: {
          clientId,
          payoutDate: payoutDateObj,
          totalAmount: summary.totalAmount,
          totalCommission: summary.totalCommission,
          totalNet: summary.totalNet,
          status: PayoutStatus.CALCULATED,
        },
      });

      // Create payout items
      const items: PayoutItem[] = [];
      for (const calc of calculations) {
        const item = await prisma.payoutItem.create({
          data: {
            payoutId: payout.id,
            transactionId: calc.transaction.id,
            grossAmount: calc.grossAmount,
            fee: calc.fee,
            iva: calc.iva,
            commission: calc.commission,
            netAmount: calc.netAmount,
          },
        });
        items.push(item);
      }

      return { payout, items };
    });

    this.logger.log(
      `Payout generated for client ${clientId}: ${summary.totalNet} for ${summary.transactionCount} transactions`,
    );

    return {
      payout: result.payout,
      items: result.items,
      summary,
    };
  }

  async approvePayout(
    payoutId: string,
    data: ApprovePayoutDto,
  ): Promise<Payout> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });

    if (!payout) {
      throw new NotFoundException(`Payout with ID ${payoutId} not found`);
    }

    if (payout.status !== PayoutStatus.CALCULATED) {
      throw new BadRequestException(
        `Payout cannot be approved. Current status: ${payout.status}`,
      );
    }

    return this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: PayoutStatus.APPROVED,
        paymentReference: data.paymentReference,
      },
    });
  }

  async markAsPaid(payoutId: string): Promise<Payout> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });

    if (!payout) {
      throw new NotFoundException(`Payout with ID ${payoutId} not found`);
    }

    if (payout.status !== PayoutStatus.APPROVED) {
      throw new BadRequestException(
        `Payout cannot be marked as paid. Current status: ${payout.status}`,
      );
    }

    return this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: PayoutStatus.PAID,
        paidAt: new Date(),
      },
    });
  }

  async findAll(params: {
    skip?: number;
    take?: number;
    where?: any;
  }): Promise<{ data: Payout[]; meta: { total: number } }> {
    const { skip, take, where } = params;

    const [payouts, total] = await Promise.all([
      this.prisma.payout.findMany({
        where,
        skip,
        take,
        orderBy: { payoutDate: 'desc' },
        include: {
          client: {
            select: {
              id: true,
              code: true,
              name: true,
              bankName: true,
              bankAccount: true,
              bankClabe: true,
            },
          },
          _count: {
            select: { items: true },
          },
        },
      }),
      this.prisma.payout.count({ where }),
    ]);

    return {
      data: payouts,
      meta: { total },
    };
  }

  async findById(id: string): Promise<Payout | null> {
    return this.prisma.payout.findUnique({
      where: { id },
      include: {
        client: {
          select: {
            id: true,
            code: true,
            name: true,
            bankName: true,
            bankAccount: true,
            bankClabe: true,
          },
        },
        items: {
          include: {
            transaction: {
              select: {
                id: true,
                transactionId: true,
                authorizationNumber: true,
                amount: true,
                transactionDate: true,
                cardBrand: true,
              },
            },
          },
        },
      },
    });
  }

  async getPayoutSummary(clientId: string, startDate: Date, endDate: Date): Promise<{
    totalPayouts: number;
    totalAmount: number;
    totalCommission: number;
    totalNet: number;
  }> {
    const result = await this.prisma.payout.aggregate({
      where: {
        clientId,
        payoutDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      _count: { id: true },
      _sum: {
        totalAmount: true,
        totalCommission: true,
        totalNet: true,
      },
    });

    return {
      totalPayouts: result._count.id,
      totalAmount: result._sum.totalAmount || 0,
      totalCommission: result._sum.totalCommission || 0,
      totalNet: result._sum.totalNet || 0,
    };
  }

  async deletePayout(id: string): Promise<void> {
    const payout = await this.prisma.payout.findUnique({
      where: { id },
    });

    if (!payout) {
      throw new NotFoundException(`Payout with ID ${id} not found`);
    }

    if (payout.status === PayoutStatus.PAID) {
      throw new BadRequestException('Cannot delete a paid payout');
    }

    await this.prisma.payout.delete({
      where: { id },
    });
  }
}
