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
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { UserRole, PermissionAction } from '../common/enums';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@ApiTags('Clients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.USER)
  @ApiOperation({ summary: 'Get all clients' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sindicatoId', required: false, type: Number })
  @ApiQuery({ name: 'liquidadoraId', required: false, type: Number })
  @ApiQuery({ name: 'isActive', required: false, enum: ['true', 'false', 'all'] })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('sindicatoId') sindicatoId?: string,
    @Query('liquidadoraId') liquidadoraId?: string,
    @Query('isActive') isActive?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' as const } },
        { code: { contains: search, mode: 'insensitive' as const } },
        { businessName: { contains: search, mode: 'insensitive' as const } },
        { taxId: { contains: search, mode: 'insensitive' as const } },
        { afiliacion: { contains: search, mode: 'insensitive' as const } },
      ];
    }
    if (sindicatoId) where.sindicatoId = BigInt(sindicatoId);
    if (liquidadoraId) where.liquidadoraId = BigInt(liquidadoraId);
    if (isActive === 'true') where.isActive = true;
    else if (isActive === 'false') where.isActive = false;
    // isActive === 'all' → no se setea, el service no lo fuerza

    const [clients, total] = await Promise.all([
      this.clientsService.findAll({ skip, take: limit, where }),
      this.clientsService.count(where),
    ]);

    return {
      data: clients,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.USER)
  @ApiOperation({ summary: 'Get client by ID' })
  @ApiParam({ name: 'id', description: 'Client ID' })
  async findOne(@Param('id') id: any) {
    const client = await this.clientsService.findById(id);
    return { data: client };
  }

  @Post()
  @RequirePermission('clients', PermissionAction.CREATE)
  @ApiOperation({ summary: 'Create a new client' })
  async create(@Body() createClientDto: CreateClientDto) {
    const client = await this.clientsService.create(createClientDto);
    return { data: client };
  }

  @Patch(':id')
  @RequirePermission('clients', PermissionAction.UPDATE)
  @ApiOperation({ summary: 'Update client' })
  @ApiParam({ name: 'id', description: 'Client ID' })
  async update(@Param('id') id: any, @Body() updateClientDto: UpdateClientDto) {
    const client = await this.clientsService.update(id, updateClientDto);
    return { data: client };
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete client - soft delete (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'Client ID' })
  async remove(@Param('id') id: any) {
    await this.clientsService.delete(id);
    return { success: true };
  }
}
