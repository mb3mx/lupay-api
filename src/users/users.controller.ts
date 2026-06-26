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
import { RolesGuard } from '../auth/roles.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { UserRole, PermissionAction } from '../common/enums';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const AVATARS_DIR = join(process.cwd(), 'uploads', 'avatars');
if (!existsSync(AVATARS_DIR)) mkdirSync(AVATARS_DIR, { recursive: true });

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission('users', PermissionAction.READ)
  @ApiOperation({ summary: 'Listar usuarios con filtros' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'role', required: false, enum: UserRole })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'clientId', required: false, type: Number })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('role') role?: UserRole,
    @Query('isActive') isActive?: string,
    @Query('clientId') clientId?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (role) where.role = role;
    if (isActive === 'true') where.isActive = true;
    if (isActive === 'false') where.isActive = false;
    if (clientId) where.clientId = BigInt(clientId);

    const [users, total] = await Promise.all([
      this.usersService.findAllWithClient({ skip, take: limit, where }),
      this.usersService.count(where),
    ]);

    return {
      data: users.map((u: any) => ({
        id: String(u.id),
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        isActive: u.isActive,
        avatarUrl: u.avatarUrl,
        createdAt: u.createdAt,
        clientId: u.clientId != null ? String(u.clientId) : null,
        client: u.client
          ? { id: String(u.client.id), code: u.client.code, name: u.client.name, businessName: u.client.businessName }
          : null,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  @Get('pending')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar usuarios pendientes de aprobacion (ADMIN)' })
  async findPending() {
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
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Aprobar usuario pendiente (ADMIN)' })
  async approve(@Param('id') id: string) {
    const user = await this.usersService.update(BigInt(id), { isActive: true });
    return {
      data: {
        id: String(user.id),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
      },
    };
  }

  // IMPORTANTE: 'me' debe declararse ANTES de ':id'. En NestJS las rutas se
  // resuelven en orden; si ':id' va primero, GET /users/me cae en findOne con
  // id="me" y revienta en BigInt("me").
  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  async getMe(@Request() req: any) {
    const user = await this.usersService.findByIdWithClient(
      BigInt(req.user.userId),
    );
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

  @Get(':id')
  @RequirePermission('users', PermissionAction.READ)
  @ApiOperation({ summary: 'Get user by ID' })
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findByIdWithClient(BigInt(id));
    if (!user) {
      return { data: null };
    }
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

  @Post()
  @RequirePermission('users', PermissionAction.CREATE)
  @ApiOperation({ summary: 'Crear usuario' })
  async create(@Body() dto: CreateUserDto) {
    const user = await this.usersService.createByAdmin(dto);
    return {
      data: {
        id: String(user.id),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        clientId: user.clientId != null ? String(user.clientId) : null,
      },
    };
  }

  @Patch(':id')
  @RequirePermission('users', PermissionAction.UPDATE)
  @ApiOperation({ summary: 'Editar usuario' })
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const user = await this.usersService.updateByAdmin(
      BigInt(id),
      dto,
      BigInt(req.user.userId),
    );
    return {
      data: {
        id: String(user.id),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        clientId: user.clientId != null ? String(user.clientId) : null,
      },
    };
  }

  @Patch(':id/reset-password')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Resetear contrasena de un usuario (ADMIN)' })
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    await this.usersService.resetPasswordByAdmin(BigInt(id), dto.newPassword);
    return { data: { message: 'Contrasena actualizada' } };
  }

  @Patch(':id/activate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Activar usuario (ADMIN)' })
  async activate(@Request() req: any, @Param('id') id: string) {
    const user = await this.usersService.setActive(
      BigInt(id),
      true,
      BigInt(req.user.userId),
    );
    return {
      data: { id: String(user.id), isActive: user.isActive, role: user.role },
    };
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Desactivar usuario (ADMIN)' })
  async deactivate(@Request() req: any, @Param('id') id: string) {
    const user = await this.usersService.setActive(
      BigInt(id),
      false,
      BigInt(req.user.userId),
    );
    return {
      data: { id: String(user.id), isActive: user.isActive, role: user.role },
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
