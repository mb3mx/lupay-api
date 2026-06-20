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
  if (d.includes('CARNET')) return CardBrand.CARNET;
  return CardBrand.OTHER;
}

// POSRE: fecha_consumo (YYMMDD, ej 260211) + hora_consumo (HHMMSS, ej 163042)
// → Date completo 2026-02-11 16:30:42. Si la hora falta/inválida, queda a medianoche.
function parseFechaHoraConsumo(fechaRaw: unknown, horaRaw: unknown): Date {
  if (fechaRaw instanceof Date) return fechaRaw;
  const f = fechaRaw?.toString().trim() ?? '';
  if (f.length !== 6) return new Date();
  const yy = parseInt(f.substring(0, 2));
  const mm = parseInt(f.substring(2, 4)) - 1;
  const dd = parseInt(f.substring(4, 6));

  // hora_consumo viene como HHMMSS (rellenamos a 6 por si trae menos dígitos).
  const h = (horaRaw?.toString().trim() ?? '').padStart(6, '0');
  let hh = 0;
  let mi = 0;
  let ss = 0;
  if (/^\d{6}$/.test(h)) {
    hh = parseInt(h.substring(0, 2));
    mi = parseInt(h.substring(2, 4));
    ss = parseInt(h.substring(4, 6));
  }
  // UTC para que el día/hora queden tal cual el Excel (sin corrimiento de TZ).
  return new Date(Date.UTC(2000 + yy, mm, dd, hh, mi, ss));
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
  async *parse(source: string | Buffer): AsyncGenerator<PosreRow> {
    const workbook = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Buffer.isBuffer(source)) await workbook.xlsx.load(source as any);
    else await workbook.xlsx.readFile(source);

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
    const colHoraConsumo = idx('hora_consumo');
    const colFechaLiq = idx('FechaLiq');
    const colTasa = idx('Tasa');
    const colIva = idx('Iva');
    const colSobretasa = idx('Sobretasa');
    const colIvaSobretasa = idx('Iva_sobretasa');

    for (let rowNum = headerRow + 1; rowNum <= ws.rowCount; rowNum++) {
      const row = ws.getRow(rowNum);

      const authRaw = row.getCell(colAuth).value;
      if (!authRaw) continue;

      const amount = Number(row.getCell(colImporte).value ?? 0);
      const afilRaw = row.getCell(colAfil).value?.toString().trim() ?? '';
      // Quitar ceros a la izquierda
      const afiliacion = afilRaw.replace(/^0+/, '') || null;

      let montoPagar: number;
      if (colTasa > 0 || colIva > 0) {
        const tasa = colTasa > 0 ? Number(row.getCell(colTasa).value ?? 0) : 0;
        const iva = colIva > 0 ? Number(row.getCell(colIva).value ?? 0) : 0;
        const sobretasa = colSobretasa > 0 ? Number(row.getCell(colSobretasa).value ?? 0) : 0;
        const ivaSobretasa = colIvaSobretasa > 0 ? Number(row.getCell(colIvaSobretasa).value ?? 0) : 0;
        const sign = amount < 0 ? -1 : 1;
        montoPagar = Math.round((amount - (tasa + iva + sobretasa + ivaSobretasa) * sign) * 100) / 100;
      } else {
        montoPagar =
          row.getCell(colMontoPagar).value != null
            ? Number(row.getCell(colMontoPagar).value)
            : amount;
      }

      yield {
        authorizationNumber: authRaw.toString().trim(),
        cardNumber: row.getCell(colCuenta).value?.toString().trim() || null,
        amount,
        montoPagar,
        cardBrand: parseCardBrand(
          row.getCell(colDesc).value?.toString() || null,
        ),
        afiliacion,
        transactionDate: parseFechaHoraConsumo(
          row.getCell(colFechaConsumo).value,
          colHoraConsumo > 0 ? row.getCell(colHoraConsumo).value : null,
        ),
        settlementDate: parseFechaLiq(row.getCell(colFechaLiq).value),
        isCancelled: amount < 0,
      };
    }
  }
}
