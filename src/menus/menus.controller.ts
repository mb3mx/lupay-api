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
import { MenusService } from './menus.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GetUser } from '../common/decorators/get-user.decorator';
import { UserRole } from '../common/enums';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';

function serialize(item: any) {
  return {
    ...item,
    id: item.id.toString(),
    parentId: item.parentId != null ? item.parentId.toString() : null,
  };
}

@ApiTags('Menus')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class MenusController {
  constructor(private readonly svc: MenusService) {}

  @Get('menus')
  @ApiOperation({ summary: 'Árbol de menú filtrado por el rol del usuario autenticado' })
  async findMyMenu(@GetUser('role') role: UserRole) {
    return this.svc.findTreeForRole(role);
  }

  @Get('menus/admin')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listado plano de items de menú (ADMIN only)' })
  async findAll() {
    const items = await this.svc.findAllFlat();
    return items.map(serialize);
  }

  @Post('menus')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear item de menú (ADMIN only)' })
  async create(@Body() dto: CreateMenuItemDto) {
    const item = await this.svc.create(dto);
    return serialize(item);
  }

  @Patch('menus/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar item de menú (ADMIN only)' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateMenuItemDto) {
    const item = await this.svc.update(id, dto);
    return serialize(item);
  }

  @Delete('menus/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar item de menú (ADMIN only)' })
  @ApiParam({ name: 'id' })
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
    return { success: true };
  }
}
