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

  // Devuelve TODAS las transacciones del rango con su estado de conciliación
  // (incluye las MATCHED, AMOUNT_MISMATCH y las que NO tienen match = NOT_FOUND)
  async getResults(params: {
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: any[]; meta: any }> {
    const { dateFrom, dateTo, status, page = 1, limit = 20 } = params;

    const where: any = { isExcluded: false };
    if (dateFrom && dateTo) {
      where.transactionDate = {
        gte: new Date(dateFrom + 'T00:00:00.000Z'),
        lte: new Date(dateTo + 'T23:59:59.999Z'),
      };
    }

    // Filtro por estado:
    //  - MATCHED / AMOUNT_MISMATCH → transacciones con reconciliation de ese estado
    //  - NOT_FOUND → transacciones SIN reconciliation
    if (status === 'NOT_FOUND') {
      where.reconciliations = { none: {} };
    } else if (status === 'MATCHED' || status === 'AMOUNT_MISMATCH') {
      where.reconciliations = { some: { status } };
    }

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { transactionDate: 'desc' },
        include: {
          client: { select: { name: true, afiliacion: true } },
          reconciliations: {
            include: { settlement: true },
            take: 1,
          },
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    // Mapear cada transacción a un formato uniforme con su estado real
    const data = transactions.map((tx) => {
      const rec = tx.reconciliations[0];
      const estado = rec ? rec.status : 'NOT_FOUND';
      return {
        id: tx.id.toString(),
        status: estado,
        amountDifference: rec?.amountDifference ?? null,
        transaction: {
          authorizationNumber: tx.authorizationNumber,
          cardNumber: tx.cardNumber,
          amount: tx.amount,
          cardBrand: tx.cardBrand,
          afiliacion: tx.afiliacion,
          transactionDate: tx.transactionDate,
          client: { name: tx.client.name },
        },
        settlement: rec?.settlement
          ? {
              authorizationNumber: rec.settlement.authorizationNumber,
              amount: rec.settlement.amount,
              montoPagar: rec.settlement.montoPagar,
              settlementDate: rec.settlement.settlementDate,
            }
          : null,
      };
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Devuelve las fechas que tienen transacciones cargadas (más reciente primero)
  async getAvailableDates(): Promise<string[]> {
    const rows = await this.prisma.transaction.findMany({
      where: { isExcluded: false },
      select: { transactionDate: true },
      distinct: ['transactionDate'],
      orderBy: { transactionDate: 'desc' },
    });
    // Normalizar a YYYY-MM-DD (UTC)
    const dates = new Set<string>();
    for (const r of rows) {
      dates.add(r.transactionDate.toISOString().split('T')[0]);
    }
    return Array.from(dates).sort().reverse();
  }

  async reconcileByDate(date: string): Promise<ReconciliationResult> {
    const start = new Date(date + 'T00:00:00.000Z');
    const end = new Date(date + 'T23:59:59.999Z');

    const transactions = await this.prisma.transaction.findMany({
      where: {
        isExcluded: false,
        transactionDate: { gte: start, lte: end },
        reconciliations: { none: {} },
      },
    });

    let matched = 0;
    let notFound = 0;
    let amountMismatch = 0;

    for (const transaction of transactions) {
      const result = await this.reconcileTransaction(
        transaction,
        transaction.clientId,
      );
      if (result.status === ReconciliationStatus.MATCHED) matched++;
      else if (result.status === ReconciliationStatus.NOT_FOUND) notFound++;
      else if (result.status === ReconciliationStatus.AMOUNT_MISMATCH) amountMismatch++;
    }

    this.logger.log(
      `Reconciliation by date ${date}: ${matched} matched, ${notFound} not found, ${amountMismatch} mismatch`,
    );

    return { matched, notFound, amountMismatch, total: transactions.length };
  }

  async getUnmatchedByDate(date: string): Promise<Transaction[]> {
    const start = new Date(date + 'T00:00:00.000Z');
    const end = new Date(date + 'T23:59:59.999Z');

    return this.prisma.transaction.findMany({
      where: {
        isExcluded: false,
        transactionDate: { gte: start, lte: end },
        reconciliations: { none: {} },
      },
      include: {
        client: { select: { id: true, name: true, afiliacion: true } },
      },
      orderBy: { amount: 'desc' },
    });
  }

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

  // Compara los últimos 4 dígitos de tarjeta entre transacción y settlement
  private sameCard(transaction: Transaction, settlement: Settlement): boolean {
    const last4 = (v?: string | null) =>
      (v || '').replace(/\D/g, '').slice(-4);
    const txCard = last4(transaction.cardNumber);
    const stCard = last4(settlement.reference); // POSRE guarda num_cuenta en reference
    if (!txCard || !stCard) return false;
    return txCard === stCard;
  }

  private async reconcileTransaction(
    transaction: Transaction,
    clientId: any,
  ): Promise<{ status: ReconciliationStatus; reconciliation?: Reconciliation }> {
    // ── Estrategia de 3 niveles: auth → tarjeta → monto ──────────────
    if (transaction.authorizationNumber) {
      // Traer TODOS los settlements con ese auth aún no conciliados
      const candidates = await this.prisma.settlement.findMany({
        where: {
          authorizationNumber: transaction.authorizationNumber,
          reconciliations: { none: {} },
        },
      });

      if (candidates.length > 0) {
        // Nivel 2: filtrar por misma tarjeta (descarta colisiones de auth
        // entre emisores distintos que comparten el mismo num_autorizacion)
        const sameCardMatches = candidates.filter((s) =>
          this.sameCard(transaction, s),
        );

        // Si hay match por tarjeta, usar ese; si no, NO usar los de auth
        // (serían colisiones), seguimos a prioridad por monto+fecha.
        if (sameCardMatches.length > 0) {
          // Preferir el que además cuadra en monto
          const exact = sameCardMatches.find(
            (s) => Math.abs(transaction.amount - s.amount) <= this.AMOUNT_TOLERANCE,
          );
          if (exact) {
            return this.createReconciliation(
              transaction,
              exact,
              ReconciliationPriority.AUTHORIZATION_NUMBER,
            );
          }
          // Misma tarjeta pero monto distinto → DIFERENCIA real
          const s = sameCardMatches[0];
          return this.createReconciliation(
            transaction,
            s,
            ReconciliationPriority.AUTHORIZATION_NUMBER,
            ReconciliationStatus.AMOUNT_MISMATCH,
            Math.abs(transaction.amount - s.amount),
          );
        }
      }
    }

    // Priority 2: Match by transaction ID / settlement ID
    if (transaction.transactionId) {
      const settlement = await this.settlementsService.findBySettlementId(
        transaction.transactionId,
        clientId,
      );

      if (settlement && this.sameCard(transaction, settlement)) {
        const diff = Math.abs(transaction.amount - settlement.amount);
        return this.createReconciliation(
          transaction,
          settlement,
          ReconciliationPriority.TRANSACTION_ID,
          diff > this.AMOUNT_TOLERANCE
            ? ReconciliationStatus.AMOUNT_MISMATCH
            : ReconciliationStatus.MATCHED,
          diff > this.AMOUNT_TOLERANCE ? diff : undefined,
        );
      }
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

  async findById(id: any): Promise<Reconciliation | null> {
    return this.prisma.reconciliation.findUnique({
      where: { id },
      include: {
        transaction: true,
        settlement: true,
      },
    });
  }

  async getReconciliationStats(clientId: any): Promise<{
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

  async deleteReconciliation(id: any): Promise<void> {
    await this.prisma.reconciliation.delete({
      where: { id },
    });
  }
}
