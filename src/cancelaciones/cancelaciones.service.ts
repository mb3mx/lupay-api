import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type TipoCancelacion =
  | 'DEVOLUCION'
  | 'CANCELACION'
  | 'REVERSO_AMEX'
  | 'POSRE_CANCELLED'
  | 'OTRO';

function classifyTx(reason?: string | null): TipoCancelacion {
  if (!reason) return 'OTRO';
  const r = reason.toUpperCase();
  if (r.includes('REVERSO') || r === 'REVERSO_AMEX') return 'REVERSO_AMEX';
  if (r.includes('DEVOLUC')) return 'DEVOLUCION';
  if (r.includes('CANCEL')) return 'CANCELACION';
  return 'OTRO';
}

@Injectable()
export class CancelacionesService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(params: {
    tipo?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const { tipo, dateFrom, dateTo, page = 1, limit = 20 } = params;

    const txWhere: any = { isExcluded: true };
    if (dateFrom && dateTo) {
      txWhere.transactionDate = {
        gte: new Date(dateFrom + 'T00:00:00.000Z'),
        lte: new Date(dateTo + 'T23:59:59.999Z'),
      };
    }
    if (tipo === 'DEVOLUCION') {
      txWhere.exclusionReason = { contains: 'DEVOLUC', mode: 'insensitive' };
    } else if (tipo === 'CANCELACION') {
      txWhere.exclusionReason = { contains: 'CANCEL', mode: 'insensitive' };
    } else if (tipo === 'REVERSO_AMEX') {
      txWhere.exclusionReason = { contains: 'REVERSO', mode: 'insensitive' };
    }

    // Si el filtro es POSRE_CANCELLED, no traemos transacciones
    const txs =
      tipo === 'POSRE_CANCELLED'
        ? []
        : await this.prisma.transaction.findMany({
            where: txWhere,
            include: {
              file: { select: { originalName: true, fileType: true } },
            },
            orderBy: { transactionDate: 'desc' },
          });

    // Settlements POSRE cancelados (importe negativo)
    let settlements: any[] = [];
    if (!tipo || tipo === 'POSRE_CANCELLED') {
      const stWhere: any = { status: 'CANCELLED' };
      if (dateFrom && dateTo) {
        stWhere.settlementDate = {
          gte: new Date(dateFrom + 'T00:00:00.000Z'),
          lte: new Date(dateTo + 'T23:59:59.999Z'),
        };
      }
      settlements = await this.prisma.settlement.findMany({
        where: stWhere,
        include: { file: { select: { originalName: true, fileType: true } } },
        orderBy: { settlementDate: 'desc' },
      });
    }

    const unified = [
      ...txs.map((t) => ({
        id: `tx-${t.id}`,
        tipo: classifyTx(t.exclusionReason),
        source: 'TRANSACTION' as const,
        authorizationNumber: t.authorizationNumber,
        cardNumber: t.cardNumber,
        amount: t.amount,
        date: t.transactionDate,
        merchantName: t.merchantName,
        afiliacion: t.afiliacion,
        reason: t.exclusionReason,
        fileOrigin: t.file?.originalName ?? null,
        fileType: t.file?.fileType ?? null,
      })),
      ...settlements.map((s) => ({
        id: `st-${s.id}`,
        tipo: 'POSRE_CANCELLED' as const,
        source: 'SETTLEMENT' as const,
        authorizationNumber: s.authorizationNumber,
        cardNumber: s.reference,
        amount: s.amount,
        date: s.settlementDate,
        merchantName: null,
        afiliacion: s.afiliacion,
        reason: 'POSRE importe negativo',
        fileOrigin: s.file?.originalName ?? null,
        fileType: s.file?.fileType ?? null,
      })),
    ].sort((a, b) => +new Date(b.date) - +new Date(a.date));

    const total = unified.length;
    const data = unified.slice((page - 1) * limit, page * limit);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getCounts(dateFrom?: string, dateTo?: string) {
    const txWhere: any = { isExcluded: true };
    const stWhere: any = { status: 'CANCELLED' };
    if (dateFrom && dateTo) {
      const range = {
        gte: new Date(dateFrom + 'T00:00:00.000Z'),
        lte: new Date(dateTo + 'T23:59:59.999Z'),
      };
      txWhere.transactionDate = range;
      stWhere.settlementDate = range;
    }

    const [allTx, devoluciones, cancelaciones, reversosAmex, posreCancelados] =
      await Promise.all([
        this.prisma.transaction.count({ where: txWhere }),
        this.prisma.transaction.count({
          where: {
            ...txWhere,
            exclusionReason: { contains: 'DEVOLUC', mode: 'insensitive' },
          },
        }),
        this.prisma.transaction.count({
          where: {
            ...txWhere,
            exclusionReason: { contains: 'CANCEL', mode: 'insensitive' },
          },
        }),
        this.prisma.transaction.count({
          where: {
            ...txWhere,
            exclusionReason: { contains: 'REVERSO', mode: 'insensitive' },
          },
        }),
        this.prisma.settlement.count({ where: stWhere }),
      ]);

    const otros = allTx - devoluciones - cancelaciones - reversosAmex;

    return {
      total: allTx + posreCancelados,
      devoluciones,
      cancelaciones,
      reversosAmex,
      posreCancelados,
      otros: Math.max(0, otros),
    };
  }
}
