import * as ExcelJS from 'exceljs';
import { CardBrand } from '@prisma/client';

export interface TransaccionRow {
  // Campos clave usados por el motor
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

  // Campos del Excel preservados aunque no se usen en lógica de conciliación
  adquiriente: string | null;
  fiid: string | null;
  hora: string | null;
  modoEntrada: string | null;
  metodoAutenticacion: string | null;
  eci: string | null;
  tipoTarjeta: string | null;
  tasaComision: string | null;
  tasaSobretasa: string | null;
  montoSobretasa: number | null;
  ivaSobretasa: number | null;
  sucursal: string | null;
  producto: string | null;
  terminalSerial: string | null;
  email: string | null;
  propina: number | null;
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

function cellStr(cell: ExcelJS.Cell): string | null {
  const v = cell.value;
  if (v === null || v === undefined || v === '') return null;
  return String(v).trim();
}

function cellNum(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export class TransaccionesParser {
  async *parse(filePath: string): AsyncGenerator<TransaccionRow> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const ws =
      workbook.getWorksheet('Transacciones ') ||
      workbook.getWorksheet('Transacciones') ||
      workbook.worksheets[0];

    if (!ws) throw new Error('Hoja Transacciones no encontrada');

    // Headers en fila 1
    const headers: Record<number, string> = {};
    ws.getRow(1).eachCell((cell, col) => {
      if (cell.value) headers[col] = cell.value.toString().trim();
    });

    const idx = (name: string): number => {
      const entry = Object.entries(headers).find(([, v]) => v === name);
      return entry ? parseInt(entry[0]) : -1;
    };

    // Mapeo de TODAS las columnas
    const C = {
      id: idx('ID'),
      adquiriente: idx('Adquiriente'),
      afiliacion: idx('Afiliación'),
      fiid: idx('FIID'),
      cliente: idx('Cliente'),
      marca: idx('Marca de Tarjeta'),
      metodo: idx('Método de Pago'),
      tarjeta: idx('Número de Tarjeta'),
      monto: idx('Monto'),
      fecha: idx('Fecha'),
      hora: idx('Hora'),
      tipo: idx('Tipo de Transacción'),
      auth: idx('Número de autorización'),
      modoEntrada: idx('Modo de Entrada'),
      metodoAuth: idx('Metodo de Autenticación TH'),
      eci: idx('ECI'),
      tipoTarj: idx('Tipo de Tarjeta'),
      tasaCom: idx('Tasa Comisión Lupay'),
      montoCom: idx('Monto Comisión Lupay'),
      ivaCom: idx('IVA Comisión Lupay'),
      tasaSob: idx('Sobretasa Lupay'),
      montoSob: idx('Monto Sobretasa Lupay'),
      ivaSob: idx('IVA Sobretasa Lupay'),
      sucursal: idx('Sucursal'),
      producto: idx('Producto'),
      terminal: idx('Terminal'),
      ref: idx('Referencia'),
      email: idx('Email'),
      propina: idx('Propina'),
    };

    for (let rowNum = 2; rowNum <= ws.rowCount; rowNum++) {
      const row = ws.getRow(rowNum);

      const tipo = cellStr(row.getCell(C.tipo)) ?? '';
      if (!tipo) continue;

      const monto = cellNum(row.getCell(C.monto)) ?? 0;
      const fee = cellNum(row.getCell(C.montoCom)) ?? 0;
      const iva = cellNum(row.getCell(C.ivaCom)) ?? 0;

      const isExcluded = tipo.toUpperCase() !== 'PAGO';

      yield {
        // Campos clave
        authorizationNumber: cellStr(row.getCell(C.auth)),
        cardNumber: cellStr(row.getCell(C.tarjeta)),
        amount: monto,
        fee,
        iva,
        importeLupay: Math.round((monto - fee - iva) * 100) / 100,
        cardBrand: parseCardBrand(cellStr(row.getCell(C.marca))),
        tipoPago: cellStr(row.getCell(C.metodo)),
        operationType: tipo,
        transactionDate: parseDate(row.getCell(C.fecha).value),
        afiliacion: cellStr(row.getCell(C.afiliacion)),
        transactionId: cellStr(row.getCell(C.id)),
        reference: cellStr(row.getCell(C.ref)),
        isExcluded,
        exclusionReason: isExcluded ? tipo : null,
        merchantName: cellStr(row.getCell(C.cliente)),

        // Campos preservados del Excel
        adquiriente: cellStr(row.getCell(C.adquiriente)),
        fiid: cellStr(row.getCell(C.fiid)),
        hora: cellStr(row.getCell(C.hora)),
        modoEntrada: cellStr(row.getCell(C.modoEntrada)),
        metodoAutenticacion: cellStr(row.getCell(C.metodoAuth)),
        eci: cellStr(row.getCell(C.eci)),
        tipoTarjeta: cellStr(row.getCell(C.tipoTarj)),
        tasaComision: cellStr(row.getCell(C.tasaCom)),
        tasaSobretasa: cellStr(row.getCell(C.tasaSob)),
        montoSobretasa: cellNum(row.getCell(C.montoSob)),
        ivaSobretasa: cellNum(row.getCell(C.ivaSob)),
        sucursal: cellStr(row.getCell(C.sucursal)),
        producto: cellStr(row.getCell(C.producto)),
        terminalSerial: cellStr(row.getCell(C.terminal)),
        email: cellStr(row.getCell(C.email)),
        propina: cellNum(row.getCell(C.propina)),
      };
    }
  }
}
