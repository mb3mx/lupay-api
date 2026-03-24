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
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@ApiTags('Clients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all clients' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    const skip = (page - 1) * limit;
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { code: { contains: search, mode: 'insensitive' as const } },
            { businessName: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : undefined;

    const clients = await this.clientsService.findAll({ skip, take: limit, where });

    return {
      data: clients,
      meta: {
        page,
        limit,
        total: clients.length,
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get client by ID' })
  @ApiParam({ name: 'id', description: 'Client ID' })
  async findOne(@Param('id') id: any) {
    const client = await this.clientsService.findById(id);
    return { data: client };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new client' })
  async create(@Body() createClientDto: CreateClientDto) {
    const client = await this.clientsService.create(createClientDto);
    return { data: client };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update client' })
  @ApiParam({ name: 'id', description: 'Client ID' })
  async update(@Param('id') id: any, @Body() updateClientDto: UpdateClientDto) {
    const client = await this.clientsService.update(id, updateClientDto);
    return { data: client };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete client (soft delete)' })
  @ApiParam({ name: 'id', description: 'Client ID' })
  async remove(@Param('id') id: any) {
    await this.clientsService.delete(id);
    return { success: true };
  }
}
