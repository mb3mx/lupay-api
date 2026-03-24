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
    return this.prisma.client.findMany({
      skip,
      take,
      where: { ...where, isActive: true },
      orderBy: orderBy || { name: 'asc' },
      include: {
        terminals: {
          where: { isActive: true },
          select: { id: true, serialNumber: true, model: true },
        },
      },
    });
  }

  async findById(id: any): Promise<Client | null> {
    return this.prisma.client.findUnique({
      where: { id, isActive: true },
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
    try {
      return await this.prisma.client.update({
        where: { id },
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
      // Soft delete
      return await this.prisma.client.update({
        where: { id },
        data: { isActive: false },
      });
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
