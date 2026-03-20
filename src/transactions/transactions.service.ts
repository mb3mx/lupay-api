import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClientsService } from '../clients/clients.service';
import {
  Transaction,
  Prisma,
  CardBrand,
  TransactionStatus,
} from '@prisma/client';
import { FilterTransactionsDto } from './dto/filter-transactions.dto';
import { ParsedRow } from '../files/parsers/csv-parser';

// Excluded operation types
const EXCLUDED_OPERATIONS = ['CANCELACION', 'DEVOLUCION', 'CANCELACIÓN', 'DEVOLUCIÓN'];

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
  ) {}

  async createFromRow(
    row: ParsedRow,
    fileId: string,
    clientId: string,
  ): Promise<Transaction> {
    // Normalize and extract fields from row
    const transactionId = this.extractField(row, ['transactionId', 'transaction_id', 'id', 'ID']);
    const authorizationNumber = this.extractField(row, [
      'authorizationNumber',
      'authorization_number',
      'autorizacion',
      'autorización',
      'auth',
    ]);
    const reference = this.extractField(row, ['reference', 'referencia', 'ref']);
    const amount = this.parseAmount(this.extractField(row, ['amount', 'monto', 'importe', 'total']));
    const fee = this.parseAmount(this.extractField(row, ['fee', 'comision', 'comisión']));
    const iva = this.parseAmount(this.extractField(row, ['iva', 'tax', 'impuesto']));
    const cardBrand = this.parseCardBrand(
      this.extractField(row, ['cardBrand', 'card_brand', 'marca', 'brand']),
    );
    const cardNumber = this.extractField(row, ['cardNumber', 'card_number', 'tarjeta', 'card']);
    const operationType = this.extractField(row, [
      'operationType',
      'operation_type',
      'tipo',
      'type',
      'operacion',
      'operación',
    ]);
    const transactionDate = this.parseDate(
      this.extractField(row, ['transactionDate', 'transaction_date', 'fecha', 'date']),
    );

    // Determine if transaction should be excluded
    const isExcluded = this.shouldExclude(operationType);
    const exclusionReason = isExcluded
      ? `Excluded operation type: ${operationType}`
      : null;

    // Calculate liquidation date
    const liquidationDate = this.calculateLiquidationDate(transactionDate, cardBrand);

    // Get client for commission calculation
    const client = await this.clientsService.findById(clientId);
    const clientCommission = client ? amount * (client.commissionTotal / 100) : 0;
    const netToClient = amount - (fee || 0) - (iva || 0) - clientCommission;

    // Create transaction
    return this.prisma.transaction.create({
      data: {
        transactionId: transactionId || undefined,
        authorizationNumber: authorizationNumber || undefined,
        reference: reference || undefined,
        amount,
        fee: fee || 0,
        iva: iva || 0,
        cardBrand,
        cardNumber: cardNumber ? this.maskCardNumber(cardNumber) : undefined,
        status: TransactionStatus.ACTIVE,
        operationType: operationType || undefined,
        transactionDate,
        liquidationDate,
        clientCommission,
        netToClient,
        isExcluded,
        exclusionReason,
        clientId,
        fileId,
      },
    });
  }

  private extractField(row: ParsedRow, possibleKeys: string[]): string | null {
    for (const key of possibleKeys) {
      const normalizedKey = Object.keys(row).find(
        (k) => k.toLowerCase().replace(/[_\s]/g, '') === key.toLowerCase().replace(/[_\s]/g, ''),
      );
      if (normalizedKey && row[normalizedKey] != null) {
        return String(row[normalizedKey]).trim();
      }
    }
    return null;
  }

  private parseAmount(value: string | null): number {
    if (!value) return 0;
    // Remove currency symbols and whitespace
    const cleaned = value.replace(/[$\s,]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }

  private parseCardBrand(value: string | null): CardBrand {
    if (!value) return CardBrand.OTHER;
    const normalized = value.toUpperCase().trim();
    if (normalized.includes('VISA')) return CardBrand.VISA;
    if (normalized.includes('MASTER') || normalized.includes('MC')) return CardBrand.MASTERCARD;
    if (normalized.includes('AMEX') || normalized.includes('AMERICAN')) return CardBrand.AMEX;
    return CardBrand.OTHER;
  }

  private parseDate(value: string | null): Date {
    if (!value) return new Date();

    // Try various date formats
    const formats = [
      // ISO format
      () => new Date(value),
      // DD/MM/YYYY
      () => {
        const parts = value.split(/[\/\-]/);
        if (parts.length === 3) {
          return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        }
        return null;
      },
      // MM/DD/YYYY
      () => {
        const parts = value.split(/[\/\-]/);
        if (parts.length === 3) {
          return new Date(`${parts[2]}-${parts[0]}-${parts[1]}`);
        }
        return null;
      },
    ];

    for (const format of formats) {
      try {
        const result = format();
        if (result && !isNaN(result.getTime())) {
          return result;
        }
      } catch {
        continue;
      }
    }

    return new Date();
  }

  private shouldExclude(operationType: string | null): boolean {
    if (!operationType) return false;
    const normalized = operationType.toUpperCase().trim();
    return EXCLUDED_OPERATIONS.some((op) => normalized.includes(op));
  }

  private calculateLiquidationDate(transactionDate: Date, cardBrand: CardBrand): Date {
    const date = new Date(transactionDate);
    const hour = date.getHours();
    const isAmex = cardBrand === CardBrand.AMEX;

    let daysToAdd: number;

    if (isAmex) {
      daysToAdd = hour < 23 ? 2 : 3;
    } else {
      daysToAdd = hour < 23 ? 1 : 2;
    }

    date.setDate(date.getDate() + daysToAdd);
    return date;
  }

  private maskCardNumber(cardNumber: string): string {
    const cleaned = cardNumber.replace(/\s/g, '');
    if (cleaned.length < 4) return cleaned;
    return `****${cleaned.slice(-4)}`;
  }

  async findAll(filters: FilterTransactionsDto): Promise<{
    data: Transaction[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const {
      clientId,
      terminalId,
      cardBrand,
      status,
      startDate,
      endDate,
      authorizationNumber,
      transactionId,
      includeExcluded,
      page = 1,
      limit = 10,
    } = filters;

    const where: Prisma.TransactionWhereInput = {};

    if (clientId) where.clientId = clientId;
    if (terminalId) where.terminalId = terminalId;
    if (cardBrand) where.cardBrand = cardBrand;
    if (status) where.status = status;
    if (authorizationNumber) where.authorizationNumber = authorizationNumber;
    if (transactionId) where.transactionId = transactionId;
    if (!includeExcluded) where.isExcluded = false;

    if (startDate || endDate) {
      where.transactionDate = {};
      if (startDate) where.transactionDate.gte = new Date(startDate);
      if (endDate) where.transactionDate.lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { transactionDate: 'desc' },
        include: {
          client: {
            select: { id: true, code: true, name: true },
          },
          terminal: {
            select: { id: true, serialNumber: true },
          },
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: transactions,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string): Promise<Transaction | null> {
    return this.prisma.transaction.findUnique({
      where: { id },
      include: {
        client: {
          select: { id: true, code: true, name: true },
        },
        terminal: {
          select: { id: true, serialNumber: true },
        },
        reconciliations: {
          include: {
            settlement: true,
          },
        },
      },
    });
  }

  async getUnreconciledTransactions(clientId: string): Promise<Transaction[]> {
    return this.prisma.transaction.findMany({
      where: {
        clientId,
        isExcluded: false,
        reconciliations: {
          none: {},
        },
      },
      orderBy: { transactionDate: 'desc' },
    });
  }

  async getTransactionsForPayout(clientId: string, payoutDate: Date): Promise<Transaction[]> {
    const startOfDay = new Date(payoutDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(payoutDate);
    endOfDay.setHours(23, 59, 59, 999);

    return this.prisma.transaction.findMany({
      where: {
        clientId,
        isExcluded: false,
        liquidationDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        reconciliations: {
          some: {
            status: 'MATCHED',
          },
        },
        payoutItems: {
          none: {},
        },
      },
      orderBy: { transactionDate: 'desc' },
    });
  }
}
