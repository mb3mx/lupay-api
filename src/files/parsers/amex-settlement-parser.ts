import * as ExcelJS from 'exceljs';
import { CardBrand } from '@prisma/client';
import { PosreRow } from './posre-parser';

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

function parseHora12(raw: string | null): { hh: number; mi: number; ss: number } {
  if (!raw) return { hh: 0, mi: 0, ss: 0 };
  const m = raw
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return { hh: 0, mi: 0, ss: 0 };
  let hh = parseInt(m[1]);
  const mi = parseInt(m[2]);
  const ss = m[3] ? parseInt(m[3]) : 0;
  const ap = m[4]?.toUpperCase();
  if (ap === 'PM' && hh < 12) hh += 12;
  if (ap === 'AM' && hh === 12) hh = 0;
  return { hh, mi, ss };
}

function parseFechaHora(fechaRaw: unknown, horaRaw: string | null): Date {
  const { hh, mi, ss } = parseHora12(horaRaw);
  if (fechaRaw instanceof Date) {
    return new Date(
      Date.UTC(fechaRaw.getFullYear(), fechaRaw.getMonth(), fechaRaw.getDate(), hh, mi, ss),
    );
  }
  if (typeof fechaRaw === 'string') {
    const parts = fechaRaw.split('/');
    if (parts.length === 3) {
      return new Date(
        Date.UTC(
          parseInt(parts[2]),
          parseInt(parts[1]) - 1,
          parseInt(parts[0]),
          hh,
          mi,
          ss,
        ),
      );
    }
  }
  return new Date();
}

export class AmexSettlementParser {
  async *parse(source: string | Buffer): AsyncGenerator<PosreRow> {
    const workbook = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Buffer.isBuffer(source)) await workbook.xlsx.load(source as any);
    else await workbook.xlsx.readFile(source);

    const ws =
      workbook.getWorksheet('DETALLE') || workbook.worksheets[0];

    if (!ws) throw new Error('Hoja DETALLE no encontrada en archivo AMEX');

    const headers: Record<number, string> = {};
    ws.getRow(1).eachCell((cell, col) => {
      if (cell.value) headers[col] = cell.value.toString().trim();
    });

    const idx = (possibleNames: string[]): number => {
      const entry = Object.entries(headers).find(([, val]) => {
        const normalizedVal = val.toLowerCase().replace(/[^a-z0-9]/g, '');
        return possibleNames.some(p => p.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedVal);
      });
      return entry ? parseInt(entry[0]) : -1;
    };

    const colAfil = idx(['Afiliación', 'afiliacion', 'afil']);
    const colTarjeta = idx(['Número de Tarjeta', 'tarjeta', 'cuenta', 'numcuenta']);
    const colMonto = idx(['Monto', 'Monto Total', 'importe', 'total']);
    const colFecha = idx(['Fecha', 'fechaconsumo', 'fechaliq']);
    const colHora = idx(['Hora', 'horaconsumo']);
    const colTipo = idx(['Tipo de Transacción', 'tipo', 'tipooperacion', 'operacion']);
    const colAuth = idx(['Número de autorización', 'autorizacion', 'numautorizacion', 'auth']);
    
    const colCom = idx([
      'Monto Comisión Efevoopay',
      'Monto Comisión Lupay',
      'Monto Comisión ',
      'Monto Comisión',
      'Comisión',
    ]);
    const colIva = idx([
      'IVA Comisión Efevoopay',
      'IVA Comisión Lupay',
      'IVA Comisión ',
      'IVA Comisión',
      'IVA',
    ]);

    if (colMonto === -1 || colFecha === -1 || colAuth === -1) {
      throw new Error(
        'Columnas requeridas no encontradas (Monto/Monto Total, Fecha o Autorización). ' +
        'Por favor verifica los encabezados de tu archivo.'
      );
    }

    for (let rowNum = 2; rowNum <= ws.rowCount; rowNum++) {
      const row = ws.getRow(rowNum);

      const tipo = row.getCell(colTipo).value?.toString().trim() ?? '';
      const fecha = row.getCell(colFecha).value;

      // Saltar filas de subtotales
      if (!tipo && !fecha) continue;

      const monto = Number(row.getCell(colMonto).value ?? 0);
      const fee = Number(row.getCell(colCom).value ?? 0);
      const iva = Number(row.getCell(colIva).value ?? 0);

      const isReverso = tipo.toUpperCase() === 'REVERSO';
      const authRaw = row.getCell(colAuth).value?.toString().trim() ?? null;
      const horaRaw = row.getCell(colHora).value?.toString().trim() ?? null;

      const amount = isReverso ? -Math.abs(monto) : monto;
      const netAmount = Math.round((monto - fee - iva) * 100) / 100;
      const montoPagar = isReverso ? -Math.abs(netAmount) : netAmount;

      yield {
        authorizationNumber: authRaw,
        cardNumber: row.getCell(colTarjeta).value?.toString().trim() || null,
        amount,
        montoPagar,
        cardBrand: CardBrand.AMEX,
        afiliacion: row.getCell(colAfil).value?.toString().trim() || null,
        transactionDate: parseFechaHora(fecha, horaRaw),
        settlementDate: parseDate(fecha),
        isCancelled: isReverso || amount < 0,
      };
    }
  }
}
