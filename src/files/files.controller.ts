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

    const result = await this.filesService.uploadFile(
      file,
      uploadFileDto.fileType,
      uploadFileDto.clientId,
      user.userId,
    );

    return {
      data: {
        fileId: result.fileControl.id,
        originalName: result.fileControl.originalName,
        fileType: result.fileControl.fileType,
        status: result.fileControl.status,
        recordsProcessed: result.recordsProcessed,
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

    const files = await this.filesService.findAll({ skip, take: limit, where });

    return {
      data: files,
      meta: {
        page,
        limit,
        total: files.length,
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get file by ID' })
  @ApiParam({ name: 'id', description: 'File ID' })
  async findOne(@Param('id') id: string) {
    const file = await this.filesService.findById(id);
    return { data: file };
  }
}
