import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial data...');
  
  // Encriptamos la contraseña con bcrypt (por defecto en NestJS)
  const password = 'Password123!';
  const hashedPassword = await bcrypt.hash(password, 10);
  
  // Usamos upsert por si vuelves a correr el seed, no truene por duplicado
  const user = await prisma.user.upsert({
    where: { email: 'admin@lupay.com' },
    update: {}, // Si ya existe, no hace nada
    create: {
      email: 'admin@lupay.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'Lupay',
      role: 'ADMIN',
      isActive: true,
    },
  });
  
  console.log('✅ Usuario Administrador Creado:');
  console.log(`- Email:    ${user.email}`);
  console.log(`- Password: ${password}`);
  console.log(`- ID:       ${user.id}`);
}

main()
  .catch((e) => {
    console.error('Error durante el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
