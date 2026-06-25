import { PrismaClient, UserRole, MenuItemType } from '@prisma/client';

const prisma = new PrismaClient();

const ALL_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.USER, UserRole.CLIENT];
const ADMIN_ONLY: UserRole[] = [UserRole.ADMIN];

async function createGroup(
  title: string,
  translateKey: string,
  order: number,
  roles: UserRole[],
) {
  return prisma.menuItem.create({
    data: { title, translateKey, type: MenuItemType.GROUP, order, roles },
  });
}

async function createItem(
  parentId: bigint,
  title: string,
  translateKey: string,
  icon: string,
  url: string,
  order: number,
  roles: UserRole[],
  exactMatch = false,
) {
  return prisma.menuItem.create({
    data: {
      parentId,
      title,
      translateKey,
      type: MenuItemType.ITEM,
      icon,
      url,
      exactMatch,
      order,
      roles,
    },
  });
}

async function main() {
  const existing = await prisma.menuItem.count();
  if (existing > 0) {
    console.log(`Ya existen ${existing} items de menú, no se vuelve a sembrar.`);
    return;
  }

  console.log('🌱 Sembrando estructura de menú...\n');

  const principal = await createGroup('Principal', 'NAV.MAIN.TITLE', 0, ALL_ROLES);
  await createItem(principal.id, 'Dashboard', 'NAV.DASHBOARD', 'dashboard', '/dashboard', 0, ALL_ROLES);

  const operaciones = await createGroup('Operaciones', 'NAV.OPERATIONS', 1, ALL_ROLES);
  await createItem(operaciones.id, 'Conciliación', 'NAV.RECONCILIATION', 'file-upload', '/conciliacion', 0, ALL_ROLES, true);
  await createItem(operaciones.id, 'Resultados', 'NAV.RESULTS', 'double-check-circle', '/conciliacion/resultados', 1, ALL_ROLES);
  await createItem(operaciones.id, 'Liquidación', 'NAV.LIQUIDATION', 'dollar', '/liquidacion', 2, ALL_ROLES);
  await createItem(operaciones.id, 'Cancelaciones', 'NAV.CANCELLATIONS', 'circle-remove-o', '/cancelaciones', 3, ALL_ROLES);

  const gestion = await createGroup('Gestión', 'NAV.MANAGEMENT', 2, ALL_ROLES);
  await createItem(gestion.id, 'Devoluciones', 'NAV.RETURNS', 'reply', '/devoluciones', 0, ALL_ROLES);
  await createItem(gestion.id, 'Contracargos', 'NAV.CHARGEBACKS', 'alert', '/contracargos', 1, ALL_ROLES);

  const admin = await createGroup('Administración', 'NAV.ADMIN', 3, ADMIN_ONLY);
  await createItem(admin.id, 'Clientes', 'NAV.ADMIN_CLIENTS', 'company', '/admin/clients', 0, ADMIN_ONLY);
  await createItem(admin.id, 'Usuarios', 'NAV.ADMIN_USERS', 'user', '/admin/users', 1, ADMIN_ONLY);
  await createItem(admin.id, 'Sindicatos', 'NAV.ADMIN_SINDICATOS', 'company', '/admin/sindicatos', 2, ADMIN_ONLY);
  await createItem(admin.id, 'Liquidadoras', 'NAV.ADMIN_LIQUIDADORAS', 'dollar', '/admin/liquidadoras', 3, ADMIN_ONLY);
  await createItem(admin.id, 'Menús', 'NAV.ADMIN_MENUS', 'list', '/admin/menus', 4, ADMIN_ONLY);

  const total = await prisma.menuItem.count();
  console.log(`\n✅ Seed completado: ${total} items de menú creados.`);
}

main()
  .catch((e) => {
    console.error('❌ Error en seed de menús:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
