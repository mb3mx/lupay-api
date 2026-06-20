import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SindicatosService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(search?: string) {
    return this.prisma.sindicato.findMany({
      where: search
        ? {
            OR: [
              { nombre: { contains: search, mode: 'insensitive' as const } },
              { banco: { contains: search, mode: 'insensitive' as const } },
              { clabe: { contains: search } },
            ],
          }
        : undefined,
      orderBy: { nombre: 'asc' },
    });
  }
}
