import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';

@Injectable()
export class LiquidacionService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(fecha: string, force = false) {
    const from = new Date(fecha + 'T00:00:00.000Z');
    const to = new Date(fecha + 'T23:59:59.999Z');

    // Bloquear duplicados: solo se permite una activa por fecha
    const existing = await this.prisma.liquidacion.findFirst({
      where: { fecha: from, status: { not: 'CANCELADA' } },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      if (existing.status !== 'CALCULADA') {
        throw new ConflictException({
          code: 'LIQUIDACION_APPROVED',
          message: `Ya existe una liquidación ${existing.status} para esta fecha. No puede regenerarse.`,
          existingId: existing.id.toString(),
          existingStatus: existing.status,
        });
      }
      if (!force) {
        throw new ConflictException({
          code: 'LIQUIDACION_EXISTS',
          message: 'Ya existe una liquidación calculada para esta fecha.',
          existingId: existing.id.toString(),
          existingStatus: existing.status,
          existingTotalNeto: existing.totalNeto,
        });
      }
      // force=true: cancelar la previa antes de crear la nueva
      await this.prisma.liquidacion.update({
        where: { id: existing.id },
        data: { status: 'CANCELADA' },
      });
    }

    // Obtener transacciones conciliadas del día
    const transactions = await this.prisma.transaction.findMany({
      where: {
        isExcluded: false,
        transactionDate: { gte: from, lte: to },
        reconciliations: { some: { status: 'MATCHED' } },
      },
      include: {
        client: {
          include: { liquidadora: true, sindicato: true },
        },
      },
    });

    // Agrupar por merchantName (nombre del negocio en el archivo Transacciones)
    const porMerchant: Record<
      string,
      { merchantName: string; montoBruto: number; count: number }
    > = {};

    for (const tx of transactions) {
      const key = tx.merchantName || tx.client.name;
      if (!porMerchant[key]) {
        porMerchant[key] = { merchantName: key, montoBruto: 0, count: 0 };
      }
      porMerchant[key].montoBruto += tx.importeLupay ?? tx.amount;
      porMerchant[key].count++;
    }

    // Buscar cada merchant en el catálogo de clientes
    const merchantNames = Object.keys(porMerchant);
    const clientesCatalogo = await this.prisma.client.findMany({
      where: { name: { in: merchantNames } },
      include: { liquidadora: true, sindicato: true },
    });
    const clientesByName: Record<string, any> = {};
    for (const c of clientesCatalogo) clientesByName[c.name] = c;

    // Construir items — solo negocios con liquidadora asignada
    const porCliente: Record<
      string,
      { client: any; montoBruto: number; count: number }
    > = {};
    for (const [key, data] of Object.entries(porMerchant)) {
      const cliente = clientesByName[key];
      if (!cliente) continue;
      porCliente[key] = { client: cliente, montoBruto: data.montoBruto, count: data.count };
    }

    // Calcular totales
    let totalBruto = 0;
    let totalComision = 0;
    let totalNeto = 0;

    const items = Object.values(porCliente).map(({ client, montoBruto }) => {
      const pctComision = client.commissionTotal ?? 0;
      const comision = Math.round(montoBruto * pctComision * 100) / 100;
      const pagoNeto = Math.round((montoBruto - comision) * 100) / 100;
      totalBruto += montoBruto;
      totalComision += comision;
      totalNeto += pagoNeto;
      return {
        clientId: client.id,
        client,
        liquidadoraId: client.liquidadoraId,
        montoBruto: Math.round(montoBruto * 100) / 100,
        pctComision,
        comision,
        pagoNeto,
      };
    });

    // Crear registro de liquidación
    const liquidacion = await this.prisma.liquidacion.create({
      data: {
        fecha: from,
        totalBruto: Math.round(totalBruto * 100) / 100,
        totalComision: Math.round(totalComision * 100) / 100,
        totalNeto: Math.round(totalNeto * 100) / 100,
        items: {
          create: items
            .filter((i) => i.liquidadoraId)
            .map((i) => ({
              clientId: i.clientId,
              liquidadoraId: i.liquidadoraId!,
              montoBruto: i.montoBruto,
              pctComision: i.pctComision,
              comision: i.comision,
              pagoNeto: i.pagoNeto,
            })),
        },
      },
      include: {
        items: {
          include: {
            client: { include: { sindicato: true, liquidadora: true } },
            liquidadora: true,
          },
        },
      },
    });

    // Agrupar por liquidadora para respuesta
    const porLiquidadora: Record<string, { nombre: string; clabe: string; total: number }> = {};
    for (const item of liquidacion.items) {
      const liq = item.liquidadora;
      if (!liq) continue;
      const key = liq.id.toString();
      porLiquidadora[key] = porLiquidadora[key] || {
        nombre: liq.nombre,
        clabe: liq.clabe,
        total: 0,
      };
      porLiquidadora[key].total += item.pagoNeto;
    }

    return {
      id: liquidacion.id,
      fecha: liquidacion.fecha,
      totalBruto: liquidacion.totalBruto,
      totalComision: liquidacion.totalComision,
      totalNeto: liquidacion.totalNeto,
      totalNegocios: liquidacion.items.length,
      porLiquidadora: Object.values(porLiquidadora).map((l) => ({
        ...l,
        total: Math.round(l.total * 100) / 100,
      })),
    };
  }

  async cancel(id: bigint) {
    const liq = await this.prisma.liquidacion.findUnique({ where: { id } });
    if (!liq) throw new NotFoundException('Liquidación no encontrada');
    if (liq.status === 'CANCELADA') {
      throw new ConflictException({
        code: 'ALREADY_CANCELLED',
        message: 'La liquidación ya está cancelada.',
      });
    }
    if (liq.status !== 'CALCULADA') {
      throw new ConflictException({
        code: 'CANNOT_CANCEL',
        message: `No puede cancelarse una liquidación ${liq.status}.`,
      });
    }
    return this.prisma.liquidacion.update({
      where: { id },
      data: { status: 'CANCELADA' },
    });
  }

  async findAll(includeCancelled = false) {
    return this.prisma.liquidacion.findMany({
      where: includeCancelled ? undefined : { status: { not: 'CANCELADA' } },
      orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { items: true } } },
    });
  }

  async findById(id: bigint) {
    const liq = await this.prisma.liquidacion.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            client: { include: { sindicato: true, liquidadora: true } },
            liquidadora: true,
          },
          orderBy: { pagoNeto: 'desc' },
        },
      },
    });
    if (!liq) throw new NotFoundException(`Liquidación ${id} no encontrada`);
    return liq;
  }

  async exportExcel(id: bigint): Promise<Buffer> {
    const liq = await this.findById(id);
    const wb = new ExcelJS.Workbook();

    // Hoja 1: Transferencias finales por liquidadora
    const wsTransf = wb.addWorksheet('Transferencias');
    wsTransf.addRow(['Empresa', 'Banco', 'CLABE', 'Monto a Transferir']);
    wsTransf.getRow(1).font = { bold: true };

    const porLiq: Record<string, { razonSocial: string; banco: string; clabe: string; total: number }> = {};
    for (const item of liq.items) {
      const l = item.liquidadora;
      if (!l) continue;
      const k = l.id.toString();
      porLiq[k] = porLiq[k] || { razonSocial: l.razonSocial, banco: l.banco, clabe: l.clabe, total: 0 };
      porLiq[k].total += item.pagoNeto;
    }
    for (const v of Object.values(porLiq)) {
      wsTransf.addRow([v.razonSocial, v.banco, v.clabe, Math.round(v.total * 100) / 100]);
    }

    // Hoja 2: LIQ BUG por negocio
    const wsLiq = wb.addWorksheet('LIQ BUG');
    wsLiq.addRow([
      'Negocio', 'Razón Social', 'Sindicato', 'Monto Bruto',
      '% Comisión', 'Comisión', 'Pago Neto',
    ]);
    wsLiq.getRow(1).font = { bold: true };
    for (const item of liq.items) {
      wsLiq.addRow([
        item.client.name,
        item.liquidadora?.razonSocial ?? '',
        item.client.sindicato?.nombre ?? '',
        item.montoBruto,
        `${(item.pctComision * 100).toFixed(2)}%`,
        item.comision,
        item.pagoNeto,
      ]);
    }

    // Hoja 3: Por Sindicato
    const wsSind = wb.addWorksheet('Por Sindicato');
    wsSind.addRow(['Sindicato', 'Banco', 'CLABE', 'Negocios', 'Total Pago Neto']);
    wsSind.getRow(1).font = { bold: true };

    const porSind: Record<string, { nombre: string; banco: string; clabe: string; count: number; total: number }> = {};
    for (const item of liq.items) {
      const s = item.client.sindicato;
      if (!s) continue;
      const k = s.id.toString();
      porSind[k] = porSind[k] || { nombre: s.nombre, banco: s.banco, clabe: s.clabe, count: 0, total: 0 };
      porSind[k].count++;
      porSind[k].total += item.pagoNeto;
    }
    for (const v of Object.values(porSind)) {
      wsSind.addRow([v.nombre, v.banco, v.clabe, v.count, Math.round(v.total * 100) / 100]);
    }

    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }
}
