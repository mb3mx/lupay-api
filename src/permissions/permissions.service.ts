import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { PermissionAction, UserRole } from '../common/enums';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

const ALL_ACTIONS: PermissionAction[] = [
  PermissionAction.CREATE,
  PermissionAction.READ,
  PermissionAction.UPDATE,
  PermissionAction.DELETE,
];

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Usado por PermissionsGuard. Sin fila configurada -> deny por defecto. */
  async isAllowed(resource: string, action: PermissionAction, role: UserRole): Promise<boolean> {
    const row = await this.prisma.permission.findUnique({
      where: { resource_action: { resource, action } },
    });
    if (!row) return false;
    return row.roles.includes(role);
  }

  /** Matriz { recurso: { CREATE: bool, READ: bool, UPDATE: bool, DELETE: bool } } para el rol dado. */
  async findMyPermissions(role: UserRole): Promise<Record<string, Record<string, boolean>>> {
    const rows = await this.prisma.permission.findMany();
    const resources = Array.from(new Set(rows.map((r) => r.resource)));
    const result: Record<string, Record<string, boolean>> = {};
    for (const resource of resources) {
      result[resource] = {};
      for (const action of ALL_ACTIONS) {
        const row = rows.find((r) => r.resource === resource && r.action === action);
        result[resource][action] = row ? row.roles.includes(role) : false;
      }
    }
    return result;
  }

  findAllFlat() {
    return this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  async create(data: CreatePermissionDto) {
    try {
      return await this.prisma.permission.create({ data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new NotFoundException(
          `Ya existe un permiso para ${data.resource}:${data.action}`,
        );
      }
      throw error;
    }
  }

  async update(id: string, data: UpdatePermissionDto) {
    const permissionId = BigInt(id);
    try {
      return await this.prisma.permission.update({
        where: { id: permissionId },
        data,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Permission with ID ${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: string) {
    const permissionId = BigInt(id);
    try {
      await this.prisma.permission.delete({ where: { id: permissionId } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Permission with ID ${id} not found`);
      }
      throw error;
    }
  }
}
