import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DevolucionStatus } from '@prisma/client';

@Injectable()
export class DevolucionesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(transactionId: bigint, monto: number, observaciones?: string) {
    const tx = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException(`Transacción ${transactionId} no encontrada`);

    return this.prisma.devolucion.create({
      data: { transactionId, monto, observaciones },
      include: { transaction: { select: { authorizationNumber: true, amount: true, client: { select: { name: true } } } } },
    });
  }

  async findAll(params: { status?: DevolucionStatus; page?: number; limit?: number }) {
    const { status, page = 1, limit = 20 } = params;
    const where: any = {};
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.devolucion.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          transaction: {
            select: {
              authorizationNumber: true,
              amount: true,
              transactionDate: true,
              client: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.devolucion.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async updateStatus(id: bigint, status: DevolucionStatus, fechaDescuento?: string) {
    return this.prisma.devolucion.update({
      where: { id },
      data: { status, fechaDescuento: fechaDescuento ? new Date(fechaDescuento) : undefined },
    });
  }
}
