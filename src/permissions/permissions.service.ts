import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Permission } from '@prisma/client';
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
  /** Cache en memoria: la tabla es pequeña y cambia poco. */
  private cache: Permission[] | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async loadCache(): Promise<Permission[]> {
    if (this.cache === null) {
      this.cache = await this.prisma.permission.findMany();
    }
    return this.cache;
  }

  private invalidate(): void {
    this.cache = null;
  }

  /** Usado por PermissionsGuard. Sin fila configurada -> deny por defecto. */
  async isAllowed(resource: string, action: PermissionAction, role: UserRole): Promise<boolean> {
    const rows = await this.loadCache();
    const row = rows.find((r) => r.resource === resource && r.action === action);
    if (!row) return false;
    return row.roles.includes(role);
  }

  /** Matriz { recurso: { CREATE: bool, READ: bool, UPDATE: bool, DELETE: bool } } para el rol dado. */
  async findMyPermissions(role: UserRole): Promise<Record<string, Record<string, boolean>>> {
    const rows = await this.loadCache();
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
      const created = await this.prisma.permission.create({ data });
      this.invalidate();
      return created;
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
      const updated = await this.prisma.permission.update({
        where: { id: permissionId },
        data,
      });
      this.invalidate();
      return updated;
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
      this.invalidate();
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
