import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { UserRole } from '../common/enums';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';

@Injectable()
export class MenusService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Árbol de navegación filtrado por rol, en el formato que espera el
   * NavigationModel de Angular ({ id, title, translate, type, icon, url,
   * exactMatch, children }). Los grupos/collapse que se quedan sin hijos
   * visibles tras el filtro se omiten por completo.
   */
  async findTreeForRole(role: UserRole) {
    const items = await this.prisma.menuItem.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });

    const byParent = new Map<string, typeof items>();
    for (const item of items) {
      const key = item.parentId ? item.parentId.toString() : 'root';
      if (!byParent.has(key)) byParent.set(key, [] as any);
      byParent.get(key)!.push(item);
    }

    const build = (parentKey: string): any[] => {
      const children = byParent.get(parentKey) ?? [];
      const result: any[] = [];
      for (const item of children) {
        if (!item.roles.includes(role)) continue;

        const node: any = {
          id: item.id.toString(),
          title: item.title,
          translate: item.translateKey ?? undefined,
          type: item.type.toLowerCase(),
          icon: item.icon ?? '',
        };

        if (item.type === 'GROUP' || item.type === 'COLLAPSE') {
          const kids = build(item.id.toString());
          if (kids.length === 0) continue;
          node.children = kids;
        } else {
          node.url = item.url ?? undefined;
          node.exactMatch = item.exactMatch;
        }

        result.push(node);
      }
      return result;
    };

    return build('root');
  }

  findAllFlat() {
    return this.prisma.menuItem.findMany({
      orderBy: [{ parentId: 'asc' }, { order: 'asc' }],
    });
  }

  async create(data: CreateMenuItemDto) {
    const { parentId, ...rest } = data;
    return this.prisma.menuItem.create({
      data: {
        ...rest,
        parentId: parentId != null ? BigInt(parentId) : null,
      },
    });
  }

  async update(id: string, data: UpdateMenuItemDto) {
    const menuItemId = BigInt(id);
    const { parentId, ...rest } = data;
    try {
      return await this.prisma.menuItem.update({
        where: { id: menuItemId },
        data: {
          ...rest,
          ...(parentId !== undefined
            ? { parentId: parentId != null ? BigInt(parentId) : null }
            : {}),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`MenuItem with ID ${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: string) {
    const menuItemId = BigInt(id);
    try {
      await this.prisma.menuItem.delete({ where: { id: menuItemId } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`MenuItem with ID ${id} not found`);
      }
      throw error;
    }
  }
}
