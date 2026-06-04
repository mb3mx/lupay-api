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

interface FileUploadResult {
  fileControl: FileControl;
  recordsProcessed: number;
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

    // Idempotencia: si el mismo archivo (nombre + tipo) ya fue cargado,
    // eliminar sus datos previos para reemplazarlos y evitar duplicados.
    await this.removeExistingFileData(file.originalname, fileType);

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

    return { fileControl, recordsProcessed };
  }

  // Elimina datos de cargas previas del mismo archivo (idempotencia)
  private async removeExistingFileData(
    originalName: string,
    fileType: FileType,
  ): Promise<void> {
    const prevFiles = await this.prisma.fileControl.findMany({
      where: { originalName, fileType },
      select: { id: true },
    });
    if (prevFiles.length === 0) return;

    const fileIds = prevFiles.map((f) => f.id);

    // Borrar reconciliations ligadas a transacciones/settlements de esos archivos
    await this.prisma.reconciliation.deleteMany({
      where: {
        OR: [
          { transaction: { fileId: { in: fileIds } } },
          { settlement: { fileId: { in: fileIds } } },
        ],
      },
    });

    // Borrar items de liquidación/payout que referencien esas transacciones
    await this.prisma.liquidacionItem.deleteMany({
      where: { client: { transactions: { some: { fileId: { in: fileIds } } } } },
    }).catch(() => undefined);
    await this.prisma.payoutItem.deleteMany({
      where: { transaction: { fileId: { in: fileIds } } },
    }).catch(() => undefined);

    // Borrar settlements y transacciones de esos archivos
    await this.prisma.settlement.deleteMany({ where: { fileId: { in: fileIds } } });
    await this.prisma.transaction.deleteMany({ where: { fileId: { in: fileIds } } });

    // Borrar los registros de control de archivo
    await this.prisma.fileControl.deleteMany({ where: { id: { in: fileIds } } });

    this.logger.log(
      `Reemplazando carga previa de "${originalName}" (${fileType}): ${fileIds.length} archivo(s) eliminado(s)`,
    );
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

      // Re-intentar conciliación de PEND al cargar nuevo POSRE
      if (fileControl.fileType === FileType.SETTLEMENTS) {
        this.retryPendingReconciliations(clientId).catch((e) =>
          this.logger.warn(`PEND retry error: ${e.message}`),
        );
      }

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

    let count = 0;

    for await (const row of parser.parse(fileControl.filePath)) {
      // Auto-detectar clientId por afiliación si está disponible
      let resolvedClientId = clientId;
      if (row.afiliacion) {
        const clientByAfil = await this.clientsService.findByAfiliacion(
          row.afiliacion,
        );
        if (clientByAfil) resolvedClientId = clientByAfil.id;
      }

      await this.transactionsService.createFromTransaccionRow(
        row,
        fileControl.id,
        resolvedClientId,
      );
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

  private async processPosre(
    fileControl: FileControl,
    clientId: bigint,
  ): Promise<number> {
    const parser = new PosreParser();
    let count = 0;

    for await (const row of parser.parse(fileControl.filePath)) {
      // Auto-detectar clientId por afiliación
      let resolvedClientId = clientId;
      if (row.afiliacion) {
        const clientByAfil = await this.clientsService.findByAfiliacion(
          row.afiliacion,
        );
        if (clientByAfil) resolvedClientId = clientByAfil.id;
      }

      await this.settlementsService.createFromPosreRow(
        row,
        fileControl.id,
        resolvedClientId,
      );
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

  // Re-intentar conciliación de transacciones PEND al llegar POSRE nuevo
  private async retryPendingReconciliations(clientId: bigint): Promise<void> {
    const pending = await this.prisma.transaction.findMany({
      where: {
        clientId,
        isExcluded: false,
        reconciliations: { none: {} },
      },
      select: { id: true, authorizationNumber: true, amount: true },
      take: 500,
    });

    if (pending.length === 0) return;
    this.logger.log(`Reintentando conciliación de ${pending.length} PEND...`);

    let retried = 0;
    for (const tx of pending) {
      if (!tx.authorizationNumber) continue;
      const settlement = await this.prisma.settlement.findFirst({
        where: {
          authorizationNumber: tx.authorizationNumber,
          clientId,
          reconciliations: { none: {} },
        },
      });
      if (settlement) {
        await this.prisma.reconciliation.create({
          data: {
            transactionId: tx.id,
            settlementId: settlement.id,
            priorityUsed: 'AUTHORIZATION_NUMBER',
            status: 'MATCHED',
          },
        });
        retried++;
      }
    }

    this.logger.log(`PEND reintento: ${retried} nuevas conciliaciones`);
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
}
