import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UploadFileDto } from './dto/upload-file.dto';
import { ResolveImportDto } from './dto/resolve-import.dto';
import { GetUser } from '../common/decorators/get-user.decorator';

@ApiTags('Files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload transactions or settlements file' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
      fileFilter: (req, file, callback) => {
        const allowedMimetypes = [
          'text/csv',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ];
        const allowedExtensions = ['.csv', '.xlsx', '.xls'];

        const ext = file.originalname
          .substring(file.originalname.lastIndexOf('.'))
          .toLowerCase();

        if (
          allowedMimetypes.includes(file.mimetype) ||
          allowedExtensions.includes(ext)
        ) {
          callback(null, true);
        } else {
          callback(
            new BadRequestException(
              'Only CSV and Excel files are allowed',
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadFileDto: UploadFileDto,
    @GetUser() user: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // El procesamiento corre en background; la respuesta vuelve de inmediato.
    // El resultado final llega al usuario por la campanita (notificación SSE).
    const fileControl = await this.filesService.uploadFile(
      file,
      uploadFileDto.fileType,
      uploadFileDto.clientId,
      user.userId,
    );

    return {
      data: {
        fileId: fileControl.id,
        originalName: fileControl.originalName,
        fileType: fileControl.fileType,
        status: 'PROCESSING',
      },
    };
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate transactions file and detect client mismatches before uploading' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async validateFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadFileDto: UploadFileDto,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const result = await this.filesService.validateFile(
      file,
      uploadFileDto.fileType,
    );
    return { data: result };
  }

  @Post('import-validated')
  @ApiOperation({ summary: 'Import validated file after resolving client catalog issues' })
  async importValidated(
    @Body() dto: ResolveImportDto,
    @GetUser() user: any,
  ) {
    const fileControl = await this.filesService.importValidatedFile(
      dto,
      user.userId,
    );
    return {
      data: {
        fileId: fileControl.id,
        originalName: fileControl.originalName,
        fileType: fileControl.fileType,
        status: 'PROCESSING',
      },
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all uploaded files' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'fileType', required: false, enum: ['TRANSACTIONS', 'SETTLEMENTS'] })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('fileType') fileType?: string,
  ) {
    const skip = (page - 1) * limit;
    const where = fileType ? { fileType } : undefined;

    const [files, total] = await Promise.all([
      this.filesService.findAll({ skip, take: limit, where }),
      this.filesService.countAll(where),
    ]);

    return {
      data: files,
      meta: {
        page,
        limit,
        total,
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get file by ID' })
  @ApiParam({ name: 'id', description: 'File ID' })
  async findOne(@Param('id') id: any) {
    const file = await this.filesService.findById(id);
    return { data: file };
  }
}
