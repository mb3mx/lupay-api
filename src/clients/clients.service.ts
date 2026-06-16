import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Client, Prisma } from '@prisma/client';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    skip?: number;
    take?: number;
    where?: Prisma.ClientWhereInput;
    orderBy?: Prisma.ClientOrderByWithRelationInput;
  }): Promise<Client[]> {
    const { skip, take, where, orderBy } = params;
    // Si el caller no especifica isActive, se preserva el comportamiento legacy
    // (solo activos). Si lo especifica (true/false), se respeta.
    const finalWhere: Prisma.ClientWhereInput = { ...where };
    if (finalWhere.isActive === undefined) {
      finalWhere.isActive = true;
    }
    return this.prisma.client.findMany({
      skip,
      take,
      where: finalWhere,
      orderBy: orderBy || { name: 'asc' },
      include: {
        sindicato: { select: { id: true, nombre: true } },
        liquidadora: { select: { id: true, nombre: true } },
        terminals: {
          where: { isActive: true },
          select: { id: true, serialNumber: true, model: true },
        },
      },
    });
  }

  async count(where?: Prisma.ClientWhereInput): Promise<number> {
    const finalWhere: Prisma.ClientWhereInput = { ...where };
    if (finalWhere.isActive === undefined) {
      finalWhere.isActive = true;
    }
    return this.prisma.client.count({ where: finalWhere });
  }

  async findById(id: any): Promise<Client | null> {
    const clientId = typeof id === 'bigint' ? id : BigInt(id);
    return this.prisma.client.findUnique({
      where: { id: clientId, isActive: true },
      include: {
        terminals: {
          where: { isActive: true },
        },
      },
    });
  }

  async findByCode(code: string): Promise<Client | null> {
    return this.prisma.client.findUnique({
      where: { code, isActive: true },
    });
  }

  async findByAfiliacion(afiliacion: string): Promise<Client | null> {
    if (!afiliacion) return null;
    return this.prisma.client.findFirst({
      where: { afiliacion: afiliacion.trim(), isActive: true },
    });
  }

  async create(data: CreateClientDto): Promise<Client> {
    try {
      return await this.prisma.client.create({ data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const target = (error.meta as any)?.target?.[0];
          throw new ConflictException(
            `Client with this ${target} already exists`,
          );
        }
      }
      throw error;
    }
  }

  async update(id: any, data: UpdateClientDto): Promise<Client> {
    const clientId = typeof id === 'bigint' ? id : BigInt(id);
    try {
      return await this.prisma.client.update({
        where: { id: clientId },
        data,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Client with ID ${id} not found`);
        }
        if (error.code === 'P2002') {
          const target = (error.meta as any)?.target?.[0];
          throw new ConflictException(
            `Client with this ${target} already exists`,
          );
        }
      }
      throw error;
    }
  }

  async delete(id: any): Promise<Client> {
    try {
      const clientId = typeof id === 'bigint' ? id : BigInt(id);
      const [, client] = await this.prisma.$transaction([
        this.prisma.user.updateMany({
          where: { clientId, role: 'CLIENT' },
          data: { isActive: false },
        }),
        this.prisma.client.update({
          where: { id: clientId },
          data: { isActive: false },
        }),
      ]);
      this.logger.log(`Client ${clientId} deactivated (cascade to CLIENT users)`);
      return client;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Client with ID ${id} not found`);
        }
      }
      throw error;
    }
  }
}
