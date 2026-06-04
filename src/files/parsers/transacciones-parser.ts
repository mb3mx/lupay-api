import * as ExcelJS from 'exceljs';
import { CardBrand } from '@prisma/client';

export interface TransaccionRow {
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
  propina: number;
  merchantName: string | null;
}

function parseCardBrand(marca: string | null): CardBrand {
  if (!marca) return CardBrand.OTHER;
  const m = marca.toUpperCase();
  if (m === 'MC' || m.includes('MASTER')) return CardBrand.MASTERCARD;
  if (m.includes('VISA')) return CardBrand.VISA;
  if (m.includes('AMEX')) return CardBrand.AMEX;
  return CardBrand.OTHER;
}

function parseDate(raw: unknown): Date {
  if (raw instanceof Date) return raw;
  if (typeof raw === 'string') {
    // dd/MM/yyyy
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

export class TransaccionesParser {
  async *parse(filePath: string): AsyncGenerator<TransaccionRow> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    // Hoja puede tener espacio al final
    const ws =
      workbook.getWorksheet('Transacciones ') ||
      workbook.getWorksheet('Transacciones') ||
      workbook.worksheets[0];

    if (!ws) throw new Error('Hoja Transacciones no encontrada');

    // Leer headers de fila 1
    const headers: Record<number, string> = {};
    ws.getRow(1).eachCell((cell, col) => {
      if (cell.value) headers[col] = cell.value.toString().trim();
    });

    const idx = (name: string): number => {
      const entry = Object.entries(headers).find(([, v]) => v === name);
      return entry ? parseInt(entry[0]) : -1;
    };

    const colAuth = idx('Número de autorización');
    const colTarjeta = idx('Número de Tarjeta');
    const colMonto = idx('Monto');
    const colFecha = idx('Fecha');
    const colTipo = idx('Tipo de Transacción');
    const colMarca = idx('Marca de Tarjeta');
    const colAfil = idx('Afiliación');
    const colCom = idx('Monto Comisión Lupay');
    const colIva = idx('IVA Comisión Lupay');
    const colMetodo = idx('Método de Pago');
    const colId = idx('ID');
    const colRef = idx('Referencia');
    const colPropina = idx('Propina');
    const colCliente = idx('Cliente');

    for (let rowNum = 2; rowNum <= ws.rowCount; rowNum++) {
      const row = ws.getRow(rowNum);

      const tipo = row.getCell(colTipo).value?.toString().trim() ?? '';
      if (!tipo) continue;

      const monto = Number(row.getCell(colMonto).value ?? 0);
      const fee = Number(row.getCell(colCom).value ?? 0);
      const iva = Number(row.getCell(colIva).value ?? 0);
      const propina = Number(row.getCell(colPropina).value ?? 0);

      const isExcluded = tipo.toUpperCase() !== 'PAGO';

      yield {
        authorizationNumber:
          row.getCell(colAuth).value?.toString().trim() || null,
        cardNumber: row.getCell(colTarjeta).value?.toString().trim() || null,
        amount: monto,
        fee,
        iva,
        importeLupay: Math.round((monto - fee - iva) * 100) / 100,
        cardBrand: parseCardBrand(
          row.getCell(colMarca).value?.toString() || null,
        ),
        tipoPago: row.getCell(colMetodo).value?.toString().trim() || null,
        operationType: tipo,
        transactionDate: parseDate(row.getCell(colFecha).value),
        afiliacion: row.getCell(colAfil).value?.toString().trim() || null,
        transactionId:
          row.getCell(colId).value?.toString().trim() || null,
        reference: row.getCell(colRef).value?.toString().trim() || null,
        isExcluded,
        exclusionReason: isExcluded ? tipo : null,
        propina,
        merchantName: row.getCell(colCliente).value?.toString().trim() || null,
      };
    }
  }
}
