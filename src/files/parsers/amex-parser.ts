import * as ExcelJS from 'exceljs';
import { CardBrand } from '@prisma/client';

export interface AmexRow {
  authorizationNumber: string | null;
  cardNumber: string | null;
  amount: number;
  fee: number;
  iva: number;
  importeLupay: number;
  cardBrand: CardBrand;
  tipoPago: string | null;
  operationType: string;
  transactionDate: Date;
  afiliacion: string | null;
  transactionId: string | null;
  reference: string | null;
  isExcluded: boolean;
  exclusionReason: string | null;
  merchantName: string | null;
}

function parseDate(raw: unknown): Date {
  if (raw instanceof Date) return raw;
  if (typeof raw === 'string') {
    const parts = raw.split('/');
    if (parts.length === 3) {
      return new Date(
        parseInt(parts[2]),
        parseInt(parts[1]) - 1,
        parseInt(parts[0]),
      );
    }
  }
  return new Date();
}

export class AmexParser {
  async *parse(filePath: string): AsyncGenerator<AmexRow> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const ws =
      workbook.getWorksheet('DETALLE') || workbook.worksheets[0];

    if (!ws) throw new Error('Hoja DETALLE no encontrada en archivo AMEX');

    const headers: Record<number, string> = {};
    ws.getRow(1).eachCell((cell, col) => {
      if (cell.value) headers[col] = cell.value.toString().trim();
    });

    const idx = (name: string): number => {
      const entry = Object.entries(headers).find(([, v]) => v === name);
      return entry ? parseInt(entry[0]) : -1;
    };

    const colId = idx('ID');
    const colAfil = idx('Afiliación');
    const colCliente = idx('Cliente');
    const colTarjeta = idx('Número de Tarjeta');
    const colMonto = idx('Monto');
    const colFecha = idx('Fecha');
    const colTipo = idx('Tipo de Transacción');
    const colAuth = idx('Número de autorización');
    // AMEX usa "Tasa Comisión Efevoopay" / "Monto Comisión Efevoopay"
    const colCom =
      idx('Monto Comisión Efevoopay') !== -1
        ? idx('Monto Comisión Efevoopay')
        : idx('Monto Comisión Lupay');
    const colIva =
      idx('IVA Comisión Efevoopay') !== -1
        ? idx('IVA Comisión Efevoopay')
        : idx('IVA Comisión Lupay');
    const colMetodo = idx('Método de Pago');
    const colRef = idx('Referencia');

    for (let rowNum = 2; rowNum <= ws.rowCount; rowNum++) {
      const row = ws.getRow(rowNum);

      const tipo = row.getCell(colTipo).value?.toString().trim() ?? '';
      const fecha = row.getCell(colFecha).value;

      // Saltar filas de subtotales: no tienen Fecha ni Tipo
      if (!tipo && !fecha) continue;

      const idRaw = row.getCell(colId).value?.toString().trim() ?? '';
      const monto = Number(row.getCell(colMonto).value ?? 0);
      const fee = Number(row.getCell(colCom).value ?? 0);
      const iva = Number(row.getCell(colIva).value ?? 0);

      // REVERSO: el auth bancario es el ID del pago original
      const isReverso = tipo.toUpperCase() === 'REVERSO';
      const authRaw = row.getCell(colAuth).value?.toString().trim() ?? null;

      yield {
        authorizationNumber: isReverso ? null : authRaw,
        cardNumber: row.getCell(colTarjeta).value?.toString().trim() || null,
        amount: monto,
        fee,
        iva,
        importeLupay: Math.round((monto - fee - iva) * 100) / 100,
        cardBrand: CardBrand.AMEX,
        tipoPago: row.getCell(colMetodo).value?.toString().trim() || null,
        operationType: tipo || 'PAGO',
        transactionDate: parseDate(fecha),
        afiliacion:
          row.getCell(colAfil).value?.toString().trim() || null,
        transactionId: idRaw || null,
        // Para REVERSO guardamos el auth del pago original en reference
        reference: isReverso ? authRaw : (row.getCell(colRef).value?.toString().trim() || null),
        isExcluded: isReverso,
        exclusionReason: isReverso ? 'REVERSO_AMEX' : null,
        merchantName: row.getCell(colCliente).value?.toString().trim() || null,
      };
    }
  }
}
