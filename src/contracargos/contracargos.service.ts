import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContracargoStatus } from '@prisma/client';

@Injectable()
export class ContracargosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: {
    transactionId: bigint;
    monto: number;
    motivo?: string;
    correoContacto?: string;
    observaciones?: string;
  }) {
    const tx = await this.prisma.transaction.findUnique({ where: { id: body.transactionId } });
    if (!tx) throw new NotFoundException(`Transacción ${body.transactionId} no encontrada`);

    return this.prisma.contracargo.create({
      data: {
        transactionId: body.transactionId,
        monto: body.monto,
        motivo: body.motivo,
        correoContacto: body.correoContacto,
        observaciones: body.observaciones,
      },
      include: {
        transaction: {
          select: { authorizationNumber: true, amount: true, client: { select: { name: true } } },
        },
      },
    });
  }

  async findAll(params: { status?: ContracargoStatus; page?: number; limit?: number }) {
    const { status, page = 1, limit = 20 } = params;
    const where: any = {};
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.contracargo.findMany({
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
      this.prisma.contracargo.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async update(id: bigint, body: {
    status?: ContracargoStatus;
    fechaEnvioDoc?: string;
    fechaContestacion?: string;
    observaciones?: string;
  }) {
    return this.prisma.contracargo.update({
      where: { id },
      data: {
        status: body.status,
        fechaEnvioDoc: body.fechaEnvioDoc ? new Date(body.fechaEnvioDoc) : undefined,
        fechaContestacion: body.fechaContestacion ? new Date(body.fechaContestacion) : undefined,
        observaciones: body.observaciones,
      },
    });
  }
}
