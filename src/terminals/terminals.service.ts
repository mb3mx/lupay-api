import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClientsService } from '../clients/clients.service';
import { Terminal, Prisma } from '@prisma/client';
import { CreateTerminalDto } from './dto/create-terminal.dto';
import { UpdateTerminalDto } from './dto/update-terminal.dto';

@Injectable()
export class TerminalsService {
  private readonly logger = new Logger(TerminalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
  ) {}

  async findAll(params: {
    skip?: number;
    take?: number;
    where?: Prisma.TerminalWhereInput;
    orderBy?: Prisma.TerminalOrderByWithRelationInput;
  }): Promise<Terminal[]> {
    const { skip, take, where, orderBy } = params;
    return this.prisma.terminal.findMany({
      skip,
      take,
      where: { ...where, isActive: true },
      orderBy: orderBy || { serialNumber: 'asc' },
      include: {
        client: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });
  }

  async findById(id: string): Promise<Terminal | null> {
    return this.prisma.terminal.findUnique({
      where: { id, isActive: true },
      include: {
        client: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });
  }

  async findBySerialNumber(serialNumber: string): Promise<Terminal | null> {
    return this.prisma.terminal.findUnique({
      where: { serialNumber, isActive: true },
    });
  }

  async create(data: CreateTerminalDto): Promise<Terminal> {
    const client = await this.clientsService.findByCode(data.clientCode);
    if (!client) {
      throw new NotFoundException(
        `Client with code ${data.clientCode} not found`,
      );
    }

    try {
      return await this.prisma.terminal.create({
        data: {
          serialNumber: data.serialNumber,
          model: data.model,
          location: data.location,
          clientId: client.id,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Terminal with serial number ${data.serialNumber} already exists`,
          );
        }
      }
      throw error;
    }
  }

  async update(id: string, data: UpdateTerminalDto): Promise<Terminal> {
    const updateData: Prisma.TerminalUpdateInput = {};

    if (data.serialNumber) updateData.serialNumber = data.serialNumber;
    if (data.model) updateData.model = data.model;
    if (data.location !== undefined) updateData.location = data.location;

    if (data.clientCode) {
      const client = await this.clientsService.findByCode(data.clientCode);
      if (!client) {
        throw new NotFoundException(
          `Client with code ${data.clientCode} not found`,
        );
      }
      updateData.client = { connect: { id: client.id } };
    }

    try {
      return await this.prisma.terminal.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Terminal with ID ${id} not found`);
        }
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Terminal with this serial number already exists`,
          );
        }
      }
      throw error;
    }
  }

  async delete(id: string): Promise<Terminal> {
    try {
      return await this.prisma.terminal.update({
        where: { id },
        data: { isActive: false },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Terminal with ID ${id} not found`);
        }
      }
      throw error;
    }
  }
}
