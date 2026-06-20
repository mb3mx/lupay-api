import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { User, Prisma } from '@prisma/client';
import { UserRole } from '../common/enums';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findByProvider(provider: string, providerId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { provider_providerId: { provider, providerId } },
    });
  }

  async findById(id: any): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findByIdWithClient(id: any) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        client: {
          select: {
            id: true,
            code: true,
            name: true,
            businessName: true,
            taxId: true,
            isActive: true,
          },
        },
      },
    });
  }

  async findAll(params: {
    skip?: number;
    take?: number;
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }): Promise<User[]> {
    const { skip, take, where, orderBy } = params;
    return this.prisma.user.findMany({
      skip,
      take,
      where,
      orderBy: orderBy || { createdAt: 'desc' },
    });
  }

  async findAllWithClient(params: {
    skip?: number;
    take?: number;
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }) {
    const { skip, take, where, orderBy } = params;
    return this.prisma.user.findMany({
      skip,
      take,
      where,
      orderBy: orderBy || { createdAt: 'desc' },
      include: {
        client: { select: { id: true, code: true, name: true, businessName: true } },
      },
    });
  }

  async count(where?: Prisma.UserWhereInput): Promise<number> {
    return this.prisma.user.count({ where });
  }

  private async countActiveAdmins(excludeUserId?: bigint): Promise<number> {
    return this.prisma.user.count({
      where: {
        role: 'ADMIN',
        isActive: true,
        ...(excludeUserId != null && { id: { not: excludeUserId } }),
      },
    });
  }

  async createByAdmin(dto: CreateUserDto): Promise<User> {
    this.validateRoleClientPair(dto.role, dto.clientId);
    if (dto.role === UserRole.CLIENT && dto.clientId != null) {
      await this.assertClientExistsAndActive(BigInt(dto.clientId));
    }

    try {
      const hashed = await bcrypt.hash(dto.password, 10);
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          password: hashed,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: dto.role,
          isActive: dto.isActive ?? true,
          provider: 'local',
          ...(dto.role === UserRole.CLIENT && dto.clientId != null
            ? { client: { connect: { id: BigInt(dto.clientId) } } }
            : {}),
        },
      });
      this.logger.log(`Admin created user ${user.email} (role=${user.role})`);
      return user;
    } catch (error) {
      this.handleUniqueViolation(error);
      throw error;
    }
  }

  async updateByAdmin(
    targetId: bigint,
    dto: UpdateUserDto,
    actingUserId: bigint,
  ): Promise<User> {
    const current = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!current) throw new NotFoundException(`User ${targetId} not found`);

    const nextRole = (dto.role ?? current.role) as UserRole;
    const nextClientId =
      dto.clientId === undefined
        ? current.clientId
        : dto.clientId === null
          ? null
          : BigInt(dto.clientId);

    this.validateRoleClientPair(nextRole, nextClientId);
    if (nextRole === UserRole.CLIENT && nextClientId != null) {
      await this.assertClientExistsAndActive(nextClientId);
    }

    if (
      current.role === 'ADMIN' &&
      dto.role !== undefined &&
      dto.role !== UserRole.ADMIN
    ) {
      const remaining = await this.countActiveAdmins(targetId);
      if (remaining === 0) {
        throw new ForbiddenException('No se puede degradar al ultimo ADMIN activo');
      }
    }

    if (
      current.isActive &&
      dto.isActive === false &&
      current.role === 'ADMIN'
    ) {
      const remaining = await this.countActiveAdmins(targetId);
      if (remaining === 0) {
        throw new ForbiddenException('No se puede desactivar al ultimo ADMIN activo');
      }
    }

    if (dto.isActive === false && targetId === actingUserId) {
      throw new ForbiddenException('No puedes desactivarte a ti mismo');
    }

    const data: Prisma.UserUpdateInput = {
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.firstName !== undefined && { firstName: dto.firstName }),
      ...(dto.lastName !== undefined && { lastName: dto.lastName }),
      ...(dto.role !== undefined && { role: dto.role }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.clientId !== undefined && {
        client:
          nextClientId == null
            ? { disconnect: true }
            : { connect: { id: nextClientId } },
      }),
      ...(nextRole !== UserRole.CLIENT && current.clientId != null
        ? { client: { disconnect: true } }
        : {}),
    };

    try {
      return await this.prisma.user.update({ where: { id: targetId }, data });
    } catch (error) {
      this.handleUniqueViolation(error);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`User ${targetId} not found`);
      }
      throw error;
    }
  }

  async resetPasswordByAdmin(targetId: bigint, newPassword: string): Promise<void> {
    const hashed = await bcrypt.hash(newPassword, 10);
    try {
      await this.prisma.user.update({
        where: { id: targetId },
        data: { password: hashed },
      });
      this.logger.log(`Password reset for user ${targetId} by admin`);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`User ${targetId} not found`);
      }
      throw error;
    }
  }

  async setActive(
    targetId: bigint,
    isActive: boolean,
    actingUserId: bigint,
  ): Promise<User> {
    if (!isActive && targetId === actingUserId) {
      throw new ForbiddenException('No puedes desactivarte a ti mismo');
    }

    const current = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!current) throw new NotFoundException(`User ${targetId} not found`);

    if (!isActive && current.role === 'ADMIN') {
      const remaining = await this.countActiveAdmins(targetId);
      if (remaining === 0) {
        throw new ForbiddenException('No se puede desactivar al ultimo ADMIN activo');
      }
    }

    return this.prisma.user.update({
      where: { id: targetId },
      data: { isActive },
    });
  }

  private validateRoleClientPair(role: UserRole, clientId?: number | bigint | null): void {
    if (role === UserRole.CLIENT && (clientId == null)) {
      throw new BadRequestException('clientId es requerido para usuarios CLIENT');
    }
  }

  private async assertClientExistsAndActive(clientId: bigint): Promise<void> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, isActive: true },
    });
    if (!client) {
      throw new BadRequestException(`Cliente ${clientId} no existe`);
    }
    if (!client.isActive) {
      throw new BadRequestException(`Cliente ${clientId} esta inactivo`);
    }
  }

  private handleUniqueViolation(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = (error.meta as any)?.target?.[0];
      if (target === 'email') {
        throw new ConflictException('El correo ya esta registrado');
      }
      throw new ConflictException(`Conflicto en campo ${target}`);
    }
  }

  async create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async update(id: any, data: Prisma.UserUpdateInput): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id },
        data,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`User with ID ${id} not found`);
        }
      }
      throw error;
    }
  }

  async delete(id: any): Promise<User> {
    try {
      return await this.prisma.user.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`User with ID ${id} not found`);
        }
      }
      throw error;
    }
  }
}
