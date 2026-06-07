import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  DefaultValuePipe,
  Request,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { extname, join } from 'path';
import * as bcrypt from 'bcrypt';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserRole } from '../common/enums';

const AVATARS_DIR = join(process.cwd(), 'uploads', 'avatars');
if (!existsSync(AVATARS_DIR)) mkdirSync(AVATARS_DIR, { recursive: true });

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const skip = (page - 1) * limit;
    const users = await this.usersService.findAll({
      skip,
      take: limit,
    });

    return {
      data: users.map((user) => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      })),
      meta: {
        page,
        limit,
        total: users.length,
      },
    };
  }

  @Get('pending')
  @ApiOperation({ summary: 'Listar usuarios pendientes de aprobacion (ADMIN)' })
  async findPending(@Request() req: any) {
    if (req.user?.role !== UserRole.ADMIN) {
      throw new UnauthorizedException('Solo administradores');
    }
    const users = await this.usersService.findAll({
      where: { isActive: false },
    });
    return {
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        provider: (u as any).provider,
        avatarUrl: u.avatarUrl,
        createdAt: u.createdAt,
      })),
    };
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Aprobar usuario pendiente (ADMIN)' })
  async approve(@Request() req: any, @Param('id') id: any) {
    if (req.user?.role !== UserRole.ADMIN) {
      throw new UnauthorizedException('Solo administradores');
    }
    const user = await this.usersService.update(id, { isActive: true });
    return {
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  async findOne(@Param('id') id: any) {
    const user = await this.usersService.findById(id);
    if (!user) {
      return { data: null };
    }
    return {
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
    };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  async getMe(@Request() req: any) {
    const user = await this.usersService.findByIdWithClient(req.user.userId);
    if (!user) return { data: null };
    const anyUser = user as any;
    return {
      data: {
        id: String(user.id),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        clientId: user.clientId != null ? String(user.clientId) : null,
        client: anyUser.client
          ? {
              id: String(anyUser.client.id),
              code: anyUser.client.code,
              name: anyUser.client.name,
              businessName: anyUser.client.businessName,
              taxId: anyUser.client.taxId,
              isActive: anyUser.client.isActive,
            }
          : null,
      },
    };
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile (name, email)' })
  async updateMe(
    @Request() req: any,
    @Body() body: { firstName?: string; lastName?: string; email?: string },
  ) {
    const user = await this.usersService.update(req.user.userId, {
      ...(body.firstName !== undefined && { firstName: body.firstName }),
      ...(body.lastName  !== undefined && { lastName:  body.lastName  }),
      ...(body.email     !== undefined && { email:     body.email     }),
    });
    return {
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  @Post('me/avatar')
  @ApiOperation({ summary: 'Upload avatar for current user' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: AVATARS_DIR,
        filename: (req, file, cb) => {
          const userId = (req as any).user?.userId ?? 'unknown';
          const ext = extname(file.originalname).toLowerCase() || '.jpg';
          cb(null, `${userId}-${Date.now()}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new BadRequestException('Solo se permiten imágenes (jpg, png, webp, gif)'), false);
      },
    }),
  )
  async uploadAvatar(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No se envió ningún archivo');

    // Borrar avatar anterior si existe
    const current = await this.usersService.findById(req.user.userId);
    if (current?.avatarUrl) {
      try {
        const prevPath = join(process.cwd(), current.avatarUrl.replace(/^\//, ''));
        if (existsSync(prevPath)) unlinkSync(prevPath);
      } catch {
        // ignorar errores al borrar
      }
    }

    const avatarUrl = `/uploads/avatars/${file.filename}`;
    const user = await this.usersService.update(req.user.userId, { avatarUrl });
    return {
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  @Delete('me/avatar')
  @ApiOperation({ summary: 'Remove avatar for current user' })
  async deleteAvatar(@Request() req: any) {
    const current = await this.usersService.findById(req.user.userId);
    if (current?.avatarUrl) {
      try {
        const path = join(process.cwd(), current.avatarUrl.replace(/^\//, ''));
        if (existsSync(path)) unlinkSync(path);
      } catch {
        // ignorar
      }
    }
    const user = await this.usersService.update(req.user.userId, { avatarUrl: null });
    return {
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  @Patch('me/password')
  @ApiOperation({ summary: 'Change current user password' })
  async changePassword(
    @Request() req: any,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    if (!body.currentPassword || !body.newPassword) {
      throw new BadRequestException('currentPassword and newPassword are required');
    }
    if (body.newPassword.length < 6) {
      throw new BadRequestException('New password must be at least 6 characters');
    }
    const user = await this.usersService.findById(req.user.userId);
    if (!user) throw new UnauthorizedException();
    if (!user.password) {
      throw new BadRequestException(
        'Esta cuenta usa login social; no se puede cambiar contraseña aquí.',
      );
    }
    const valid = await bcrypt.compare(body.currentPassword, user.password);
    if (!valid) throw new UnauthorizedException('La contraseña actual es incorrecta');
    const hashed = await bcrypt.hash(body.newPassword, 10);
    await this.usersService.update(req.user.userId, { password: hashed });
    return { data: { message: 'Contraseña actualizada correctamente' } };
  }
}
