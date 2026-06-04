import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(dateFrom: string, dateTo: string) {
    const from = new Date(dateFrom + 'T00:00:00.000Z');
    const to = new Date(dateTo + 'T23:59:59.999Z');

    const [totalTx, totalMatched, totalNotFound, totalMismatch, montoAgg] =
      await Promise.all([
        this.prisma.transaction.count({
          where: { isExcluded: false, transactionDate: { gte: from, lte: to } },
        }),
        this.prisma.reconciliation.count({
          where: {
            status: 'MATCHED',
            transaction: { transactionDate: { gte: from, lte: to } },
          },
        }),
        this.prisma.reconciliation.count({
          where: {
            status: 'NOT_FOUND',
            transaction: { transactionDate: { gte: from, lte: to } },
          },
        }),
        this.prisma.reconciliation.count({
          where: {
            status: 'AMOUNT_MISMATCH',
            transaction: { transactionDate: { gte: from, lte: to } },
          },
        }),
        this.prisma.transaction.aggregate({
          where: { isExcluded: false, transactionDate: { gte: from, lte: to } },
          _sum: { amount: true, importeLupay: true },
        }),
      ]);

    const montoTotal = montoAgg._sum.amount ?? 0;
    const pctMatch = totalTx > 0 ? (totalMatched / totalTx) * 100 : 0;

    // Sin match = transacciones que NO tienen una conciliación MATCHED.
    // El motor solo persiste registros MATCHED, por lo que los NOT_FOUND
    // se calculan como (total − conciliadas − con diferencia).
    const sinMatch = Math.max(0, totalTx - totalMatched - totalMismatch);

    return {
      totalTransacciones: totalTx,
      montoTotal: Math.round(montoTotal * 100) / 100,
      totalConciliadas: totalMatched,
      totalNoMatch: sinMatch,
      totalDiferencia: totalMismatch,
      pctMatch: Math.round(pctMatch * 100) / 100,
    };
  }

  async getDaily(date: string) {
    const from = new Date(date + 'T00:00:00.000Z');
    const to = new Date(date + 'T23:59:59.999Z');

    const transactions = await this.prisma.transaction.findMany({
      where: { isExcluded: false, transactionDate: { gte: from, lte: to } },
      select: {
        amount: true,
        importeLupay: true,
        cardBrand: true,
        transactionDate: true,
        merchantName: true,
        client: { select: { name: true } },
        reconciliations: { select: { status: true } },
      },
    });

    // Por hora
    const porHora: Record<number, { monto: number; count: number; conciliadas: number }> = {};
    for (let h = 0; h < 24; h++) porHora[h] = { monto: 0, count: 0, conciliadas: 0 };

    // Por cardBrand
    const porBrand: Record<string, { monto: number; count: number }> = {};

    // Por negocio
    const porNegocio: Record<string, { monto: number; count: number }> = {};

    for (const tx of transactions) {
      const hora = new Date(tx.transactionDate).getHours();
      porHora[hora].monto += tx.amount;
      porHora[hora].count++;
      const isMatched = tx.reconciliations.some((r) => r.status === 'MATCHED');
      if (isMatched) porHora[hora].conciliadas++;

      const brand = tx.cardBrand;
      porBrand[brand] = porBrand[brand] || { monto: 0, count: 0 };
      porBrand[brand].monto += tx.amount;
      porBrand[brand].count++;

      const neg = tx.merchantName || tx.client.name;
      porNegocio[neg] = porNegocio[neg] || { monto: 0, count: 0 };
      porNegocio[neg].monto += tx.amount;
      porNegocio[neg].count++;
    }

    const top5Negocios = Object.entries(porNegocio)
      .map(([nombre, v]) => ({ nombre, ...v }))
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 5);

    return {
      porHora: Object.entries(porHora).map(([hora, v]) => ({ hora: +hora, ...v })),
      porCardBrand: Object.entries(porBrand).map(([brand, v]) => ({ brand, ...v })),
      top5Negocios,
    };
  }

  async getMonthly(year: number, month: number) {
    const from = new Date(`${year}-${String(month).padStart(2,'0')}-01T00:00:00.000Z`);
    const lastDay = new Date(year, month, 0).getDate();
    const to = new Date(`${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}T23:59:59.999Z`);

    // Mes anterior
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevLastDay = new Date(prevYear, prevMonth, 0).getDate();
    const prevFrom = new Date(`${prevYear}-${String(prevMonth).padStart(2,'0')}-01T00:00:00.000Z`);
    const prevTo = new Date(`${prevYear}-${String(prevMonth).padStart(2,'0')}-${String(prevLastDay).padStart(2,'0')}T23:59:59.999Z`);

    const [current, previous] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { isExcluded: false, transactionDate: { gte: from, lte: to } },
        select: {
          amount: true,
          transactionDate: true,
          reconciliations: { select: { status: true } },
        },
      }),
      this.prisma.transaction.findMany({
        where: { isExcluded: false, transactionDate: { gte: prevFrom, lte: prevTo } },
        select: { amount: true, transactionDate: true },
      }),
    ]);

    // Agrupar por día
    const porDia: Record<number, { monto: number; count: number; conciliadas: number }> = {};
    for (const tx of current) {
      const dia = new Date(tx.transactionDate).getDate();
      porDia[dia] = porDia[dia] || { monto: 0, count: 0, conciliadas: 0 };
      porDia[dia].monto += tx.amount;
      porDia[dia].count++;
      if (tx.reconciliations.some((r) => r.status === 'MATCHED'))
        porDia[dia].conciliadas++;
    }

    const porDiaPrev: Record<number, number> = {};
    for (const tx of previous) {
      const dia = new Date(tx.transactionDate).getDate();
      porDiaPrev[dia] = (porDiaPrev[dia] || 0) + tx.amount;
    }

    return {
      porDia: Object.entries(porDia).map(([dia, v]) => ({
        dia: +dia,
        ...v,
        pctConciliado: v.count > 0 ? Math.round((v.conciliadas / v.count) * 10000) / 100 : 0,
        montoMesAnterior: porDiaPrev[+dia] || 0,
      })),
      totalMes: current.reduce((s, t) => s + t.amount, 0),
      totalMesAnterior: previous.reduce((s, t) => s + t.amount, 0),
    };
  }

  async exportReport(dateFrom: string, dateTo: string): Promise<Buffer> {
    const from = new Date(dateFrom + 'T00:00:00.000Z');
    const to = new Date(dateTo + 'T23:59:59.999Z');

    const reconciliations = await this.prisma.reconciliation.findMany({
      where: { transaction: { transactionDate: { gte: from, lte: to } } },
      include: {
        transaction: { include: { client: { select: { name: true, afiliacion: true } } } },
        settlement: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const wb = new ExcelJS.Workbook();

    const sheetDef = [
      { name: 'Conciliadas', status: 'MATCHED' },
      { name: 'Sin Match', status: 'NOT_FOUND' },
      { name: 'Diferencias', status: 'AMOUNT_MISMATCH' },
    ];

    const headers = [
      'Auth', 'Tarjeta', 'Cliente', 'Afiliación',
      'Monto Tx', 'Importe POSRE', 'Diferencia', 'Fecha',
    ];

    for (const { name, status } of sheetDef) {
      const ws = wb.addWorksheet(name);
      ws.addRow(headers);
      ws.getRow(1).font = { bold: true };

      for (const r of reconciliations.filter((rec) => rec.status === status)) {
        const tx = r.transaction;
        ws.addRow([
          tx.authorizationNumber ?? '',
          tx.cardNumber ?? '',
          tx.client.name,
          tx.client.afiliacion ?? '',
          tx.amount,
          r.settlement?.amount ?? '',
          r.amountDifference ?? 0,
          tx.transactionDate.toISOString().split('T')[0],
        ]);
      }
    }

    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }
}
