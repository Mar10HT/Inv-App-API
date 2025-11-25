import { PrismaClient, InventoryStatus, Currency, ItemType, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

// Exchange rate HNL to USD (aproximadamente)
const HNL_TO_USD_RATE = 0.04; // 1 HNL ≈ 0.04 USD (o 1 USD ≈ 25 HNL)

const categories = [
  'Electronics',
  'Furniture',
  'Hardware',
  'Office Supplies',
  'Computer Components',
  'Accessories',
];

const warehouseData = [
  { name: 'Bodega Principal', location: 'Tegucigalpa Centro', description: 'Bodega principal de almacenamiento' },
  { name: 'Bodega Norte', location: 'San Pedro Sula', description: 'Bodega regional norte' },
  { name: 'Bodega Sur', location: 'Choluteca', description: 'Bodega regional sur' },
];

const supplierData = [
  { name: 'Tech Solutions HN', location: 'Tegucigalpa', phone: '+504 2222-1111', email: 'ventas@techsolutions.hn' },
  { name: 'Office Depot Honduras', location: 'San Pedro Sula', phone: '+504 2550-3333', email: 'info@officedepot.hn' },
  { name: 'Importadora La Economia', location: 'Tegucigalpa', phone: '+504 2232-4444', email: 'compras@laeconomia.hn' },
  { name: 'Distribuidora Central', location: 'Comayagua', phone: '+504 2770-5555', email: 'ventas@distcentral.hn' },
];

const externalUserData = [
  { name: 'Carlos Martinez', email: 'carlos.m@external.hn', role: UserRole.EXTERNAL },
  { name: 'Ana Lopez', email: 'ana.l@external.hn', role: UserRole.EXTERNAL },
  { name: 'Roberto Sanchez', email: 'roberto.s@external.hn', role: UserRole.EXTERNAL },
  { name: 'Maria Fernandez', email: 'maria.f@external.hn', role: UserRole.EXTERNAL },
];

type ProductInfo = {
  name: string;
  basePrice: number;
  variation: number;
  isUnique: boolean; // true for serialized items, false for bulk
};

const products: Record<string, ProductInfo[]> = {
  Electronics: [
    { name: 'Laptop Dell XPS', basePrice: 1200, variation: 500, isUnique: true },
    { name: 'Laptop HP Pavilion', basePrice: 800, variation: 300, isUnique: true },
    { name: 'PC Desktop Dell OptiPlex', basePrice: 900, variation: 400, isUnique: true },
    { name: 'Monitor Samsung 27"', basePrice: 300, variation: 200, isUnique: true },
    { name: 'Monitor LG UltraWide', basePrice: 500, variation: 300, isUnique: true },
    { name: 'Keyboard Mechanical', basePrice: 120, variation: 80, isUnique: false },
    { name: 'Mouse Logitech MX', basePrice: 80, variation: 40, isUnique: false },
    { name: 'Webcam Logitech C920', basePrice: 100, variation: 50, isUnique: false },
    { name: 'Headset HyperX Cloud', basePrice: 90, variation: 60, isUnique: false },
    { name: 'Tablet Samsung Galaxy', basePrice: 400, variation: 300, isUnique: true },
  ],
  Furniture: [
    { name: 'Office Chair Ergonomic', basePrice: 250, variation: 200, isUnique: false },
    { name: 'Standing Desk', basePrice: 500, variation: 300, isUnique: false },
    { name: 'Conference Table', basePrice: 800, variation: 500, isUnique: false },
    { name: 'Filing Cabinet', basePrice: 150, variation: 100, isUnique: false },
    { name: 'Bookshelf 5-Tier', basePrice: 120, variation: 80, isUnique: false },
    { name: 'Office Desk L-Shape', basePrice: 400, variation: 250, isUnique: false },
    { name: 'Reception Desk', basePrice: 600, variation: 400, isUnique: false },
    { name: 'Executive Chair Leather', basePrice: 450, variation: 300, isUnique: false },
    { name: 'Meeting Room Chair', basePrice: 180, variation: 120, isUnique: false },
    { name: 'Storage Cabinet', basePrice: 200, variation: 150, isUnique: false },
  ],
  Hardware: [
    { name: 'Screws Phillips M4x20mm (Box 100)', basePrice: 5, variation: 3, isUnique: false },
    { name: 'Screws Flathead M5x30mm (Box 100)', basePrice: 6, variation: 3, isUnique: false },
    { name: 'Bolts Hex M8x40mm (Box 50)', basePrice: 12, variation: 5, isUnique: false },
    { name: 'Nuts Hex M8 (Box 100)', basePrice: 8, variation: 4, isUnique: false },
    { name: 'Washers M8 (Box 200)', basePrice: 5, variation: 2, isUnique: false },
    { name: 'Anchors Wall Plastic (Box 50)', basePrice: 4, variation: 2, isUnique: false },
    { name: 'Drill Bits Set HSS', basePrice: 35, variation: 20, isUnique: false },
    { name: 'Hammer Claw 16oz', basePrice: 25, variation: 15, isUnique: false },
    { name: 'Screwdriver Set 10pc', basePrice: 30, variation: 20, isUnique: false },
    { name: 'Pliers Set 3pc', basePrice: 40, variation: 25, isUnique: false },
  ],
  'Office Supplies': [
    { name: 'Paper A4 500 Sheets', basePrice: 8, variation: 3, isUnique: false },
    { name: 'Pen Blue (Box 50)', basePrice: 15, variation: 8, isUnique: false },
    { name: 'Pen Black (Box 50)', basePrice: 15, variation: 8, isUnique: false },
    { name: 'Marker Permanent (Pack 12)', basePrice: 12, variation: 6, isUnique: false },
    { name: 'Stapler Heavy Duty', basePrice: 20, variation: 10, isUnique: false },
    { name: 'Staples (Box 5000)', basePrice: 5, variation: 2, isUnique: false },
    { name: 'Paper Clips (Box 1000)', basePrice: 4, variation: 2, isUnique: false },
    { name: 'Binder Clips Assorted', basePrice: 8, variation: 4, isUnique: false },
    { name: 'Folders Manila (Pack 100)', basePrice: 25, variation: 15, isUnique: false },
    { name: 'Notebook Spiral A5', basePrice: 3, variation: 2, isUnique: false },
  ],
  'Computer Components': [
    { name: 'RAM DDR4 16GB', basePrice: 80, variation: 40, isUnique: false },
    { name: 'RAM DDR4 32GB', basePrice: 150, variation: 70, isUnique: false },
    { name: 'SSD NVMe 512GB', basePrice: 70, variation: 40, isUnique: false },
    { name: 'SSD NVMe 1TB', basePrice: 120, variation: 60, isUnique: false },
    { name: 'HDD 2TB 7200RPM', basePrice: 60, variation: 30, isUnique: false },
    { name: 'Graphics Card GTX 1660', basePrice: 300, variation: 150, isUnique: false },
    { name: 'Graphics Card RTX 3060', basePrice: 500, variation: 250, isUnique: false },
    { name: 'Processor Intel i5', basePrice: 250, variation: 100, isUnique: false },
    { name: 'Processor Intel i7', basePrice: 400, variation: 150, isUnique: false },
    { name: 'Motherboard ATX', basePrice: 200, variation: 100, isUnique: false },
  ],
  Accessories: [
    { name: 'USB Cable Type-C 2m', basePrice: 10, variation: 5, isUnique: false },
    { name: 'HDMI Cable 3m', basePrice: 15, variation: 8, isUnique: false },
    { name: 'Power Strip 6 Outlet', basePrice: 25, variation: 15, isUnique: false },
    { name: 'Laptop Stand Aluminum', basePrice: 40, variation: 25, isUnique: false },
    { name: 'Monitor Arm Dual', basePrice: 80, variation: 50, isUnique: false },
    { name: 'Cable Management Box', basePrice: 20, variation: 10, isUnique: false },
    { name: 'Desk Organizer', basePrice: 15, variation: 10, isUnique: false },
    { name: 'Mouse Pad RGB', basePrice: 30, variation: 20, isUnique: false },
    { name: 'Laptop Sleeve 15"', basePrice: 25, variation: 15, isUnique: false },
    { name: 'Phone Holder Adjustable', basePrice: 12, variation: 8, isUnique: false },
  ],
};

function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomPrice(basePrice: number, variation: number): number {
  return Number((basePrice + (Math.random() * variation * 2 - variation)).toFixed(2));
}

function getStatus(quantity: number, minQuantity: number): InventoryStatus {
  if (quantity === 0) return InventoryStatus.OUT_OF_STOCK;
  if (quantity <= minQuantity) return InventoryStatus.LOW_STOCK;
  return InventoryStatus.IN_STOCK;
}

function generateServiceTag(): string {
  const prefix = getRandomElement(['DEL', 'HP', 'LEN', 'ASUS', 'ACER']);
  const numbers = String(getRandomInt(100000, 999999));
  const suffix = String.fromCharCode(65 + getRandomInt(0, 25)) + String.fromCharCode(65 + getRandomInt(0, 25));
  return `${prefix}${numbers}${suffix}`;
}

function generateSerialNumber(): string {
  const parts = [
    String(getRandomInt(1000, 9999)),
    String(getRandomInt(1000, 9999)),
    String(getRandomInt(1000, 9999)),
  ];
  return parts.join('-');
}

async function main() {
  console.log('🌱 Starting seed...');

  // Clear existing data in correct order
  await prisma.auditLog.deleteMany();
  await prisma.transactionItem.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.user.deleteMany();
  console.log('🗑️  Cleared existing data');

  // Create warehouses
  const warehouses = [];
  for (const whData of warehouseData) {
    const warehouse = await prisma.warehouse.create({
      data: whData,
    });
    warehouses.push(warehouse);
  }
  console.log(`✅ Created ${warehouses.length} warehouses`);

  // Create suppliers
  const suppliers = [];
  for (const suppData of supplierData) {
    const supplier = await prisma.supplier.create({
      data: suppData,
    });
    suppliers.push(supplier);
  }
  console.log(`✅ Created ${suppliers.length} suppliers`);

  // Create external users for assignments
  const externalUsers = [];
  for (const userData of externalUserData) {
    const user = await prisma.user.create({
      data: {
        ...userData,
        password: 'not-used', // External users don't login
      },
    });
    externalUsers.push(user);
  }
  console.log(`✅ Created ${externalUsers.length} external users`);

  // Create inventory items
  let uniqueItemsCreated = 0;
  let bulkItemsCreated = 0;
  let assignedItemsCount = 0;

  for (let i = 0; i < 200; i++) {
    const category = getRandomElement(categories);
    const productList = products[category];
    const product = getRandomElement(productList);

    const warehouse = getRandomElement(warehouses);
    const itemType = product.isUnique ? ItemType.UNIQUE : ItemType.BULK;

    // For UNIQUE items, quantity is always 1
    const quantity = itemType === ItemType.UNIQUE ? 1 : getRandomInt(0, 200);
    const minQuantity = itemType === ItemType.UNIQUE ? 1 : getRandomInt(5, 25);
    const status = getStatus(quantity, minQuantity);

    // 70% chance of having a supplier
    const supplier = Math.random() > 0.3 ? getRandomElement(suppliers) : null;

    // Randomly assign currency (50% USD, 50% HNL)
    const currency = Math.random() > 0.5 ? Currency.USD : Currency.HNL;

    // Calculate price based on currency
    let price: number;
    if (currency === Currency.USD) {
      price = getRandomPrice(product.basePrice, product.variation);
    } else {
      const priceUSD = getRandomPrice(product.basePrice, product.variation);
      price = Number((priceUSD / HNL_TO_USD_RATE).toFixed(2));
    }

    // Generate variant name
    const variants = ['Pro', 'Plus', 'Standard', 'Premium', 'Basic', 'Elite', 'Max'];
    const colors = ['Black', 'White', 'Silver', 'Gray', 'Blue'];
    const hasVariant = Math.random() > 0.5;
    const hasColor = Math.random() > 0.6;

    let name = product.name;
    if (hasVariant && !name.includes('Box') && !name.includes('Pack')) {
      name += ` ${getRandomElement(variants)}`;
    }
    if (hasColor && category === 'Furniture') {
      name += ` ${getRandomElement(colors)}`;
    }

    // Generate SKU
    const categoryPrefix = category.substring(0, 3).toUpperCase();
    const sku = `${categoryPrefix}-${String(i + 1).padStart(4, '0')}`;

    // Random barcode (some items have it, some don't)
    const barcode = Math.random() > 0.3 ? `${getRandomInt(100000000, 999999999)}${getRandomInt(100, 999)}` : null;

    const description = `${name} - High quality ${category.toLowerCase()} item for office and business use`;

    // For UNIQUE items, generate service tag or serial number
    const serviceTag = itemType === ItemType.UNIQUE ? generateServiceTag() : null;
    const serialNumber = itemType === ItemType.UNIQUE && !serviceTag ? generateSerialNumber() : null;

    // For some UNIQUE items in stock, assign them to users (40% chance)
    const assignedUser = itemType === ItemType.UNIQUE && status === InventoryStatus.IN_STOCK && Math.random() > 0.6
      ? getRandomElement(externalUsers)
      : null;

    if (assignedUser) {
      assignedItemsCount++;
    }

    await prisma.inventoryItem.create({
      data: {
        name,
        description,
        quantity,
        minQuantity,
        category,
        status,
        price,
        currency,
        sku,
        barcode,
        itemType,
        serviceTag,
        serialNumber,
        warehouseId: warehouse.id,
        supplierId: supplier?.id,
        assignedToUserId: assignedUser?.id,
        assignedAt: assignedUser ? new Date() : null,
      },
    });

    if (itemType === ItemType.UNIQUE) {
      uniqueItemsCreated++;
    } else {
      bulkItemsCreated++;
    }
  }

  console.log(`✅ Created 200 inventory items:`);
  console.log(`   - UNIQUE items: ${uniqueItemsCreated}`);
  console.log(`   - BULK items: ${bulkItemsCreated}`);
  console.log(`   - Assigned items: ${assignedItemsCount}`);

  // Show stats
  const stats = await prisma.inventoryItem.groupBy({
    by: ['category'],
    _count: { category: true },
  });

  console.log('\n📊 Items by category:');
  stats.forEach(stat => {
    console.log(`   ${stat.category}: ${stat._count.category} items`);
  });

  const statusStats = await prisma.inventoryItem.groupBy({
    by: ['status'],
    _count: { status: true },
  });

  console.log('\n📈 Items by status:');
  statusStats.forEach(stat => {
    console.log(`   ${stat.status}: ${stat._count.status} items`);
  });

  const warehouseStats = await prisma.inventoryItem.groupBy({
    by: ['warehouseId'],
    _count: { warehouseId: true },
  });

  console.log('\n🏢 Items by warehouse:');
  for (const stat of warehouseStats) {
    const warehouse = warehouses.find(w => w.id === stat.warehouseId);
    console.log(`   ${warehouse?.name}: ${stat._count.warehouseId} items`);
  }

  console.log('\n🎉 Seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
