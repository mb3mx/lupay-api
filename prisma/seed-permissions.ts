import { PrismaClient, PermissionAction, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const PERMISSIONS: { resource: string; action: PermissionAction; roles: UserRole[] }[] = [
  // users: preserva el comportamiento actual (todo ADMIN-only) hasta que se
  // edite desde /admin/permissions.
  { resource: 'users', action: PermissionAction.CREATE, roles: [UserRole.ADMIN] },
  { resource: 'users', action: PermissionAction.READ, roles: [UserRole.ADMIN] },
  { resource: 'users', action: PermissionAction.UPDATE, roles: [UserRole.ADMIN] },

  // liquidacion: hoy "generate" está abierto a cualquier autenticado; con
  // este seed queda restringido a ADMIN desde el primer despliegue.
  { resource: 'liquidacion', action: PermissionAction.CREATE, roles: [UserRole.ADMIN] },
];

async function main() {
  console.log('🌱 Sembrando permisos...\n');

  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { resource_action: { resource: p.resource, action: p.action } },
      update: { roles: p.roles },
      create: p,
    });
    console.log(`  ✓ ${p.resource}:${p.action} -> [${p.roles.join(', ')}]`);
  }

  const total = await prisma.permission.count();
  console.log(`\n✅ Seed completado: ${total} permisos en total.`);
}

main()
  .catch((e) => {
    console.error('❌ Error en seed de permisos:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
