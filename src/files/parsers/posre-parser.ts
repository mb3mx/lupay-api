import * as ExcelJS from 'exceljs';
import { CardBrand } from '@prisma/client';

export interface PosreRow {
  authorizationNumber: string | null;
  cardNumber: string | null;
  amount: number;
  montoPagar: number | null;
  cardBrand: CardBrand;
  afiliacion: string | null;
  transactionDate: Date;
  settlementDate: Date;
  isCancelled: boolean;
}

function parseCardBrand(descripcion: string | null): CardBrand {
  if (!descripcion) return CardBrand.OTHER;
  const d = descripcion.toUpperCase();
  if (d.includes('MASTERCARD') || d.includes('MC')) return CardBrand.MASTERCARD;
  if (d.includes('VISA')) return CardBrand.VISA;
  if (d.includes('AMEX')) return CardBrand.AMEX;
  return CardBrand.OTHER;
}

// POSRE fecha_consumo formato YYMMDD, ej: 260211 → 2026-02-11
function parseFechaConsumo(raw: unknown): Date {
  if (raw instanceof Date) return raw;
  const s = raw?.toString().trim() ?? '';
  if (s.length === 6) {
    const yy = parseInt(s.substring(0, 2));
    const mm = parseInt(s.substring(2, 4)) - 1;
    const dd = parseInt(s.substring(4, 6));
    return new Date(2000 + yy, mm, dd);
  }
  return new Date();
}

function parseFechaLiq(raw: unknown): Date {
  if (raw instanceof Date) return raw;
  if (typeof raw === 'string') {
    // yyyy-MM-dd
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

export class PosreParser {
  async *parse(filePath: string): AsyncGenerator<PosreRow> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const ws =
      workbook.getWorksheet('POSRE') || workbook.worksheets[0];

    if (!ws) throw new Error('Hoja POSRE no encontrada');

    // Detectar fila de headers (puede ser fila 1 o 2)
    let headerRow = 1;
    const firstCell = ws.getRow(1).getCell(1).value?.toString() ?? '';
    if (firstCell !== 'nombre') headerRow = 2;

    const headers: Record<number, string> = {};
    ws.getRow(headerRow).eachCell((cell, col) => {
      if (cell.value) headers[col] = cell.value.toString().trim();
    });

    const idx = (name: string): number => {
      const entry = Object.entries(headers).find(([, v]) => v === name);
      return entry ? parseInt(entry[0]) : -1;
    };

    const colAuth = idx('num_autorizacion');
    const colCuenta = idx('num_cuenta');
    const colImporte = idx('importe');
    const colMontoPagar = idx('MontoPagar');
    const colDesc = idx('descripcion');
    const colAfil = idx('clave_comercio');
    const colFechaConsumo = idx('fecha_consumo');
    const colFechaLiq = idx('FechaLiq');

    for (let rowNum = headerRow + 1; rowNum <= ws.rowCount; rowNum++) {
      const row = ws.getRow(rowNum);

      const authRaw = row.getCell(colAuth).value;
      if (!authRaw) continue;

      const amount = Number(row.getCell(colImporte).value ?? 0);
      const afilRaw = row.getCell(colAfil).value?.toString().trim() ?? '';
      // Quitar ceros a la izquierda
      const afiliacion = afilRaw.replace(/^0+/, '') || null;

      yield {
        authorizationNumber: authRaw.toString().trim(),
        cardNumber: row.getCell(colCuenta).value?.toString().trim() || null,
        amount,
        montoPagar:
          row.getCell(colMontoPagar).value != null
            ? Number(row.getCell(colMontoPagar).value)
            : null,
        cardBrand: parseCardBrand(
          row.getCell(colDesc).value?.toString() || null,
        ),
        afiliacion,
        transactionDate: parseFechaConsumo(row.getCell(colFechaConsumo).value),
        settlementDate: parseFechaLiq(row.getCell(colFechaLiq).value),
        isCancelled: amount < 0,
      };
    }
  }
}
