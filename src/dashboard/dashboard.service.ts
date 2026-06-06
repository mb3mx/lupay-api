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
    const sinMatch = Math.max(0, totalTx - totalMatched - totalMismatch);

    // Calcular Monto Total Lupay (ingreso del sistema desde el procesador) y
    // Ganancias (comisión propia del sistema sobre cada negocio = COM CTE).
    // Para Ganancias hay que multiplicar el IMPORTE LUPAY de cada negocio
    // por su % de comisión definido en client.commissionTotal.
    const byMerchant = await this.prisma.transaction.groupBy({
      by: ['merchantName'],
      where: { isExcluded: false, transactionDate: { gte: from, lte: to } },
      _sum: { importeLupay: true },
    });

    const merchantNames = byMerchant
      .map((g) => g.merchantName)
      .filter((n): n is string => !!n);

    const clientsByName = merchantNames.length
      ? await this.prisma.client.findMany({
          where: { name: { in: merchantNames } },
          select: { name: true, commissionTotal: true },
        })
      : [];
    const commByName = new Map(
      clientsByName.map((c) => [c.name, c.commissionTotal]),
    );

    let montoTotalLupay = 0;
    let ganancias = 0;
    for (const g of byMerchant) {
      const il = g._sum.importeLupay ?? 0;
      montoTotalLupay += il;
      const comm = commByName.get(g.merchantName ?? '') ?? 0;
      ganancias += il * comm;
    }

    return {
      totalTransacciones: totalTx,
      montoTotal: Math.round(montoTotal * 100) / 100,
      montoTotalLupay: Math.round(montoTotalLupay * 100) / 100,
      ganancias: Math.round(ganancias * 100) / 100,
      totalConciliadas: totalMatched,
      totalNoMatch: sinMatch,
      totalDiferencia: totalMismatch,
      pctMatch: Math.round(pctMatch * 100) / 100,
    };
  }

  // Devuelve datos del Dashboard agregados según la granularidad del rango:
  // - Si dateFrom === dateTo  → buckets por HORA (24 entradas)
  // - Si dateFrom !== dateTo  → buckets por DÍA
  async getRange(dateFrom: string, dateTo: string) {
    const from = new Date(dateFrom + 'T00:00:00.000Z');
    const to = new Date(dateTo + 'T23:59:59.999Z');
    const isSingleDay = dateFrom === dateTo;

    const transactions = await this.prisma.transaction.findMany({
      where: { isExcluded: false, transactionDate: { gte: from, lte: to } },
      select: {
        amount: true,
        cardBrand: true,
        transactionDate: true,
        merchantName: true,
        client: { select: { name: true } },
        reconciliations: { select: { status: true } },
      },
    });

    // Buckets por hora o por día
    const buckets: Record<
      string,
      { monto: number; count: number; conciliadas: number }
    > = {};

    if (isSingleDay) {
      for (let h = 0; h < 24; h++) {
        buckets[String(h)] = { monto: 0, count: 0, conciliadas: 0 };
      }
    }

    const porBrand: Record<string, { monto: number; count: number }> = {};
    const porNegocio: Record<string, { monto: number; count: number }> = {};

    for (const tx of transactions) {
      const d = new Date(tx.transactionDate);
      const key = isSingleDay
        ? String(d.getUTCHours())
        : d.toISOString().split('T')[0];
      buckets[key] = buckets[key] || { monto: 0, count: 0, conciliadas: 0 };
      buckets[key].monto += tx.amount;
      buckets[key].count++;
      if (tx.reconciliations.some((r) => r.status === 'MATCHED')) {
        buckets[key].conciliadas++;
      }

      const brand = tx.cardBrand;
      porBrand[brand] = porBrand[brand] || { monto: 0, count: 0 };
      porBrand[brand].monto += tx.amount;
      porBrand[brand].count++;

      const neg = tx.merchantName || tx.client.name;
      porNegocio[neg] = porNegocio[neg] || { monto: 0, count: 0 };
      porNegocio[neg].monto += tx.amount;
      porNegocio[neg].count++;
    }

    const timeSeries = Object.entries(buckets)
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) =>
        a.key.localeCompare(b.key, undefined, { numeric: true }),
      );

    const top5Negocios = Object.entries(porNegocio)
      .map(([nombre, v]) => ({ nombre, ...v }))
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 5);

    return {
      granularity: isSingleDay ? 'hour' : 'day',
      timeSeries,
      porCardBrand: Object.entries(porBrand).map(([brand, v]) => ({ brand, ...v })),
      top5Negocios,
    };
  }

  // Wrapper para compatibilidad
  async getDaily(date: string) {
    return this.getRange(date, date);
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

  async exportReport(
    dateFrom: string,
    dateTo: string,
    status?: string,
  ): Promise<Buffer> {
    const from = new Date(dateFrom + 'T00:00:00.000Z');
    const to = new Date(dateTo + 'T23:59:59.999Z');

    // Traer TODAS las transacciones del rango con su reconciliation (si existe)
    // Esto permite incluir los NOT_FOUND (sin registro en reconciliation)
    const transactions = await this.prisma.transaction.findMany({
      where: {
        isExcluded: false,
        transactionDate: { gte: from, lte: to },
      },
      include: {
        client: { select: { name: true, afiliacion: true } },
        reconciliations: { include: { settlement: true }, take: 1 },
      },
      orderBy: { transactionDate: 'asc' },
    });

    // Clasificar cada transacción en su hoja
    const matched: any[] = [];
    const notFound: any[] = [];
    const mismatch: any[] = [];
    for (const tx of transactions) {
      const rec = tx.reconciliations[0];
      const row = {
        auth: tx.authorizationNumber ?? '',
        tarjeta: tx.cardNumber ?? '',
        cliente: tx.merchantName ?? tx.client?.name ?? '',
        afiliacion: tx.afiliacion ?? tx.client?.afiliacion ?? '',
        montoTx: tx.amount,
        importeLupay: tx.importeLupay ?? 0,
        importePosre: rec?.settlement?.amount ?? '',
        diferencia: rec?.amountDifference ?? 0,
        fecha: tx.transactionDate.toISOString().split('T')[0],
      };
      if (!rec) notFound.push(row);
      else if (rec.status === 'AMOUNT_MISMATCH') mismatch.push(row);
      else matched.push(row);
    }

    const wb = new ExcelJS.Workbook();
    const headers = [
      'Auth', 'Tarjeta', 'Cliente', 'Afiliación',
      'Monto Tx', 'Importe Lupay', 'Importe POSRE', 'Diferencia', 'Fecha',
    ];

    const addSheet = (name: string, rows: any[]) => {
      const ws = wb.addWorksheet(name);
      ws.addRow(headers);
      ws.getRow(1).font = { bold: true };
      for (const r of rows) {
        ws.addRow([
          r.auth, r.tarjeta, r.cliente, r.afiliacion,
          r.montoTx, r.importeLupay, r.importePosre, r.diferencia, r.fecha,
        ]);
      }
      // Auto-ajustar anchos
      ws.columns.forEach((col) => { col.width = 15; });
    };

    // Si hay filtro de estado, exportar solo esa hoja; sino, las 3
    if (status === 'MATCHED') {
      addSheet('Conciliadas', matched);
    } else if (status === 'NOT_FOUND') {
      addSheet('Sin Match', notFound);
    } else if (status === 'AMOUNT_MISMATCH') {
      addSheet('Diferencias', mismatch);
    } else {
      addSheet('Conciliadas', matched);
      addSheet('Sin Match', notFound);
      addSheet('Diferencias', mismatch);
    }

    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }
}
