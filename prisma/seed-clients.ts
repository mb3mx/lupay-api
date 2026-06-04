import { PrismaClient } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import * as path from 'path';

const prisma = new PrismaClient();

const LIQUIDADORAS = [
  {
    nombre: 'RADAQUI',
    razonSocial: 'ALIMENTOS Y BEBIDAS RADAQUI S.A. DE C.V.',
    banco: 'PEIBO',
    clabe: '732010100000046905',
  },
  {
    nombre: 'CARMIN',
    razonSocial: 'SERVICIOS EMPRESARIALES CARMIN S.A. DE C.V.',
    banco: 'PEIBO',
    clabe: '732010100000048644',
  },
  {
    nombre: 'CYB',
    razonSocial: 'THE CYB COMERCIO INTELIGENTE S.A. DE C.V.',
    banco: 'PEIBO',
    clabe: '732010100000048851',
  },
];

const SINDICATOS = [
  { nombre: 'SICOMEP', banco: 'KUSPIT', clabe: '653180003810168231' },
  { nombre: 'UNIDAD SOLIDARIA', banco: 'PEIBO', clabe: '732010100000006987' },
  {
    nombre: 'MOLINEROS, HARINEROS Y PANIFICADORES',
    banco: 'PEIBO',
    clabe: '732010100000005056',
  },
];

// 4 clientes principales por afiliación
const CLIENTES_AFILIACION = [
  {
    afiliacion: '9829972',
    code: 'EFEVOO-9829972',
    name: 'EfevooPay Principal',
    businessName: 'EFEVOOPAY S.A. DE C.V.',
    taxId: 'EFV001',
  },
  {
    afiliacion: '9877099',
    code: 'EFEVOO-9877099',
    name: 'EfevooPay Secundario',
    businessName: 'EFEVOOPAY S.A. DE C.V.',
    taxId: 'EFV002',
  },
  {
    afiliacion: '9829975',
    code: 'EFEVOO-9829975',
    name: 'EfevooPay Turismo',
    businessName: 'EFEVOOPAY S.A. DE C.V.',
    taxId: 'EFV003',
  },
  {
    afiliacion: '7163170335',
    code: 'EFEVOO-AMEX',
    name: 'EfevooPay AMEX',
    businessName: 'EFEVOOPAY S.A. DE C.V.',
    taxId: 'EFV004',
  },
];

async function seedSindicatos() {
  console.log('Creando sindicatos...');
  const created: Record<string, bigint> = {};
  for (const s of SINDICATOS) {
    const record = await prisma.sindicato.upsert({
      where: { nombre: s.nombre },
      update: { banco: s.banco, clabe: s.clabe },
      create: s,
    });
    created[s.nombre] = record.id;
    console.log(`  ✓ ${s.nombre}`);
  }
  return created;
}

async function seedLiquidadoras() {
  console.log('Creando liquidadoras...');
  const created: Record<string, bigint> = {};
  for (const l of LIQUIDADORAS) {
    const record = await prisma.liquidadora.upsert({
      where: { nombre: l.nombre },
      update: { razonSocial: l.razonSocial, banco: l.banco, clabe: l.clabe },
      create: l,
    });
    created[l.razonSocial] = record.id;
    console.log(`  ✓ ${l.nombre} (${l.razonSocial})`);
  }
  return created;
}

async function seedClientesAfiliacion() {
  console.log('Creando clientes por afiliación...');
  for (const c of CLIENTES_AFILIACION) {
    await prisma.client.upsert({
      where: { code: c.code },
      update: { afiliacion: c.afiliacion },
      create: {
        code: c.code,
        name: c.name,
        businessName: c.businessName,
        taxId: c.taxId,
        afiliacion: c.afiliacion,
        commissionTotal: 0,
      },
    });
    console.log(`  ✓ ${c.name} (afiliacion: ${c.afiliacion})`);
  }
}

async function seedNegocios(
  sindicatoIds: Record<string, bigint>,
  liquidadoraIds: Record<string, bigint>,
) {
  // Buscar archivo BASE LIQUIDADORAS
  const basePath = path.resolve(
    __dirname,
    '../../documentos/11_BASE LIQUIDADORAS 12.02.26.xlsx',
  );

  let workbook: ExcelJS.Workbook;
  try {
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(basePath);
  } catch {
    console.warn(
      `  ⚠️  No se encontró el archivo BASE LIQUIDADORAS en ${basePath}`,
    );
    console.warn('     Saltando seed de negocios. Puedes ejecutarlo manualmente después.');
    return;
  }

  const ws = workbook.getWorksheet('CLIENTES(PR+LITE)');
  if (!ws) {
    console.warn('  ⚠️  Hoja CLIENTES(PR+LITE) no encontrada.');
    return;
  }

  console.log('Importando negocios de CLIENTES(PR+LITE)...');

  let count = 0;
  let skipped = 0;

  for (let rowNum = 2; rowNum <= ws.rowCount; rowNum++) {
    const row = ws.getRow(rowNum);

    const nombre = row.getCell(2).value?.toString().trim();      // B - NOMBRE TERMINAL
    const comisionRaw = row.getCell(5).value;                    // E - COMISIÓN NEGOCIO
    const bankClabe = row.getCell(10).value?.toString().trim();  // J - SUBCUENTA KUSPIT
    const idSistema = row.getCell(16).value;                     // P - ID SISTEMA
    const razonSocial = row.getCell(17).value?.toString().trim(); // Q - RAZON SOCIAL
    const sindicatoNombre = row.getCell(14).value?.toString().trim(); // N - SINDICATO

    if (!nombre || !idSistema) {
      skipped++;
      continue;
    }

    const comision = typeof comisionRaw === 'number' ? comisionRaw : 0;
    const code = `NEG-${idSistema}`;
    const taxId = `NEG${idSistema}`;

    const sindicatoId = sindicatoNombre ? sindicatoIds[sindicatoNombre] ?? null : null;
    const liquidadoraId = razonSocial ? liquidadoraIds[razonSocial] ?? null : null;

    try {
      await prisma.client.upsert({
        where: { code },
        update: {
          name: nombre,
          commissionTotal: comision,
          bankClabe: bankClabe || null,
          sindicatoId: sindicatoId ?? undefined,
          liquidadoraId: liquidadoraId ?? undefined,
        },
        create: {
          code,
          name: nombre,
          businessName: razonSocial || nombre,
          taxId,
          commissionTotal: comision,
          bankClabe: bankClabe || null,
          sindicatoId: sindicatoId ?? undefined,
          liquidadoraId: liquidadoraId ?? undefined,
        },
      });
      count++;
    } catch {
      skipped++;
    }
  }

  console.log(`  ✓ ${count} negocios importados, ${skipped} omitidos`);
}

async function main() {
  console.log('\n🌱 Iniciando seed de catálogos Lupay...\n');

  const sindicatoIds = await seedSindicatos();
  const liquidadoraIds = await seedLiquidadoras();
  await seedClientesAfiliacion();
  await seedNegocios(sindicatoIds, liquidadoraIds);

  const totals = await Promise.all([
    prisma.sindicato.count(),
    prisma.liquidadora.count(),
    prisma.client.count(),
  ]);

  console.log('\n✅ Seed completado:');
  console.log(`   Sindicatos:   ${totals[0]}`);
  console.log(`   Liquidadoras: ${totals[1]}`);
  console.log(`   Clientes:     ${totals[2]}`);
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
