import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ClientsService } from '../clients/clients.service';
import { TransactionsService } from '../transactions/transactions.service';
import { SettlementsService } from '../settlements/settlements.service';
import { FileControl, FileType, FileStatus } from '@prisma/client';
import { CsvParser, ParsedRow as CsvRow } from './parsers/csv-parser';
import { XlsxParser, ParsedRow as XlsxRow } from './parsers/xlsx-parser';
import { TransaccionesParser } from './parsers/transacciones-parser';
import { PosreParser } from './parsers/posre-parser';
import { AmexParser } from './parsers/amex-parser';
import { Readable } from 'stream';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export interface ConflictDetail {
  auth: string;
  old: number;
  new: number;
}

interface FileUploadResult {
  fileControl: FileControl;
  recordsProcessed: number;
  recordsInserted: number;
  recordsDuplicated: number;
  recordsConflicts: number;
  conflictsSample: ConflictDetail[];
  autoReconciliation?: {
    matched: number;
    amountMismatch: number;
    notFound: number;
  };
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly uploadPath: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
    private readonly transactionsService: TransactionsService,
    private readonly settlementsService: SettlementsService,
  ) {
    this.uploadPath =
      this.configService.get<string>('UPLOAD_DEST') || './uploads';
    this.ensureUploadDirectory();
  }

  private ensureUploadDirectory() {
    if (!fs.existsSync(this.uploadPath)) {
      fs.mkdirSync(this.uploadPath, { recursive: true });
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    fileType: FileType,
    clientId: any,
    userId: any,
  ): Promise<FileUploadResult> {
    // Validate client exists
    const client = await this.clientsService.findById(BigInt(clientId));
    if (!client) {
      throw new NotFoundException(`Client with ID ${clientId} not found`);
    }

    const fileExtension = path.extname(file.originalname).toLowerCase();
    const fileName = `${uuidv4()}${fileExtension}`;
    const filePath = path.join(this.uploadPath, fileName);

    // Nota: la deduplicación se hace por registro (no por archivo).
    // Registros ya existentes se detectan y reportan como duplicados o conflictos.

    await this.saveFile(file, filePath);

    const fileControl = await this.prisma.fileControl.create({
      data: {
        originalName: file.originalname,
        fileName,
        fileType,
        filePath,
        fileSize: file.size,
        status: FileStatus.PENDING,
        uploadedBy: userId,
      },
    });

    this.logger.log(
      `File uploaded: ${file.originalname} (${fileType}) for client ${clientId}`,
    );

    const recordsProcessed = await this.processFile(
      fileControl,
      BigInt(clientId),
      fileExtension,
    );

    const autoReconciliation = (fileControl as any).__autoRecon;
    const stats = (fileControl as any).__processStats ?? {
      inserted: recordsProcessed,
      duplicates: 0,
      conflicts: [],
    };

    return {
      fileControl,
      recordsProcessed,
      recordsInserted: stats.inserted,
      recordsDuplicated: stats.duplicates,
      recordsConflicts: stats.conflicts.length,
      conflictsSample: stats.conflicts.slice(0, 10),
      autoReconciliation,
    };
  }

  private async saveFile(
    file: Express.Multer.File,
    filePath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath);
      const readStream = Readable.from(file.buffer);
      readStream.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
  }

  private async processFile(
    fileControl: FileControl,
    clientId: bigint,
    fileExtension: string,
  ): Promise<number> {
    try {
      await this.prisma.fileControl.update({
        where: { id: fileControl.id },
        data: { status: FileStatus.PROCESSING },
      });

      let recordsProcessed = 0;

      const isXlsx = ['.xlsx', '.xls'].includes(fileExtension);

      if (
        isXlsx &&
        (fileControl.fileType === FileType.TRANSACTIONS ||
          fileControl.fileType === FileType.AMEX)
      ) {
        recordsProcessed = await this.processTransaccionesOrAmex(
          fileControl,
          clientId,
        );
        await this.excludeOriginalPaymentsForCancellations(fileControl.id);
      } else if (isXlsx && fileControl.fileType === FileType.SETTLEMENTS) {
        recordsProcessed = await this.processPosre(fileControl, clientId);
      } else if (fileExtension === '.csv') {
        recordsProcessed = await this.processCsvFile(fileControl, clientId);
      } else if (isXlsx) {
        recordsProcessed = await this.processXlsxFile(fileControl, clientId);
      } else {
        throw new BadRequestException(
          `Unsupported file format: ${fileExtension}`,
        );
      }

      await this.prisma.fileControl.update({
        where: { id: fileControl.id },
        data: {
          status: FileStatus.COMPLETED,
          processedCount: recordsProcessed,
          processedAt: new Date(),
        },
      });

      this.logger.log(
        `File processed: ${fileControl.originalName} (${recordsProcessed} records)`,
      );

      // Auto-conciliación: ejecutar al cargar Transacciones O POSRE.
      // AMEX no entra (no concilia contra POSRE).
      let autoRecon = { matched: 0, amountMismatch: 0, notFound: 0 };
      if (
        fileControl.fileType === FileType.TRANSACTIONS ||
        fileControl.fileType === FileType.SETTLEMENTS
      ) {
        try {
          autoRecon = await this.runAutoReconciliation();
        } catch (e: any) {
          this.logger.warn(`Auto-reconciliacion error: ${e.message}`);
        }
      }

      // Guardamos el resultado en el fileControl para devolverlo desde
      // el método que llamó a processFile.
      (fileControl as any).__autoRecon = autoRecon;

      return recordsProcessed;
    } catch (error) {
      this.logger.error(
        `Error processing file ${fileControl.originalName}: ${error.message}`,
        error.stack,
      );
      await this.prisma.fileControl.update({
        where: { id: fileControl.id },
        data: { status: FileStatus.ERROR, errorMessage: error.message },
      });
      throw error;
    }
  }

  private async processTransaccionesOrAmex(
    fileControl: FileControl,
    clientId: bigint,
  ): Promise<number> {
    const isAmex = fileControl.fileType === FileType.AMEX;
    const parser = isAmex ? new AmexParser() : new TransaccionesParser();

    let inserted = 0;
    let duplicates = 0;
    const conflicts: ConflictDetail[] = [];

    for await (const row of parser.parse(fileControl.filePath)) {
      let resolvedClientId = clientId;
      if (row.afiliacion) {
        const clientByAfil = await this.clientsService.findByAfiliacion(
          row.afiliacion,
        );
        if (clientByAfil) resolvedClientId = clientByAfil.id;
      }

      const result = await this.transactionsService.createFromTransaccionRow(
        row,
        fileControl.id,
        resolvedClientId,
      );

      if (result.kind === 'created') inserted++;
      else if (result.kind === 'duplicate') duplicates++;
      else if (result.kind === 'conflict') {
        conflicts.push({
          auth: result.auth,
          old: result.existingAmount,
          new: result.newAmount,
        });
      }

      const total = inserted + duplicates + conflicts.length;
      if (total % 100 === 0) {
        await this.prisma.fileControl.update({
          where: { id: fileControl.id },
          data: { processedCount: total },
        });
      }
    }

    // Guardar stats para que uploadFile las devuelva
    (fileControl as any).__processStats = { inserted, duplicates, conflicts };
    await this.prisma.fileControl.update({
      where: { id: fileControl.id },
      data: {
        insertedCount: inserted,
        duplicateCount: duplicates,
        conflictCount: conflicts.length,
      },
    });

    return inserted + duplicates + conflicts.length;
  }

  private async processPosre(
    fileControl: FileControl,
    clientId: bigint,
  ): Promise<number> {
    const parser = new PosreParser();
    let inserted = 0;
    let duplicates = 0;
    const conflicts: ConflictDetail[] = [];

    for await (const row of parser.parse(fileControl.filePath)) {
      let resolvedClientId = clientId;
      if (row.afiliacion) {
        const clientByAfil = await this.clientsService.findByAfiliacion(
          row.afiliacion,
        );
        if (clientByAfil) resolvedClientId = clientByAfil.id;
      }

      const result = await this.settlementsService.createFromPosreRow(
        row,
        fileControl.id,
        resolvedClientId,
      );

      if (result.kind === 'created') inserted++;
      else if (result.kind === 'duplicate') duplicates++;
      else if (result.kind === 'conflict') {
        conflicts.push({
          auth: result.auth,
          old: result.existingAmount,
          new: result.newAmount,
        });
      }

      const total = inserted + duplicates + conflicts.length;
      if (total % 100 === 0) {
        await this.prisma.fileControl.update({
          where: { id: fileControl.id },
          data: { processedCount: total },
        });
      }
    }

    (fileControl as any).__processStats = { inserted, duplicates, conflicts };
    await this.prisma.fileControl.update({
      where: { id: fileControl.id },
      data: {
        insertedCount: inserted,
        duplicateCount: duplicates,
        conflictCount: conflicts.length,
      },
    });

    return inserted + duplicates + conflicts.length;
  }

  // Auto-conciliación con estrategia auth + tarjeta + monto.
  // Se ejecuta al cargar Transacciones o POSRE para que el cruce sea inmediato.
  private async runAutoReconciliation(): Promise<{
    matched: number;
    amountMismatch: number;
    notFound: number;
  }> {
    const pending = await this.prisma.transaction.findMany({
      where: {
        isExcluded: false,
        reconciliations: { none: {} },
      },
      select: {
        id: true,
        authorizationNumber: true,
        amount: true,
        cardNumber: true,
      },
    });

    if (pending.length === 0) {
      return { matched: 0, amountMismatch: 0, notFound: 0 };
    }

    const TOLERANCE = 0.01;
    const last4 = (v?: string | null) =>
      (v || '').replace(/\D/g, '').slice(-4);

    let matched = 0;
    let amountMismatch = 0;

    for (const tx of pending) {
      if (!tx.authorizationNumber) continue;

      const candidates = await this.prisma.settlement.findMany({
        where: {
          authorizationNumber: tx.authorizationNumber,
          reconciliations: { none: {} },
        },
      });

      if (candidates.length === 0) continue;

      // Filtrar por tarjeta (últimos 4) — descarta colisiones de auth
      const txCard = last4(tx.cardNumber);
      const sameCardMatches = candidates.filter((s) => {
        const sCard = last4(s.reference);
        return txCard && sCard && txCard === sCard;
      });

      if (sameCardMatches.length === 0) continue;

      const exact = sameCardMatches.find(
        (s) => Math.abs(tx.amount - s.amount) <= TOLERANCE,
      );

      if (exact) {
        await this.prisma.reconciliation.create({
          data: {
            transactionId: tx.id,
            settlementId: exact.id,
            priorityUsed: 'AUTHORIZATION_NUMBER',
            status: 'MATCHED',
          },
        });
        matched++;
      } else {
        const s = sameCardMatches[0];
        await this.prisma.reconciliation.create({
          data: {
            transactionId: tx.id,
            settlementId: s.id,
            priorityUsed: 'AUTHORIZATION_NUMBER',
            status: 'AMOUNT_MISMATCH',
            amountDifference: Math.abs(tx.amount - s.amount),
          },
        });
        amountMismatch++;
      }
    }

    const notFound = pending.length - matched - amountMismatch;
    this.logger.log(
      `Auto-conciliacion: ${matched} matched, ${amountMismatch} con diferencia, ${notFound} sin match (de ${pending.length} pendientes)`,
    );

    return { matched, amountMismatch, notFound };
  }

  // ── Métodos legacy para CSV y XLSX genérico ─────────────────────────────

  private async processCsvFile(
    fileControl: FileControl,
    clientId: bigint,
  ): Promise<number> {
    const parser = new CsvParser({ delimiter: ',', trim: true });
    const stream = fs.createReadStream(fileControl.filePath);
    let count = 0;

    for await (const row of parser.parseStream(stream)) {
      await this.processRow(row, fileControl, clientId);
      count++;
      if (count % 100 === 0) {
        await this.prisma.fileControl.update({
          where: { id: fileControl.id },
          data: { processedCount: count },
        });
      }
    }

    return count;
  }

  private async processXlsxFile(
    fileControl: FileControl,
    clientId: bigint,
  ): Promise<number> {
    const parser = new XlsxParser();
    const stream = fs.createReadStream(fileControl.filePath);
    let count = 0;

    for await (const row of parser.parseStream(stream)) {
      await this.processRow(row as CsvRow, fileControl, clientId);
      count++;
      if (count % 100 === 0) {
        await this.prisma.fileControl.update({
          where: { id: fileControl.id },
          data: { processedCount: count },
        });
      }
    }

    return count;
  }

  private async processRow(
    row: CsvRow | XlsxRow,
    fileControl: FileControl,
    clientId: bigint,
  ): Promise<void> {
    if (fileControl.fileType === FileType.TRANSACTIONS) {
      await this.transactionsService.createFromRow(
        row as any,
        fileControl.id,
        clientId,
      );
    } else if (fileControl.fileType === FileType.SETTLEMENTS) {
      await this.settlementsService.createFromRow(
        row as any,
        fileControl.id,
        clientId,
      );
    }
  }

  async findAll(params: {
    skip?: number;
    take?: number;
    where?: any;
  }): Promise<FileControl[]> {
    const { skip, take, where } = params;
    return this.prisma.fileControl.findMany({
      skip,
      take,
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        uploader: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async countAll(where?: any): Promise<number> {
    return this.prisma.fileControl.count({ where });
  }

  async findById(id: any): Promise<FileControl | null> {
    return this.prisma.fileControl.findUnique({
      where: { id },
      include: {
        uploader: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        _count: {
          select: { transactions: true, settlements: true },
        },
      },
    });
  }

  private async excludeOriginalPaymentsForCancellations(fileId: bigint): Promise<number> {
    const cancellations = await this.prisma.transaction.findMany({
      where: {
        fileId,
        isExcluded: true,
        operationType: {
          in: ['CANCELACION', 'DEVOLUCION', 'CANCELACIÓN', 'DEVOLUCIÓN', 'REVERSO', 'REVERSO_AMEX'],
        },
      },
      select: {
        authorizationNumber: true,
        transactionId: true,
      },
    });

    let excludedCount = 0;

    for (const canc of cancellations) {
      if (!canc.authorizationNumber) continue;

      const updateResult = await this.prisma.transaction.updateMany({
        where: {
          transactionId: canc.authorizationNumber,
          operationType: {
            startsWith: 'PAGO',
            mode: 'insensitive',
          },
          isExcluded: false,
        },
        data: {
          status: 'CANCELLED',
          isExcluded: true,
          exclusionReason: `Pago original cancelado por transacción ${canc.transactionId}`,
        },
      });

      excludedCount += updateResult.count;
    }

    if (excludedCount > 0) {
      this.logger.log(
        `[Cancelaciones] Se marcaron ${excludedCount} pagos originales como CANCELLED y excluidos debido a cancelaciones en el archivo.`,
      );
    }

    return excludedCount;
  }
}
