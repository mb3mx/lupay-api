import { PrismaClient } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import * as path from 'path';

const prisma = new PrismaClient();

function getCellString(cell: ExcelJS.Cell): string {
  const val = cell.value;
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    if ('result' in val) {
      return val.result?.toString().trim() || '';
    }
    if ('text' in val) {
      return val.text?.toString().trim() || '';
    }
    return JSON.stringify(val);
  }
  return val.toString().trim();
}

function getCellNumber(cell: ExcelJS.Cell): number {
  const val = cell.value;
  if (typeof val === 'number') return val;
  if (val && typeof val === 'object' && 'result' in val) {
    return Number(val.result) || 0;
  }
  return Number(val) || 0;
}

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
  { nombre: 'SINDICATO 1 DE MAYO', banco: 'KUSPIT', clabe: '653180003810168231' },
  { nombre: 'UNIDAD SOLIDARIA', banco: 'PEIBO', clabe: '732010100000006987' },
  { nombre: 'MOLINEROS, HARINEROS Y PANIFICADORES',banco: 'PEIBO',clabe: '732010100000005056',
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



async function seedNegocios(
  sindicatoIds: Record<string, bigint>,
  liquidadoraIds: Record<string, bigint>,
) {
  // Buscar archivo BASE LIQUIDADORAS
  const basePath = path.resolve(
    __dirname,
    '../../docs/17_BASE LIQUIDADORAS 18.06.26.xlsx',
  );

  let workbook: ExcelJS.Workbook;
  try {
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(basePath);
    } catch {
    console.warn(
      `  ⚠️  No se encontró el archivo BASE LIQUIDADORAS en ninguna de las rutas provistas.`,
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

  const emailsInUse = new Set<string>();

  let count = 0;
  let skipped = 0;

  for (let rowNum = 2; rowNum <= ws.rowCount; rowNum++) {
    const row = ws.getRow(rowNum);

    const nombre = getCellString(row.getCell(2)).toUpperCase();                 // B - NOMBRE TERMINAL
    const comision = getCellNumber(row.getCell(5));               // E - COMISIÓN NEGOCIO
    const inntecCard = getCellString(row.getCell(8));             // H - NO. TARJETA INNTEC
    const inntecHolder = getCellString(row.getCell(9));           // I - TITULAR DE TARJETA
    const bankClabe = getCellString(row.getCell(10));             // J - SUBCUENTA KUSPIT
    const idSistema = getCellString(row.getCell(16));             // P - ID SISTEMA
    const razonSocial = getCellString(row.getCell(17));           // Q - RAZON SOCIAL
    const sindicatoNombre = getCellString(row.getCell(14));       // N - SINDICATO

    // Nuevos campos
    const terminalVal = getCellString(row.getCell(4));
    const terminal = terminalVal ? terminalVal : null;            // D - NO. SERIE TPV LU-PAY
    const reintegroTimeVal = getCellString(row.getCell(11));
    const reintegroTime = reintegroTimeVal ? reintegroTimeVal : null; // K - TIEMPO DE REINTEGRO/DISPERSION

    let activationEmail = getCellString(row.getCell(3));          // C - CORREO ACTIVACION CLIP
  

    if (!nombre || !idSistema) {
      skipped++;
      continue;
    }

    const code = getCellString(row.getCell(21)); // U - ID CLIENTE

    // Resolve email uniqueness within the file using prefix 1, 2, etc.
    const cleanEmail = activationEmail.trim().toLowerCase();

    let finalActivationEmail = cleanEmail;
    let counter = 1;
    // Check if the email was already processed in this file loop, if so, add a prefix (e.g. 1_email, 2_email)
    while (emailsInUse.has(finalActivationEmail)) {
      const parts = cleanEmail.split('@');
      if (parts.length === 2) {
        finalActivationEmail = `${counter}_${parts[0]}@${parts[1]}`;
      } else {
        finalActivationEmail = `${counter}_${cleanEmail}`;
      }
      counter++;
    }

    // Mark the resolved email as in use
    emailsInUse.add(finalActivationEmail);
    const taxId = ``;

    const sindicatoId = sindicatoNombre ? sindicatoIds[sindicatoNombre] ?? null : null;
    const liquidadoraId = razonSocial ? liquidadoraIds[razonSocial] ?? null : null;

    try {
      const client = await prisma.client.upsert({
        where: { code },
        update: {
          name: nombre,
          commissionTotal: comision,
          sindicatoId: sindicatoId ?? undefined,
          liquidadoraId: liquidadoraId ?? undefined,
          activationEmail: finalActivationEmail,
          terminal,
          reintegroTime,
        },
        create: {
          code,
          name: nombre,
          businessName: razonSocial || nombre,
          taxId,
          commissionTotal: comision,
          sindicatoId: sindicatoId ?? undefined,
          liquidadoraId: liquidadoraId ?? undefined,
          activationEmail: finalActivationEmail,
          terminal,
          reintegroTime,
        },
      });

      // Clear existing payment accounts for this client during seed
      await prisma.clientPaymentAccount.deleteMany({
        where: { clientId: client.id },
      });

      const accountsToCreate: any[] = [];

      // 1. Parse Inntec cards (can have multiple cards separated by newlines with percentages)
      let totalInntecPct = 0;
      if (inntecCard) {
        const cardLines = inntecCard.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const holderLines = (inntecHolder || '').split('\n').map(l => l.trim()).filter(l => l.length > 0);

        cardLines.forEach((line, idx) => {
          const match = line.match(/^(\d+)\s*(?:\((\d+)%\))?/);
          let cardNum = line;
          let pct = 100.0;
          if (match) {
            cardNum = match[1];
            if (match[2]) {
              pct = parseFloat(match[2]);
            }
          }

          let holder = '';
          if (idx < holderLines.length) {
            holder = holderLines[idx];
          } else if (holderLines.length > 0) {
            holder = holderLines[0]; // Repeat holder name if only one is provided
          }

          accountsToCreate.push({
            type: 'INNTEC',
            accountNumber: cardNum,
            holderName: holder,
            bankName: 'INNTEC',
            payoutPercentage: pct,
            isActive: true,
          });
          totalInntecPct += pct;
        });
      }

      // 2. Parse Kuspit subaccount
      if (bankClabe) {
        const bankClabeClean = bankClabe.replace(/\n|\r/g, '').trim();
        const isIgnoredKuspit = ['RESGUARDO', 'SIN CUENTA', 'NA', 'N/A', 'N / A', '-'].includes(bankClabeClean.toUpperCase());
        if (bankClabeClean && !isIgnoredKuspit) {
          // Payout percentage is the remaining percentage (100 - sum(inntec_percentages))
          const remainingPct = Math.max(0.0, 100.0 - totalInntecPct);
          accountsToCreate.push({
            type: 'KUSPIT',
            accountNumber: bankClabeClean,
            holderName: '', // Holder name is empty for Kuspit as requested
            bankName: 'KUSPIT',
            payoutPercentage: remainingPct,
            isActive: true,
          });
        }
      }

      if (accountsToCreate.length > 0) {
        // Enforce sum of active percentages is exactly 100% if there is only 1 account
        if (accountsToCreate.length === 1) {
          accountsToCreate[0].payoutPercentage = 100.0;
        }

        await prisma.clientPaymentAccount.createMany({
          data: accountsToCreate.map(acc => ({
            clientId: client.id,
            type: acc.type as any,
            accountNumber: acc.accountNumber,
            holderName: acc.holderName,
            bankName: acc.bankName,
            payoutPercentage: acc.payoutPercentage,
            isActive: acc.isActive,
          })),
        });
      }

      count++;
    } catch (e) {
      skipped++;
    }
  }

  console.log(`  ✓ ${count} negocios importados, ${skipped} omitidos`);
}

async function main() {
  console.log('\n🌱 Iniciando seed de catálogos Lupay...\n');

  const sindicatoIds = await seedSindicatos();
  const liquidadoraIds = await seedLiquidadoras();
  //await seedClientesAfiliacion();
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
