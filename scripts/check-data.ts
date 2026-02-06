import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  console.log('=== Checking Database ===\n');

  const itemCount = await prisma.inventoryItem.count();
  console.log('Total items:', itemCount);

  const warehouseCount = await prisma.warehouse.count();
  console.log('Total warehouses:', warehouseCount);

  const supplierCount = await prisma.supplier.count();
  console.log('Total suppliers:', supplierCount);

  const categoryCount = await prisma.category.count();
  console.log('Total categories:', categoryCount);

  // Sample items
  const items = await prisma.inventoryItem.findMany({
    take: 5,
    include: { warehouse: true, supplier: true },
  });

  console.log('\n=== Sample Items ===');
  for (const item of items) {
    console.log(`\n${item.name}:`);
    console.log(`  warehouseId: ${item.warehouseId}`);
    console.log(`  warehouse: ${item.warehouse?.name || 'NULL'}`);
    console.log(`  supplierId: ${item.supplierId}`);
    console.log(`  supplier: ${item.supplier?.name || 'NULL'}`);
  }

  // List warehouses
  const warehouses = await prisma.warehouse.findMany();
  console.log('\n=== Warehouses ===');
  for (const w of warehouses) {
    console.log(`  ${w.id} - ${w.name}`);
  }

  // List suppliers
  const suppliers = await prisma.supplier.findMany();
  console.log('\n=== Suppliers ===');
  for (const s of suppliers) {
    console.log(`  ${s.id} - ${s.name}`);
  }

  // Count items without warehouse
  const noWarehouse = await prisma.inventoryItem.count({ where: { warehouseId: null as any } });
  console.log('\n=== Items without warehouse:', noWarehouse);

  // Count items without supplier
  const noSupplier = await prisma.inventoryItem.count({ where: { supplierId: null } });
  console.log('Items without supplier:', noSupplier);

  await prisma.$disconnect();
}

check().catch(console.error);
