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
import { NotificationsService } from '../notifications/notifications.service';
import { FileControl, FileType, FileStatus } from '@prisma/client';
import { CsvParser, ParsedRow as CsvRow } from './parsers/csv-parser';
import { XlsxParser, ParsedRow as XlsxRow } from './parsers/xlsx-parser';
import { TransaccionesParser } from './parsers/transacciones-parser';
import { PosreParser } from './parsers/posre-parser';
import { AmexParser } from './parsers/amex-parser';
import { AmexSettlementParser } from './parsers/amex-settlement-parser';
import { Readable } from 'stream';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { ResolveImportDto } from './dto/resolve-import.dto';

export interface ConflictDetail {
  auth: string;
  old: number;
  new: number;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly uploadPath: string;
  private readonly saveFiles: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
    private readonly transactionsService: TransactionsService,
    private readonly settlementsService: SettlementsService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.uploadPath =
      this.configService.get<string>('UPLOAD_DEST') || './uploads';
    this.saveFiles =
      this.configService.get<string>('SAVE_UPLOADED_FILES') !== 'false';
    if (this.saveFiles) this.ensureUploadDirectory();
  }

  private ensureUploadDirectory() {
    if (!fs.existsSync(this.uploadPath)) {
      fs.mkdirSync(this.uploadPath, { recursive: true });
    }
  }

  /**
   * Guarda el archivo y crea el registro FileControl, luego lanza el
   * procesamiento en background (sin await). La respuesta vuelve de inmediato
   * con status PROCESSING; al terminar se emite una notificación (campanita).
   */
  async uploadFile(
    file: Express.Multer.File,
    fileType: FileType,
    clientId: any,
    userId: any,
  ): Promise<FileControl> {
    // Validate client exists
    const client = await this.clientsService.findById(BigInt(clientId));
    if (!client) {
      throw new NotFoundException(`Client with ID ${clientId} not found`);
    }

    const fileExtension = path.extname(file.originalname).toLowerCase();
    const fileName = `${uuidv4()}${fileExtension}`;
    const filePath = this.saveFiles
      ? path.join(this.uploadPath, fileName)
      : '';

    if (this.saveFiles) await this.saveFile(file, filePath);

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

    // Procesamiento en background (fire-and-forget). No bloquea la respuesta.
    void this.processInBackground(
      fileControl,
      BigInt(clientId),
      fileExtension,
      userId,
      this.saveFiles ? undefined : file.buffer,
    );

    return fileControl;
  }

  /**
   * Ejecuta el procesamiento completo de un archivo fuera del ciclo de la
   * petición HTTP, persiste el detalle del resultado en FileControl.resultDetails
   * y emite la notificación a la campanita del usuario al finalizar
   * (tanto en éxito como en error).
   */
  private async processInBackground(
    fileControl: FileControl,
    clientId: bigint,
    fileExtension: string,
    userId: any,
    buffer?: Buffer,
  ): Promise<void> {
    try {
      const recordsProcessed = await this.processFile(
        fileControl,
        clientId,
        fileExtension,
        buffer,
      );

      const autoReconciliation = (fileControl as any).__autoRecon ?? null;
      const stats = (fileControl as any).__processStats ?? {
        inserted: recordsProcessed,
        duplicates: 0,
        conflicts: [],
      };

      const resultDetails = {
        recordsProcessed,
        recordsInserted: stats.inserted,
        recordsDuplicated: stats.duplicates,
        recordsConflicts: stats.conflicts.length,
        conflictsSample: stats.conflicts.slice(0, 10),
        autoReconciliation,
      };

      const updated = await this.prisma.fileControl.update({
        where: { id: fileControl.id },
        data: { resultDetails },
      });

      this.notificationsService.emit(
        userId,
        NotificationsService.toNotification(updated),
      );
    } catch (error: any) {
      // processFile ya marcó el FileControl como ERROR con errorMessage.
      this.logger.error(
        `Background processing failed for ${fileControl.originalName}: ${error.message}`,
      );
      const errored = await this.prisma.fileControl.findUnique({
        where: { id: fileControl.id },
      });
      if (errored) {
        this.notificationsService.emit(
          userId,
          NotificationsService.toNotification(errored),
        );
      }
    }
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
    buffer?: Buffer,
  ): Promise<number> {
    try {
      await this.prisma.fileControl.update({
        where: { id: fileControl.id },
        data: { status: FileStatus.PROCESSING },
      });

      let recordsProcessed = 0;

      // source: buffer en memoria (SAVE_UPLOADED_FILES=false) o ruta en disco
      const source: string | Buffer = buffer ?? fileControl.filePath;
      const isXlsx = ['.xlsx', '.xls'].includes(fileExtension);

      if (
        isXlsx &&
        fileControl.fileType === FileType.TRANSACTIONS
      ) {
        recordsProcessed = await this.processTransaccionesOrAmex(
          fileControl,
          clientId,
          source,
        );
        await this.excludeOriginalPaymentsForCancellations(fileControl.id);
      } else if (
        isXlsx &&
        (fileControl.fileType === FileType.SETTLEMENTS ||
          fileControl.fileType === FileType.AMEX)
      ) {
        recordsProcessed = await this.processPosreOrAmexSettlement(fileControl, clientId, source);
        await this.excludeOriginalSettlementsForReversos(fileControl.id);
      } else if (fileExtension === '.csv') {
        recordsProcessed = await this.processCsvFile(fileControl, clientId, source);
      } else if (isXlsx) {
        recordsProcessed = await this.processXlsxFile(fileControl, clientId, source);
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

      // Auto-conciliación: ejecutar al cargar Transacciones, POSRE o AMEX.
      let autoRecon = { matched: 0, amountMismatch: 0, notFound: 0 };
      if (
        fileControl.fileType === FileType.TRANSACTIONS ||
        fileControl.fileType === FileType.SETTLEMENTS ||
        fileControl.fileType === FileType.AMEX
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
      // Log técnico completo para diagnóstico…
      this.logger.error(
        `Error processing file ${fileControl.originalName}: ${error.message}`,
        error.stack,
      );
      // …pero al usuario le mostramos un mensaje claro y entendible.
      const friendly = this.friendlyError(error?.message, fileControl.fileType);
      await this.prisma.fileControl.update({
        where: { id: fileControl.id },
        data: { status: FileStatus.ERROR, errorMessage: friendly },
      });
      throw error;
    }
  }

  /**
   * Traduce errores técnicos del parseo (columnas faltantes, hoja inexistente,
   * archivo dañado, etc.) a un mensaje claro para el usuario. El error técnico
   * original queda en los logs.
   */
  private friendlyError(rawMessage: string | undefined, fileType: FileType): string {
    const label =
      fileType === FileType.TRANSACTIONS
        ? 'Transacciones (EfevooPay)'
        : fileType === FileType.SETTLEMENTS
          ? 'POSRE'
          : 'AMEX';

    const m = (rawMessage || '').toLowerCase();
    const looksLikeTemplateMismatch =
      m.includes('out of bounds') ||
      m.includes('excel supports columns') ||
      m.includes('column') ||
      m.includes('worksheet') ||
      m.includes('sheet') ||
      m.includes('header') ||
      m.includes('encabezado') ||
      m.includes('cannot read') ||
      m.includes('undefined') ||
      m.includes('null');

    if (looksLikeTemplateMismatch) {
      return (
        `El archivo no coincide con la plantilla esperada de ${label}. ` +
        `Verifica que estés cargando el archivo correcto en la sección correcta ` +
        `y que conserve el formato original (encabezados y columnas).`
      );
    }

    return (
      `No se pudo procesar el archivo de ${label}. ` +
      `Revisa que no esté dañado y que corresponda a la plantilla esperada.`
    );
  }

  private async processTransaccionesOrAmex(
    fileControl: FileControl,
    clientId: bigint,
    source: string | Buffer,
  ): Promise<number> {
    const isAmex = fileControl.fileType === FileType.AMEX;
    const parser = isAmex ? new AmexParser() : new TransaccionesParser();

    let inserted = 0;
    let duplicates = 0;
    const conflicts: ConflictDetail[] = [];

    for await (const row of parser.parse(source)) {
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

  private async processPosreOrAmexSettlement(
    fileControl: FileControl,
    clientId: bigint,
    source: string | Buffer,
  ): Promise<number> {
    const isAmex = fileControl.fileType === FileType.AMEX;
    const parser = isAmex ? new AmexSettlementParser() : new PosreParser();
    let inserted = 0;
    let duplicates = 0;
    // POSRE/AMEX ya no produce conflictos: cuando la identidad logica coincide pero
    // el monto difiere (reverso), el settlement se inserta como adicional.
    // Mantenemos el array vacio para preservar el shape de __processStats y la
    // estadistica conflictCount=0 en file_control.
    const conflicts: ConflictDetail[] = [];

    for await (const row of parser.parse(source)) {
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

      const total = inserted + duplicates;
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
        conflictCount: 0,
      },
    });

    return inserted + duplicates;
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
    source: string | Buffer,
  ): Promise<number> {
    const parser = new CsvParser({ delimiter: ',', trim: true });
    const stream = Buffer.isBuffer(source)
      ? Readable.from(source)
      : fs.createReadStream(source);
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
    source: string | Buffer,
  ): Promise<number> {
    const parser = new XlsxParser();
    const stream = Buffer.isBuffer(source)
      ? Readable.from(source)
      : fs.createReadStream(source);
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

  /**
   * Exclusión simétrica en POSRE: cuando llega un reverso (settlement con monto
   * negativo => status CANCELLED), marca también la liquidación original (+X)
   * con la misma identidad (auth + tarjeta + afiliación) y monto equivalente
   * como CANCELLED, para que el par pago/reverso netee a $0 y no quede como
   * POSRE activo pendiente. Es el equivalente POSRE de
   * excludeOriginalPaymentsForCancellations (lado Transacciones).
   *
   * Se buscan los originales en TODOS los settlements (no solo este archivo),
   * por si el pago original se cargó en una carga previa.
   */
  private async excludeOriginalSettlementsForReversos(
    fileId: bigint,
  ): Promise<number> {
    const reversos = await this.prisma.settlement.findMany({
      where: { fileId, status: 'CANCELLED', amount: { lt: 0 } },
      select: {
        authorizationNumber: true,
        reference: true,
        afiliacion: true,
        amount: true,
      },
    });

    let excludedCount = 0;

    for (const rev of reversos) {
      if (!rev.authorizationNumber) continue;
      const target = Math.abs(rev.amount); // monto del pago original (+X)

      const updateResult = await this.prisma.settlement.updateMany({
        where: {
          authorizationNumber: rev.authorizationNumber,
          reference: rev.reference ?? undefined,
          afiliacion: rev.afiliacion ?? undefined,
          status: 'ACTIVE',
          amount: { gte: target - 0.01, lte: target + 0.01 },
        },
        data: { status: 'CANCELLED' },
      });

      excludedCount += updateResult.count;
    }

    if (excludedCount > 0) {
      this.logger.log(
        `[POSRE] Se marcaron ${excludedCount} liquidaciones originales como CANCELLED debido a reversos en el archivo.`,
      );
    }

    return excludedCount;
  }

  async validateFile(
    file: Express.Multer.File,
    fileType: FileType,
  ): Promise<{ tempFileId: string; ready: boolean; issues: any }> {
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const tempFileId = `${uuidv4()}${fileExtension}`;
    const tempDir = path.join(this.uploadPath, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFilePath = path.join(tempDir, tempFileId);
    await this.saveFile(file, tempFilePath);

    // Si no es transacciones, no validamos el catálogo de clientes
    if (fileType !== FileType.TRANSACTIONS) {
      return { tempFileId, ready: true, issues: { updateEmails: [], updateNames: [], newClients: [] } };
    }

    const isXlsx = ['.xlsx', '.xls'].includes(fileExtension);
    if (!isXlsx) {
      return { tempFileId, ready: true, issues: { updateEmails: [], updateNames: [], newClients: [] } };
    }

    const parser = new TransaccionesParser();
    const comerciosUnicos = new Map<string, { nombre: string; email: string; terminal: string }>();

    for await (const row of parser.parse(tempFilePath)) {
      if (!row.merchantName || !row.email) continue;
      const nombre = row.merchantName.trim().toUpperCase();
      const email = row.email.trim().toLowerCase();
      if (!nombre || !email) continue;

      const key = `${nombre}::${email}`;
      if (!comerciosUnicos.has(key)) {
        comerciosUnicos.set(key, { nombre, email, terminal: row.terminalSerial || '' });
      }
    }

    const listadoComercios = Array.from(comerciosUnicos.values());
    if (listadoComercios.length === 0) {
      return { tempFileId, ready: true, issues: { updateEmails: [], updateNames: [], newClients: [] } };
    }

    const nombresArchivo = listadoComercios.map(c => c.nombre);
    const correosArchivo = listadoComercios.map(c => c.email);

    // Consulta en lote
    const clientesDB = await this.prisma.client.findMany({
      where: {
        OR: [
          { name: { in: nombresArchivo } },
          { activationEmail: { in: correosArchivo } }
        ]
      }
    });

    const updateEmails: any[] = [];
    const updateNames: any[] = [];
    const newClients: any[] = [];

    for (const item of listadoComercios) {
      // 1. Buscar por el email del archivo en la base de datos
      const emailMatch = clientesDB.find(
        c => c.activationEmail?.toLowerCase().trim() === item.email
      );

      if (emailMatch) {
        // Si existe y el nombre es diferente, actualizar nombre
        if (emailMatch.name.toLowerCase().trim() !== item.nombre.toLowerCase().trim()) {
          updateNames.push({
            clientId: emailMatch.id.toString(),
            email: emailMatch.activationEmail,
            currentName: emailMatch.name,
            newName: item.nombre
          });
        }
        continue; // Cliente ya ubicado por email
      }

      // 2. Si no existe el email, buscar por nombre del archivo en la base de datos
      const nameMatch = clientesDB.find(
        c => c.name.toLowerCase().trim() === item.nombre.toLowerCase().trim()
      );

      if (nameMatch) {
        // Si existe y el email es diferente, actualizar email
        if (nameMatch.activationEmail?.toLowerCase().trim() !== item.email) {
          updateEmails.push({
            clientId: nameMatch.id.toString(),
            name: nameMatch.name,
            currentEmail: nameMatch.activationEmail || '',
            newEmail: item.email,
            terminal: item.terminal || ''
          });
        }
        continue; // Cliente ya ubicado por nombre comercial
      }

      // 3. No existe ni email ni nombre (Cliente nuevo)
      newClients.push({
        name: item.nombre,
        email: item.email,
        terminal: item.terminal
      });
    }

    const ready = updateEmails.length === 0 && updateNames.length === 0 && newClients.length === 0;

    return {
      tempFileId,
      ready,
      issues: {
        updateEmails,
        updateNames,
        newClients
      }
    };
  }

  async importValidatedFile(
    dto: ResolveImportDto,
    userId: any,
  ): Promise<FileControl> {
    const { tempFileId, originalName, fileType, clientId, resolvedIssues } = dto;

    // 1. Aplicar resoluciones en una transacción de base de datos
    await this.prisma.$transaction(async (tx) => {
      // Actualizar correos y nombres
      if (resolvedIssues?.updates && resolvedIssues.updates.length > 0) {
        for (const update of resolvedIssues.updates) {
          const uId = BigInt(update.clientId);
          const dataToUpdate: any = {};
          if (update.field === 'activationEmail') {
            dataToUpdate.activationEmail = update.value.trim();
            dataToUpdate.terminal = update.terminal && update.terminal.trim() ? update.terminal.trim() : null;
          } else if (update.field === 'name') {
            dataToUpdate.name = update.value.trim();
          }
          await tx.client.update({
            where: { id: uId },
            data: dataToUpdate,
          });
        }
      }

      // Crear nuevos clientes
      if (resolvedIssues?.newClients && resolvedIssues.newClients.length > 0) {
        for (const newCli of resolvedIssues.newClients) {
          await tx.client.create({
            data: {
              code: newCli.code.trim(),
              name: newCli.name.trim(),
              businessName: newCli.name.trim(),
              taxId: (newCli.taxId && newCli.taxId.trim()) ? newCli.taxId.trim() : null,
              contactEmail: newCli.email.trim().toLowerCase(),
              activationEmail: newCli.activationEmail.trim().toLowerCase(),
              terminal: newCli.terminal && newCli.terminal.trim() ? newCli.terminal.trim() : null,
              reintegroTime: newCli.reintegroTime || null,
              commissionTotal: Number(newCli.commissionTotal) || 0,
              liquidadoraId: newCli.liquidadoraId ? BigInt(newCli.liquidadoraId) : undefined,
              sindicatoId: newCli.sindicatoId ? BigInt(newCli.sindicatoId) : undefined,
            },
          });
        }
      }
    });

    // 2. Mover el archivo de la carpeta temporal a la carpeta de uploads definitiva
    const tempDir = path.join(this.uploadPath, 'temp');
    const tempFilePath = path.join(tempDir, tempFileId);
    
    if (!fs.existsSync(tempFilePath)) {
      throw new BadRequestException('El archivo temporal no existe o ya fue procesado.');
    }

    const fileExtension = path.extname(tempFileId).toLowerCase();
    const finalFileName = `${uuidv4()}${fileExtension}`;
    const finalFilePath = path.join(this.uploadPath, finalFileName);

    // Mover archivo
    fs.renameSync(tempFilePath, finalFilePath);

    // 3. Crear FileControl e iniciar procesamiento en background
    const fileControl = await this.prisma.fileControl.create({
      data: {
        originalName: originalName || `import_${tempFileId}`,
        fileName: finalFileName,
        fileType,
        filePath: finalFilePath,
        fileSize: fs.statSync(finalFilePath).size,
        status: FileStatus.PENDING,
        uploadedBy: userId,
      },
    });

    this.logger.log(
      `File imported from temp ${tempFileId} to final ${finalFileName} for client ${clientId}`,
    );

    // Lanzar procesamiento en background
    void this.processInBackground(
      fileControl,
      BigInt(clientId),
      fileExtension,
      userId,
    );

    return fileControl;
  }
}
