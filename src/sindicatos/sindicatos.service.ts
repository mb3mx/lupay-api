import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateSindicatoDto } from './dto/create-sindicato.dto';
import { UpdateSindicatoDto } from './dto/update-sindicato.dto';

@Injectable()
export class SindicatosService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(search?: string, isActive?: string) {
    const where: Prisma.SindicatoWhereInput = {};
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' as const } },
        { banco: { contains: search, mode: 'insensitive' as const } },
        { clabe: { contains: search } },
      ];
    }
    if (isActive === 'true') where.isActive = true;
    else if (isActive === 'false') where.isActive = false;
    else if (isActive === undefined) where.isActive = true;
    // isActive === 'all' -> no se filtra

    return this.prisma.sindicato.findMany({
      where,
      orderBy: { nombre: 'asc' },
    });
  }

  async create(data: CreateSindicatoDto) {
    try {
      return await this.prisma.sindicato.create({ data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = (error.meta as any)?.target?.[0];
        throw new ConflictException(
          `Sindicato with this ${target} already exists`,
        );
      }
      throw error;
    }
  }

  async update(id: any, data: UpdateSindicatoDto) {
    const sindicatoId = typeof id === 'bigint' ? id : BigInt(id);
    try {
      return await this.prisma.sindicato.update({
        where: { id: sindicatoId },
        data,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Sindicato with ID ${id} not found`);
        }
        if (error.code === 'P2002') {
          const target = (error.meta as any)?.target?.[0];
          throw new ConflictException(
            `Sindicato with this ${target} already exists`,
          );
        }
      }
      throw error;
    }
  }

  async delete(id: any) {
    const sindicatoId = typeof id === 'bigint' ? id : BigInt(id);
    try {
      return await this.prisma.sindicato.update({
        where: { id: sindicatoId },
        data: { isActive: false },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Sindicato with ID ${id} not found`);
      }
      throw error;
    }
  }
}
