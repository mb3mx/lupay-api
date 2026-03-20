import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClientsService } from '../clients/clients.service';
import {
  Settlement,
  Prisma,
  CardBrand,
} from '@prisma/client';
import { ParsedRow } from '../files/parsers/csv-parser';

@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
  ) {}

  async createFromRow(
    row: ParsedRow,
    fileId: string,
    clientId: string,
  ): Promise<Settlement> {
    // Normalize and extract fields from row
    const settlementId = this.extractField(row, [
      'settlementId',
      'settlement_id',
      'id',
      'ID',
      'liquidacion',
      'liquidación',
    ]);
    const authorizationNumber = this.extractField(row, [
      'authorizationNumber',
      'authorization_number',
      'autorizacion',
      'autorización',
      'auth',
    ]);
    const reference = this.extractField(row, ['reference', 'referencia', 'ref']);
    const amount = this.parseAmount(this.extractField(row, ['amount', 'monto', 'importe', 'total']));
    const settledAmount = this.parseAmount(
      this.extractField(row, ['settledAmount', 'settled_amount', 'liquidado', 'neto']),
    );
    const cardBrand = this.parseCardBrand(
      this.extractField(row, ['cardBrand', 'card_brand', 'marca', 'brand']),
    );
    const status = this.extractField(row, ['status', 'estado']);
    const settlementDate = this.parseDate(
      this.extractField(row, ['settlementDate', 'settlement_date', 'fecha', 'date', 'fecha_liquidacion']),
    );
    const transactionDate = this.parseDate(
      this.extractField(row, ['transactionDate', 'transaction_date', 'fecha_transaccion']),
    );

    // Create settlement
    return this.prisma.settlement.create({
      data: {
        settlementId: settlementId || undefined,
        authorizationNumber: authorizationNumber || undefined,
        reference: reference || undefined,
        amount,
        settledAmount: settledAmount || undefined,
        cardBrand,
        status: status || undefined,
        settlementDate,
        transactionDate: transactionDate || undefined,
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

    const formats = [
      () => new Date(value),
      () => {
        const parts = value.split(/[\/\-]/);
        if (parts.length === 3) {
          return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        }
        return null;
      },
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

  async findAll(params: {
    skip?: number;
    take?: number;
    where?: Prisma.SettlementWhereInput;
    orderBy?: Prisma.SettlementOrderByWithRelationInput;
  }): Promise<{ data: Settlement[]; meta: { total: number } }> {
    const { skip, take, where, orderBy } = params;

    const [settlements, total] = await Promise.all([
      this.prisma.settlement.findMany({
        where,
        skip,
        take,
        orderBy: orderBy || { settlementDate: 'desc' },
        include: {
          client: {
            select: { id: true, code: true, name: true },
          },
        },
      }),
      this.prisma.settlement.count({ where }),
    ]);

    return {
      data: settlements,
      meta: { total },
    };
  }

  async findById(id: string): Promise<Settlement | null> {
    return this.prisma.settlement.findUnique({
      where: { id },
      include: {
        client: {
          select: { id: true, code: true, name: true },
        },
        reconciliations: {
          include: {
            transaction: true,
          },
        },
      },
    });
  }

  async getUnreconciledSettlements(clientId: string): Promise<Settlement[]> {
    return this.prisma.settlement.findMany({
      where: {
        clientId,
        reconciliations: {
          none: {},
        },
      },
      orderBy: { settlementDate: 'desc' },
    });
  }

  async findByAuthorizationNumber(
    authorizationNumber: string,
    clientId: string,
  ): Promise<Settlement | null> {
    return this.prisma.settlement.findFirst({
      where: {
        authorizationNumber,
        clientId,
        reconciliations: {
          none: {},
        },
      },
    });
  }

  async findBySettlementId(
    settlementId: string,
    clientId: string,
  ): Promise<Settlement | null> {
    return this.prisma.settlement.findFirst({
      where: {
        settlementId,
        clientId,
        reconciliations: {
          none: {},
        },
      },
    });
  }

  async findByAmountAndDate(
    amount: number,
    settlementDate: Date,
    clientId: string,
    tolerance: number = 0.01,
  ): Promise<Settlement | null> {
    const startDate = new Date(settlementDate);
    startDate.setDate(startDate.getDate() - 1);

    const endDate = new Date(settlementDate);
    endDate.setDate(endDate.getDate() + 1);

    return this.prisma.settlement.findFirst({
      where: {
        clientId,
        amount: {
          gte: amount - tolerance,
          lte: amount + tolerance,
        },
        settlementDate: {
          gte: startDate,
          lte: endDate,
        },
        reconciliations: {
          none: {},
        },
      },
    });
  }
}
