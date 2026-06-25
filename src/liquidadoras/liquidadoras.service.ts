import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateLiquidadoraDto } from './dto/create-liquidadora.dto';
import { UpdateLiquidadoraDto } from './dto/update-liquidadora.dto';

@Injectable()
export class LiquidadorasService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(search?: string, isActive?: string) {
    const where: Prisma.LiquidadoraWhereInput = {};
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' as const } },
        { razonSocial: { contains: search, mode: 'insensitive' as const } },
        { banco: { contains: search, mode: 'insensitive' as const } },
        { clabe: { contains: search } },
      ];
    }
    if (isActive === 'true') where.isActive = true;
    else if (isActive === 'false') where.isActive = false;
    else if (isActive === undefined) where.isActive = true;
    // isActive === 'all' -> no se filtra

    return this.prisma.liquidadora.findMany({
      where,
      orderBy: { nombre: 'asc' },
    });
  }

  async create(data: CreateLiquidadoraDto) {
    try {
      return await this.prisma.liquidadora.create({ data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = (error.meta as any)?.target?.[0];
        throw new ConflictException(
          `Liquidadora with this ${target} already exists`,
        );
      }
      throw error;
    }
  }

  async update(id: any, data: UpdateLiquidadoraDto) {
    const liquidadoraId = typeof id === 'bigint' ? id : BigInt(id);
    try {
      return await this.prisma.liquidadora.update({
        where: { id: liquidadoraId },
        data,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Liquidadora with ID ${id} not found`);
        }
        if (error.code === 'P2002') {
          const target = (error.meta as any)?.target?.[0];
          throw new ConflictException(
            `Liquidadora with this ${target} already exists`,
          );
        }
      }
      throw error;
    }
  }

  async delete(id: any) {
    const liquidadoraId = typeof id === 'bigint' ? id : BigInt(id);
    try {
      return await this.prisma.liquidadora.update({
        where: { id: liquidadoraId },
        data: { isActive: false },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Liquidadora with ID ${id} not found`);
      }
      throw error;
    }
  }
}
