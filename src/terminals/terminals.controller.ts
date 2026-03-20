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
import { TerminalsService } from './terminals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateTerminalDto } from './dto/create-terminal.dto';
import { UpdateTerminalDto } from './dto/update-terminal.dto';

@ApiTags('Terminals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('terminals')
export class TerminalsController {
  constructor(private readonly terminalsService: TerminalsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all terminals' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'clientId', required: false, type: String })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('clientId') clientId?: string,
  ) {
    const skip = (page - 1) * limit;
    const where = clientId ? { clientId } : undefined;

    const terminals = await this.terminalsService.findAll({
      skip,
      take: limit,
      where,
    });

    return {
      data: terminals,
      meta: {
        page,
        limit,
        total: terminals.length,
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get terminal by ID' })
  @ApiParam({ name: 'id', description: 'Terminal ID' })
  async findOne(@Param('id') id: string) {
    const terminal = await this.terminalsService.findById(id);
    return { data: terminal };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new terminal' })
  async create(@Body() createTerminalDto: CreateTerminalDto) {
    const terminal = await this.terminalsService.create(createTerminalDto);
    return { data: terminal };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update terminal' })
  @ApiParam({ name: 'id', description: 'Terminal ID' })
  async update(
    @Param('id') id: string,
    @Body() updateTerminalDto: UpdateTerminalDto,
  ) {
    const terminal = await this.terminalsService.update(id, updateTerminalDto);
    return { data: terminal };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete terminal (soft delete)' })
  @ApiParam({ name: 'id', description: 'Terminal ID' })
  async remove(@Param('id') id: string) {
    await this.terminalsService.delete(id);
    return { success: true };
  }
}
