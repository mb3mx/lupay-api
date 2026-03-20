import { Readable } from 'stream';
import * as csv from 'csv-parse';

export interface ParsedRow {
  [key: string]: string | undefined;
}

export interface CsvParserOptions {
  delimiter?: string;
  encoding?: BufferEncoding;
  skipEmptyLines?: boolean;
  trim?: boolean;
  columns?: boolean | string[];
}

export class CsvParser {
  private options: CsvParserOptions;

  constructor(options: CsvParserOptions = {}) {
    this.options = {
      delimiter: ',',
      encoding: 'utf8',
      skipEmptyLines: true,
      trim: true,
      columns: true,
      ...options,
    };
  }

  async *parseStream(stream: Readable): AsyncGenerator<ParsedRow> {
    const parser = stream.pipe(
      csv.parse({
        delimiter: this.options.delimiter,
        encoding: this.options.encoding,
        skip_empty_lines: this.options.skipEmptyLines,
        trim: this.options.trim,
        columns: this.options.columns,
      }),
    );

    for await (const record of parser) {
      yield record as ParsedRow;
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
