import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GetUser } from '../common/decorators/get-user.decorator';
import { UserRole } from '../common/enums';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

function serialize(item: any) {
  return { ...item, id: item.id.toString() };
}

@ApiTags('Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly svc: PermissionsService) {}

  @Get('mine')
  @ApiOperation({ summary: 'Matriz de permisos para el rol del usuario autenticado' })
  async findMine(@GetUser('role') role: UserRole) {
    return this.svc.findMyPermissions(role);
  }

  @Get('admin')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listado plano de permisos (ADMIN only)' })
  async findAll() {
    const items = await this.svc.findAllFlat();
    return items.map(serialize);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear permiso (ADMIN only)' })
  async create(@Body() dto: CreatePermissionDto) {
    const item = await this.svc.create(dto);
    return serialize(item);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar permiso (ADMIN only)' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdatePermissionDto) {
    const item = await this.svc.update(id, dto);
    return serialize(item);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar permiso (ADMIN only)' })
  @ApiParam({ name: 'id' })
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
    return { success: true };
  }
}
