import * as ExcelJS from 'exceljs';
import { Readable } from 'stream';

export interface ParsedRow {
  [key: string]: string | number | Date | undefined;
}

export interface XlsxParserOptions {
  sheetName?: string;
  sheetIndex?: number;
  headerRow?: number;
}

export class XlsxParser {
  private options: XlsxParserOptions;

  constructor(options: XlsxParserOptions = {}) {
    this.options = {
      sheetIndex: 0,
      headerRow: 1,
      ...options,
    };
  }

  async *parseStream(stream: Readable): AsyncGenerator<ParsedRow> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.read(stream);

    const worksheet = this.options.sheetName
      ? workbook.getWorksheet(this.options.sheetName)
      : workbook.worksheets[this.options.sheetIndex || 0];

    if (!worksheet) {
      throw new Error('Worksheet not found');
    }

    const headers: string[] = [];
    const headerRow = this.options.headerRow || 1;

    // Extract headers
    worksheet.getRow(headerRow).eachCell((cell, colNumber) => {
      const value = cell.value?.toString().trim();
      if (value) {
        headers[colNumber] = value;
      }
    });

    // Stream rows
    for (let rowNumber = headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      const rowData: ParsedRow = {};

      let hasData = false;
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const header = headers[colNumber];
        if (header) {
          let value: string | number | Date | undefined;

          if (cell.value === null || cell.value === undefined) {
            value = undefined;
          } else if (cell.value instanceof Date) {
            value = cell.value;
          } else if (typeof cell.value === 'object') {
            // Handle rich text or other complex types
            value = cell.text;
          } else {
            value = cell.value;
          }

          if (value !== undefined && value !== '') {
            hasData = true;
          }

          rowData[header] = value;
        }
      });

      if (hasData) {
        yield rowData;
      }
    }
  }

  async parseBuffer(buffer: Buffer): Promise<ParsedRow[]> {
    const records: ParsedRow[] = [];
    const stream = Readable.from(buffer);

    for await (const record of this.parseStream(stream)) {
      records.push(record);
    }

    return records;
  }

  async parseFile(filePath: string): Promise<ParsedRow[]> {
    const fs = await import('fs');
    const stream = fs.createReadStream(filePath);
    const records: ParsedRow[] = [];

    for await (const record of this.parseStream(stream)) {
      records.push(record);
    }

    return records;
  }
}
