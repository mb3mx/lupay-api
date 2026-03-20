import { PrismaClient, UserRole, CardBrand } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Clean existing data
  await cleanDatabase();

  // Create users
  const users = await createUsers();

  // Create clients
  const clients = await createClients();

  // Create terminals
  const terminals = await createTerminals(clients);

  console.log('\n✅ Database seeded successfully!\n');
  console.log('Login credentials:');
  console.log('  Admin: admin@example.com / admin123');
  console.log('  User:  user@example.com / user123\n');
}

async function cleanDatabase() {
  console.log('Cleaning database...');
  await prisma.$transaction([
    prisma.payoutItem.deleteMany(),
    prisma.payout.deleteMany(),
    prisma.reconciliation.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.settlement.deleteMany(),
    prisma.fileControl.deleteMany(),
    prisma.terminal.deleteMany(),
    prisma.client.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

async function createUsers() {
  console.log('Creating users...');

  const hashedPassword = await bcrypt.hash('admin123', 10);
  const userPassword = await bcrypt.hash('user123', 10);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: UserRole.ADMIN,
    },
  });

  const user = await prisma.user.create({
    data: {
      email: 'user@example.com',
      password: userPassword,
      firstName: 'Regular',
      lastName: 'User',
      role: UserRole.USER,
    },
  });

  return { admin, user };
}

async function createClients() {
  console.log('Creating clients...');

  const clients = [
    {
      code: 'CLI001',
      name: 'Tienda Electronica ABC',
      businessName: 'ABC Electronics SA de CV',
      taxId: 'ABC123456XYZ',
      commissionTotal: 2.5,
      contactName: 'Juan Perez',
      contactEmail: 'juan@abc-electronics.com',
      contactPhone: '+52 555 123 4567',
      bankName: 'BBVA',
      bankAccount: '0123456789',
      bankClabe: '012345678901234567',
    },
    {
      code: 'CLI002',
      name: 'Supermercado Express',
      businessName: 'Express Supermercados SA de CV',
      taxId: 'EXP987654XYZ',
      commissionTotal: 1.8,
      contactName: 'Maria Garcia',
      contactEmail: 'maria@express.com',
      contactPhone: '+52 555 987 6543',
      bankName: 'Santander',
      bankAccount: '9876543210',
      bankClabe: '987654321098765432',
    },
    {
      code: 'CLI003',
      name: 'Restaurante Gourmet',
      businessName: 'Gourmet Restaurants SA de CV',
      taxId: 'GOUR123456ABC',
      commissionTotal: 3.0,
      contactName: 'Carlos Lopez',
      contactEmail: 'carlos@gourmet.com',
      contactPhone: '+52 555 456 7890',
      bankName: 'Citibanamex',
      bankAccount: '4567890123',
      bankClabe: '456789012345678901',
    },
  ];

  const created = [];
  for (const client of clients) {
    const createdClient = await prisma.client.create({ data: client });
    created.push(createdClient);
    console.log(`  ✓ Client created: ${client.name} (${client.code})`);
  }

  return created;
}

async function createTerminals(clients: any[]) {
  console.log('Creating terminals...');

  const terminals = [
    { serialNumber: 'TERM001234', model: 'Verifone Vx520', clientId: clients[0].id },
    { serialNumber: 'TERM001235', model: 'Verifone Vx520', clientId: clients[0].id },
    { serialNumber: 'TERM001236', model: 'Ingenico iCT220', clientId: clients[0].id },
    { serialNumber: 'TERM002001', model: 'Verifone Vx680', clientId: clients[1].id },
    { serialNumber: 'TERM002002', model: 'Verifone Vx680', clientId: clients[1].id },
    { serialNumber: 'TERM003001', model: 'Ingenico iWL250', clientId: clients[2].id },
  ];

  const created = [];
  for (const terminal of terminals) {
    const createdTerminal = await prisma.terminal.create({
      data: {
        ...terminal,
        location: 'Main Branch',
      },
    });
    created.push(createdTerminal);
    console.log(`  ✓ Terminal created: ${terminal.serialNumber}`);
  }

  return created;
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
