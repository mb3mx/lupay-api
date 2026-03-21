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
import { FileControl, FileType, FileStatus, CardBrand } from '@prisma/client';
import { CsvParser, ParsedRow as CsvRow } from './parsers/csv-parser';
import { XlsxParser, ParsedRow as XlsxRow } from './parsers/xlsx-parser';
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
    clientId: string,
    userId: string,
  ): Promise<FileUploadResult> {
    // Validate client exists
    const client = await this.clientsService.findById(clientId);
    if (!client) {
      throw new NotFoundException(`Client with ID ${clientId} not found`);
    }

    // Generate unique filename
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const fileName = `${uuidv4()}${fileExtension}`;
    const filePath = path.join(this.uploadPath, fileName);

    // Save file to disk
    await this.saveFile(file, filePath);

    // Create file control record
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

    // Process file asynchronously
    const recordsProcessed = await this.processFile(
      fileControl,
      clientId,
      fileExtension,
    );

    return {
      fileControl,
      recordsProcessed,
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
    clientId: string,
    fileExtension: string,
  ): Promise<number> {
    try {
      await this.prisma.fileControl.update({
        where: { id: fileControl.id },
        data: { status: FileStatus.PROCESSING },
      });

      let recordsProcessed = 0;

      if (fileExtension === '.csv') {
        recordsProcessed = await this.processCsvFile(fileControl, clientId);
      } else if (['.xlsx', '.xls'].includes(fileExtension)) {
        recordsProcessed = await this.processXlsxFile(fileControl, clientId);
      } else {
        throw new BadRequestException(`Unsupported file format: ${fileExtension}`);
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
        `File processed successfully: ${fileControl.originalName} (${recordsProcessed} records)`,
      );

      return recordsProcessed;
    } catch (error) {
      this.logger.error(
        `Error processing file ${fileControl.originalName}: ${error.message}`,
        error.stack,
      );

      await this.prisma.fileControl.update({
        where: { id: fileControl.id },
        data: {
          status: FileStatus.ERROR,
          errorMessage: error.message,
        },
      });

      throw error;
    }
  }

  private async processCsvFile(
    fileControl: FileControl,
    clientId: string,
  ): Promise<number> {
    const parser = new CsvParser({ delimiter: ',', trim: true });
    const stream = fs.createReadStream(fileControl.filePath);
    let count = 0;

    for await (const row of parser.parseStream(stream)) {
      await this.processRow(row, fileControl, clientId);
      count++;

      // Update progress every 100 records
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
    clientId: string,
  ): Promise<number> {
    const parser = new XlsxParser();
    const stream = fs.createReadStream(fileControl.filePath);
    let count = 0;

    for await (const row of parser.parseStream(stream)) {
      await this.processRow(row as CsvRow, fileControl, clientId);
      count++;

      // Update progress every 100 records
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
    clientId: string,
  ): Promise<void> {
    if (fileControl.fileType === FileType.TRANSACTIONS) {
      await this.transactionsService.createFromRow(row as any, fileControl.id, clientId);
    } else if (fileControl.fileType === FileType.SETTLEMENTS) {
      await this.settlementsService.createFromRow(row as any, fileControl.id, clientId);
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

  async findById(id: string): Promise<FileControl | null> {
    return this.prisma.fileControl.findUnique({
      where: { id },
      include: {
        uploader: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        _count: {
          select: {
            transactions: true,
            settlements: true,
          },
        },
      },
    });
  }
}
