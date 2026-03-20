import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { SettlementsService } from '../settlements/settlements.service';
import {
  Reconciliation,
  ReconciliationStatus,
  ReconciliationPriority,
  Transaction,
  Settlement,
} from '@prisma/client';
import { ReconcileDto, ManualReconcileDto } from './dto/reconcile.dto';

interface ReconciliationResult {
  matched: number;
  notFound: number;
  amountMismatch: number;
  total: number;
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);
  private readonly AMOUNT_TOLERANCE = 0.01;

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionsService: TransactionsService,
    private readonly settlementsService: SettlementsService,
  ) {}

  async reconcileClient(data: ReconcileDto): Promise<ReconciliationResult> {
    const { clientId } = data;

    this.logger.log(`Starting reconciliation for client: ${clientId}`);

    // Get unreconciled transactions
    const transactions = await this.transactionsService.getUnreconciledTransactions(clientId);

    let matched = 0;
    let notFound = 0;
    let amountMismatch = 0;

    for (const transaction of transactions) {
      const result = await this.reconcileTransaction(transaction, clientId);

      if (result.status === ReconciliationStatus.MATCHED) {
        matched++;
      } else if (result.status === ReconciliationStatus.NOT_FOUND) {
        notFound++;
      } else if (result.status === ReconciliationStatus.AMOUNT_MISMATCH) {
        amountMismatch++;
      }
    }

    this.logger.log(
      `Reconciliation completed for client ${clientId}: ${matched} matched, ${notFound} not found, ${amountMismatch} amount mismatch`,
    );

    return {
      matched,
      notFound,
      amountMismatch,
      total: transactions.length,
    };
  }

  private async reconcileTransaction(
    transaction: Transaction,
    clientId: string,
  ): Promise<{ status: ReconciliationStatus; reconciliation?: Reconciliation }> {
    // Priority 1: Match by authorization number
    if (transaction.authorizationNumber) {
      const settlement = await this.settlementsService.findByAuthorizationNumber(
        transaction.authorizationNumber,
        clientId,
      );

      if (settlement) {
        return this.createReconciliation(
          transaction,
          settlement,
          ReconciliationPriority.AUTHORIZATION_NUMBER,
        );
      }
    }

    // Priority 2: Match by transaction ID / settlement ID
    if (transaction.transactionId) {
      const settlement = await this.settlementsService.findBySettlementId(
        transaction.transactionId,
        clientId,
      );

      if (settlement) {
        return this.createReconciliation(
          transaction,
          settlement,
          ReconciliationPriority.TRANSACTION_ID,
        );
      }
    }

    // Priority 3: Match by amount + date
    const settlement = await this.settlementsService.findByAmountAndDate(
      transaction.amount,
      transaction.transactionDate,
      clientId,
      this.AMOUNT_TOLERANCE,
    );

    if (settlement) {
      // Check for amount mismatch
      const amountDiff = Math.abs(transaction.amount - settlement.amount);
      if (amountDiff > this.AMOUNT_TOLERANCE) {
        return this.createReconciliation(
          transaction,
          settlement,
          ReconciliationPriority.AMOUNT_DATE,
          ReconciliationStatus.AMOUNT_MISMATCH,
          amountDiff,
        );
      }

      return this.createReconciliation(
        transaction,
        settlement,
        ReconciliationPriority.AMOUNT_DATE,
      );
    }

    // No match found
    return { status: ReconciliationStatus.NOT_FOUND };
  }

  private async createReconciliation(
    transaction: Transaction,
    settlement: Settlement,
    priorityUsed: ReconciliationPriority,
    status: ReconciliationStatus = ReconciliationStatus.MATCHED,
    amountDifference?: number,
  ): Promise<{ status: ReconciliationStatus; reconciliation: Reconciliation }> {
    const reconciliation = await this.prisma.reconciliation.create({
      data: {
        transactionId: transaction.id,
        settlementId: settlement.id,
        priorityUsed,
        status,
        amountDifference,
      },
    });

    return { status, reconciliation };
  }

  async manualReconcile(data: ManualReconcileDto): Promise<Reconciliation> {
    const { transactionId, settlementId, notes } = data;

    // Verify transaction exists
    const transaction = await this.transactionsService.findById(transactionId);
    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${transactionId} not found`);
    }

    // Verify settlement exists
    const settlement = await this.settlementsService.findById(settlementId);
    if (!settlement) {
      throw new NotFoundException(`Settlement with ID ${settlementId} not found`);
    }

    // Check for amount mismatch
    const amountDiff = Math.abs(transaction.amount - settlement.amount);
    const status =
      amountDiff > this.AMOUNT_TOLERANCE
        ? ReconciliationStatus.AMOUNT_MISMATCH
        : ReconciliationStatus.MATCHED;

    // Create reconciliation
    return this.prisma.reconciliation.create({
      data: {
        transactionId,
        settlementId,
        priorityUsed: ReconciliationPriority.AUTHORIZATION_NUMBER,
        status,
        amountDifference: amountDiff > this.AMOUNT_TOLERANCE ? amountDiff : null,
        notes: notes || 'Manually reconciled',
      },
    });
  }

  async findAll(params: {
    skip?: number;
    take?: number;
    where?: any;
  }): Promise<{ data: Reconciliation[]; meta: { total: number } }> {
    const { skip, take, where } = params;

    const [reconciliations, total] = await Promise.all([
      this.prisma.reconciliation.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          transaction: {
            include: {
              client: {
                select: { id: true, code: true, name: true },
              },
            },
          },
          settlement: true,
        },
      }),
      this.prisma.reconciliation.count({ where }),
    ]);

    return {
      data: reconciliations,
      meta: { total },
    };
  }

  async findById(id: string): Promise<Reconciliation | null> {
    return this.prisma.reconciliation.findUnique({
      where: { id },
      include: {
        transaction: true,
        settlement: true,
      },
    });
  }

  async getReconciliationStats(clientId: string): Promise<{
    total: number;
    matched: number;
    notFound: number;
    amountMismatch: number;
  }> {
    const [total, matched, notFound, amountMismatch] = await Promise.all([
      this.prisma.reconciliation.count({
        where: { transaction: { clientId } } },
      ),
      this.prisma.reconciliation.count({
        where: {
          transaction: { clientId },
          status: ReconciliationStatus.MATCHED,
        },
      }),
      this.prisma.reconciliation.count({
        where: {
          transaction: { clientId },
          status: ReconciliationStatus.NOT_FOUND,
        },
      }),
      this.prisma.reconciliation.count({
        where: {
          transaction: { clientId },
          status: ReconciliationStatus.AMOUNT_MISMATCH,
        },
      }),
    ]);

    return {
      total,
      matched,
      notFound,
      amountMismatch,
    };
  }

  async deleteReconciliation(id: string): Promise<void> {
    await this.prisma.reconciliation.delete({
      where: { id },
    });
  }
}
