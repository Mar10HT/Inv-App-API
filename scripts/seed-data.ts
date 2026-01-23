import { PrismaClient, InventoryStatus, Currency, ItemType, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ============================================
// Configuration
// ============================================

const HNL_TO_USD_RATE = 0.04; // 1 HNL ≈ 0.04 USD

// ============================================
// Data Definitions
// ============================================

const categoriesData = [
  { name: 'Electronics', description: 'Electronic devices and equipment' },
  { name: 'Furniture', description: 'Office and workspace furniture' },
  { name: 'Hardware', description: 'Tools, screws, and hardware supplies' },
  { name: 'Office Supplies', description: 'Paper, pens, and general office items' },
  { name: 'Computer Components', description: 'RAM, storage, processors, and PC parts' },
  { name: 'Accessories', description: 'Cables, stands, and peripheral accessories' },
];

const warehousesData = [
  {
    name: 'Bodega Principal',
    location: 'Tegucigalpa Centro',
    description: 'Bodega principal - Electrónicos y componentes',
    primaryCategories: ['Electronics', 'Computer Components'],
    weight: 40, // 40% de items van aquí
  },
  {
    name: 'Bodega Norte',
    location: 'San Pedro Sula',
    description: 'Bodega regional norte - Muebles y accesorios',
    primaryCategories: ['Furniture', 'Accessories', 'Office Supplies'],
    weight: 35,
  },
  {
    name: 'Bodega Sur',
    location: 'Choluteca',
    description: 'Bodega regional sur - Ferretería y suministros',
    primaryCategories: ['Hardware', 'Office Supplies'],
    weight: 25,
  },
];

const suppliersData = [
  {
    name: 'Tech Solutions HN',
    location: 'Tegucigalpa',
    phone: '+504 2222-1111',
    email: 'ventas@techsolutions.hn',
    categories: ['Electronics', 'Computer Components'], // Especialidad
  },
  {
    name: 'Office Depot Honduras',
    location: 'San Pedro Sula',
    phone: '+504 2550-3333',
    email: 'info@officedepot.hn',
    categories: ['Office Supplies', 'Furniture'],
  },
  {
    name: 'Ferretería El Martillo',
    location: 'Tegucigalpa',
    phone: '+504 2232-4444',
    email: 'ventas@elmartillo.hn',
    categories: ['Hardware'],
  },
  {
    name: 'Distribuidora Central',
    location: 'Comayagua',
    phone: '+504 2770-5555',
    email: 'ventas@distcentral.hn',
    categories: ['Accessories', 'Office Supplies'],
  },
  {
    name: 'CompuMax Honduras',
    location: 'San Pedro Sula',
    phone: '+504 2551-6666',
    email: 'info@compumax.hn',
    categories: ['Electronics', 'Computer Components', 'Accessories'],
  },
  {
    name: 'Muebles y Más',
    location: 'Tegucigalpa',
    phone: '+504 2235-7777',
    email: 'ventas@mueblesymas.hn',
    categories: ['Furniture'],
  },
];

const usersData = [
  { name: 'System Administrator', email: 'admin@example.com', role: UserRole.SYSTEM_ADMIN },
  { name: 'Warehouse Manager', email: 'manager@example.com', role: UserRole.WAREHOUSE_MANAGER },
  { name: 'Regular User', email: 'user@example.com', role: UserRole.USER },
  { name: 'Viewer User', email: 'viewer@example.com', role: UserRole.VIEWER },
  { name: 'Carlos Martinez', email: 'carlos.m@external.hn', role: UserRole.EXTERNAL },
  { name: 'Ana Lopez', email: 'ana.l@external.hn', role: UserRole.EXTERNAL },
  { name: 'Roberto Sanchez', email: 'roberto.s@external.hn', role: UserRole.EXTERNAL },
  { name: 'Maria Fernandez', email: 'maria.f@external.hn', role: UserRole.EXTERNAL },
];

type ProductDef = {
  name: string;
  basePrice: number;
  variation: number;
  isUnique: boolean;
};

const productsByCategory: Record<string, ProductDef[]> = {
  Electronics: [
    { name: 'Laptop Dell XPS 15', basePrice: 1200, variation: 500, isUnique: true },
    { name: 'Laptop HP Pavilion', basePrice: 800, variation: 300, isUnique: true },
    { name: 'PC Desktop Dell OptiPlex', basePrice: 900, variation: 400, isUnique: true },
    { name: 'Monitor Samsung 27"', basePrice: 300, variation: 200, isUnique: true },
    { name: 'Monitor LG UltraWide 34"', basePrice: 500, variation: 300, isUnique: true },
    { name: 'Keyboard Mechanical RGB', basePrice: 120, variation: 80, isUnique: false },
    { name: 'Mouse Logitech MX Master', basePrice: 80, variation: 40, isUnique: false },
    { name: 'Webcam Logitech C920', basePrice: 100, variation: 50, isUnique: false },
    { name: 'Headset HyperX Cloud II', basePrice: 90, variation: 60, isUnique: false },
    { name: 'Tablet Samsung Galaxy Tab', basePrice: 400, variation: 300, isUnique: true },
    { name: 'Printer HP LaserJet', basePrice: 350, variation: 150, isUnique: true },
    { name: 'Scanner Epson', basePrice: 200, variation: 100, isUnique: true },
  ],
  Furniture: [
    { name: 'Office Chair Ergonomic', basePrice: 250, variation: 200, isUnique: false },
    { name: 'Standing Desk Electric', basePrice: 500, variation: 300, isUnique: false },
    { name: 'Conference Table 8-Person', basePrice: 800, variation: 500, isUnique: false },
    { name: 'Filing Cabinet 4-Drawer', basePrice: 150, variation: 100, isUnique: false },
    { name: 'Bookshelf 5-Tier', basePrice: 120, variation: 80, isUnique: false },
    { name: 'Office Desk L-Shape', basePrice: 400, variation: 250, isUnique: false },
    { name: 'Reception Desk', basePrice: 600, variation: 400, isUnique: false },
    { name: 'Executive Chair Leather', basePrice: 450, variation: 300, isUnique: false },
    { name: 'Meeting Room Chair', basePrice: 180, variation: 120, isUnique: false },
    { name: 'Storage Cabinet Metal', basePrice: 200, variation: 150, isUnique: false },
  ],
  Hardware: [
    { name: 'Screws Phillips M4x20mm (Box 100)', basePrice: 5, variation: 3, isUnique: false },
    { name: 'Screws Flathead M5x30mm (Box 100)', basePrice: 6, variation: 3, isUnique: false },
    { name: 'Bolts Hex M8x40mm (Box 50)', basePrice: 12, variation: 5, isUnique: false },
    { name: 'Nuts Hex M8 (Box 100)', basePrice: 8, variation: 4, isUnique: false },
    { name: 'Washers M8 (Box 200)', basePrice: 5, variation: 2, isUnique: false },
    { name: 'Wall Anchors Plastic (Box 50)', basePrice: 4, variation: 2, isUnique: false },
    { name: 'Drill Bits Set HSS 10pc', basePrice: 35, variation: 20, isUnique: false },
    { name: 'Hammer Claw 16oz', basePrice: 25, variation: 15, isUnique: false },
    { name: 'Screwdriver Set Professional 10pc', basePrice: 30, variation: 20, isUnique: false },
    { name: 'Pliers Set 3pc', basePrice: 40, variation: 25, isUnique: false },
    { name: 'Tape Measure 5m', basePrice: 10, variation: 5, isUnique: false },
    { name: 'Level Tool 24"', basePrice: 20, variation: 10, isUnique: false },
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
    { name: 'Sticky Notes (Pack 12)', basePrice: 10, variation: 5, isUnique: false },
    { name: 'Whiteboard Markers (Pack 8)', basePrice: 15, variation: 8, isUnique: false },
  ],
  'Computer Components': [
    { name: 'RAM DDR4 16GB', basePrice: 80, variation: 40, isUnique: false },
    { name: 'RAM DDR4 32GB', basePrice: 150, variation: 70, isUnique: false },
    { name: 'SSD NVMe 512GB', basePrice: 70, variation: 40, isUnique: false },
    { name: 'SSD NVMe 1TB', basePrice: 120, variation: 60, isUnique: false },
    { name: 'HDD 2TB 7200RPM', basePrice: 60, variation: 30, isUnique: false },
    { name: 'Graphics Card GTX 1660', basePrice: 300, variation: 150, isUnique: false },
    { name: 'Graphics Card RTX 4060', basePrice: 500, variation: 250, isUnique: false },
    { name: 'Processor Intel i5-13400', basePrice: 250, variation: 100, isUnique: false },
    { name: 'Processor Intel i7-13700', basePrice: 400, variation: 150, isUnique: false },
    { name: 'Motherboard ATX B660', basePrice: 200, variation: 100, isUnique: false },
    { name: 'Power Supply 650W 80+ Gold', basePrice: 100, variation: 50, isUnique: false },
    { name: 'CPU Cooler Tower', basePrice: 50, variation: 30, isUnique: false },
  ],
  Accessories: [
    { name: 'USB Cable Type-C 2m', basePrice: 10, variation: 5, isUnique: false },
    { name: 'HDMI Cable 3m', basePrice: 15, variation: 8, isUnique: false },
    { name: 'Power Strip 6 Outlet', basePrice: 25, variation: 15, isUnique: false },
    { name: 'Laptop Stand Aluminum', basePrice: 40, variation: 25, isUnique: false },
    { name: 'Monitor Arm Dual', basePrice: 80, variation: 50, isUnique: false },
    { name: 'Cable Management Box', basePrice: 20, variation: 10, isUnique: false },
    { name: 'Desk Organizer', basePrice: 15, variation: 10, isUnique: false },
    { name: 'Mouse Pad XL', basePrice: 30, variation: 20, isUnique: false },
    { name: 'Laptop Sleeve 15"', basePrice: 25, variation: 15, isUnique: false },
    { name: 'Phone Holder Adjustable', basePrice: 12, variation: 8, isUnique: false },
    { name: 'USB Hub 7-Port', basePrice: 35, variation: 15, isUnique: false },
    { name: 'Ethernet Cable Cat6 5m', basePrice: 8, variation: 4, isUnique: false },
  ],
};

// ============================================
// Utility Functions
// ============================================

function random<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPrice(basePrice: number, variation: number): number {
  return Number((basePrice + (Math.random() * variation * 2 - variation)).toFixed(2));
}

function getStatus(quantity: number, minQuantity: number): InventoryStatus {
  if (quantity === 0) return InventoryStatus.OUT_OF_STOCK;
  if (quantity <= minQuantity) return InventoryStatus.LOW_STOCK;
  return InventoryStatus.IN_STOCK;
}

function generateServiceTag(): string {
  const prefixes = ['DEL', 'HP', 'LEN', 'ASUS', 'ACER', 'SAM', 'LG'];
  const prefix = random(prefixes);
  const numbers = String(randomInt(100000, 999999));
  const suffix = String.fromCharCode(65 + randomInt(0, 25)) + String.fromCharCode(65 + randomInt(0, 25));
  return `${prefix}${numbers}${suffix}`;
}

// Get best warehouse for a category (weighted selection)
function getWarehouseForCategory(categoryName: string, warehouses: any[]): any {
  // Find warehouses that have this category as primary
  const primaryWarehouses = warehouses.filter(w =>
    w.primaryCategories.includes(categoryName)
  );

  if (primaryWarehouses.length > 0) {
    // 80% chance to use a primary warehouse
    if (Math.random() < 0.8) {
      return random(primaryWarehouses);
    }
  }

  // Otherwise, weighted random selection
  const totalWeight = warehouses.reduce((sum, w) => sum + w.weight, 0);
  let rand = Math.random() * totalWeight;

  for (const warehouse of warehouses) {
    rand -= warehouse.weight;
    if (rand <= 0) return warehouse;
  }

  return warehouses[0];
}

// Get supplier for a category
function getSupplierForCategory(categoryName: string, suppliers: any[]): any | null {
  // Find suppliers that handle this category
  const categorySuppliers = suppliers.filter(s =>
    s.categories.includes(categoryName)
  );

  if (categorySuppliers.length === 0) {
    // No specialized supplier, 30% chance of random supplier
    return Math.random() > 0.7 ? random(suppliers) : null;
  }

  // 85% chance to have a supplier for this category
  if (Math.random() < 0.85) {
    return random(categorySuppliers);
  }

  return null;
}

// ============================================
// Main Seed Function
// ============================================

async function main() {
  console.log('🌱 Starting seed...\n');

  // ----------------------------------------
  // Clear all existing data
  // ----------------------------------------
  console.log('🗑️  Clearing existing data...');

  await prisma.stockTakeItem.deleteMany();
  await prisma.stockTake.deleteMany();
  await prisma.transferRequestItem.deleteMany();
  await prisma.transferRequest.deleteMany();
  await prisma.stockAlert.deleteMany();
  await prisma.loan.deleteMany();
  await prisma.transactionItem.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.category.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.user.deleteMany();

  console.log('   ✓ All tables cleared\n');

  // ----------------------------------------
  // Create Categories
  // ----------------------------------------
  console.log('📁 Creating categories...');
  const categories: Record<string, any> = {};

  for (const catData of categoriesData) {
    const category = await prisma.category.create({
      data: catData,
    });
    categories[category.name] = category;
  }
  console.log(`   ✓ Created ${Object.keys(categories).length} categories\n`);

  // ----------------------------------------
  // Create Warehouses
  // ----------------------------------------
  console.log('🏢 Creating warehouses...');
  const warehouses: any[] = [];

  for (const whData of warehousesData) {
    const warehouse = await prisma.warehouse.create({
      data: {
        name: whData.name,
        location: whData.location,
        description: whData.description,
      },
    });
    warehouses.push({
      ...warehouse,
      primaryCategories: whData.primaryCategories,
      weight: whData.weight,
    });
  }
  console.log(`   ✓ Created ${warehouses.length} warehouses\n`);

  // ----------------------------------------
  // Create Suppliers
  // ----------------------------------------
  console.log('🚚 Creating suppliers...');
  const suppliers: any[] = [];

  for (const suppData of suppliersData) {
    const supplier = await prisma.supplier.create({
      data: {
        name: suppData.name,
        location: suppData.location,
        phone: suppData.phone,
        email: suppData.email,
      },
    });
    suppliers.push({
      ...supplier,
      categories: suppData.categories,
    });
  }
  console.log(`   ✓ Created ${suppliers.length} suppliers\n`);

  // ----------------------------------------
  // Create Users
  // ----------------------------------------
  console.log('👥 Creating users...');
  const hashedPassword = await bcrypt.hash('password123', 10);
  const users: any[] = [];
  const externalUsers: any[] = [];

  for (const userData of usersData) {
    const user = await prisma.user.create({
      data: {
        ...userData,
        password: hashedPassword,
      },
    });
    users.push(user);
    if (userData.role === UserRole.EXTERNAL) {
      externalUsers.push(user);
    }
  }
  console.log(`   ✓ Created ${users.length} users (${externalUsers.length} external)\n`);

  // ----------------------------------------
  // Create Inventory Items
  // ----------------------------------------
  console.log('📦 Creating inventory items...');

  let uniqueCount = 0;
  let bulkCount = 0;
  let assignedCount = 0;
  let itemIndex = 0;

  const categoryNames = Object.keys(productsByCategory);

  for (let i = 0; i < 200; i++) {
    const categoryName = random(categoryNames);
    const category = categories[categoryName];
    const productList = productsByCategory[categoryName];
    const product = random(productList);

    // Get warehouse based on category (smart assignment)
    const warehouse = getWarehouseForCategory(categoryName, warehouses);
    const itemType = product.isUnique ? ItemType.UNIQUE : ItemType.BULK;

    // Quantity based on item type
    const quantity = itemType === ItemType.UNIQUE ? 1 : randomInt(0, 150);
    const minQuantity = itemType === ItemType.UNIQUE ? 1 : randomInt(5, 20);
    const status = getStatus(quantity, minQuantity);

    // Get supplier based on category (smart assignment)
    const supplier = getSupplierForCategory(categoryName, suppliers);

    // Currency and price
    const currency = Math.random() > 0.5 ? Currency.USD : Currency.HNL;
    let price: number;
    if (currency === Currency.USD) {
      price = randomPrice(product.basePrice, product.variation);
    } else {
      const priceUSD = randomPrice(product.basePrice, product.variation);
      price = Number((priceUSD / HNL_TO_USD_RATE).toFixed(2));
    }

    // Generate unique name with variant
    const variants = ['Pro', 'Plus', 'Standard', 'Premium', 'Basic', 'Elite'];
    let name = product.name;
    if (Math.random() > 0.6 && !name.includes('Box') && !name.includes('Pack')) {
      name += ` ${random(variants)}`;
    }

    // Generate SKU
    const categoryPrefix = categoryName.substring(0, 3).toUpperCase();
    const sku = `${categoryPrefix}-${String(++itemIndex).padStart(4, '0')}`;

    // Optional barcode
    const barcode = Math.random() > 0.3
      ? `${randomInt(100000000, 999999999)}${randomInt(100, 999)}`
      : null;

    // Service tag for unique items
    const serviceTag = itemType === ItemType.UNIQUE ? generateServiceTag() : null;

    // Assign some unique items to external users
    const assignedUser = itemType === ItemType.UNIQUE &&
      status === InventoryStatus.IN_STOCK &&
      Math.random() > 0.6
        ? random(externalUsers)
        : null;

    if (assignedUser) assignedCount++;

    await prisma.inventoryItem.create({
      data: {
        name,
        description: `${name} - Quality ${categoryName.toLowerCase()} for office use`,
        quantity,
        minQuantity,
        category: categoryName, // Still storing category name for backwards compatibility
        categoryId: category.id, // New: linking to Category model
        status,
        price,
        currency,
        sku,
        barcode,
        itemType,
        serviceTag,
        warehouseId: warehouse.id,
        supplierId: supplier?.id,
        createdById: users[0].id, // Admin created all items
        assignedToUserId: assignedUser?.id,
        assignedAt: assignedUser ? new Date() : null,
      },
    });

    if (itemType === ItemType.UNIQUE) uniqueCount++;
    else bulkCount++;
  }

  console.log(`   ✓ Created 200 inventory items`);
  console.log(`     - Unique items: ${uniqueCount}`);
  console.log(`     - Bulk items: ${bulkCount}`);
  console.log(`     - Assigned to users: ${assignedCount}\n`);

  // ----------------------------------------
  // Print Statistics
  // ----------------------------------------
  console.log('📊 Statistics:\n');

  // By category
  const categoryStats = await prisma.inventoryItem.groupBy({
    by: ['category'],
    _count: { category: true },
  });
  console.log('   Items by category:');
  categoryStats.forEach(stat => {
    console.log(`     ${stat.category}: ${stat._count.category}`);
  });

  // By status
  const statusStats = await prisma.inventoryItem.groupBy({
    by: ['status'],
    _count: { status: true },
  });
  console.log('\n   Items by status:');
  statusStats.forEach(stat => {
    console.log(`     ${stat.status}: ${stat._count.status}`);
  });

  // By warehouse
  const warehouseStats = await prisma.inventoryItem.groupBy({
    by: ['warehouseId'],
    _count: { warehouseId: true },
  });
  console.log('\n   Items by warehouse:');
  for (const stat of warehouseStats) {
    const wh = warehouses.find(w => w.id === stat.warehouseId);
    console.log(`     ${wh?.name}: ${stat._count.warehouseId}`);
  }

  // By supplier
  const supplierStats = await prisma.inventoryItem.groupBy({
    by: ['supplierId'],
    _count: { supplierId: true },
  });
  console.log('\n   Items by supplier:');
  let noSupplierCount = 0;
  for (const stat of supplierStats) {
    if (stat.supplierId) {
      const supp = suppliers.find(s => s.id === stat.supplierId);
      console.log(`     ${supp?.name}: ${stat._count.supplierId}`);
    } else {
      noSupplierCount = stat._count.supplierId;
    }
  }
  if (noSupplierCount > 0) {
    console.log(`     (Sin proveedor): ${noSupplierCount}`);
  }

  // Cross-reference: Category by Warehouse
  console.log('\n   Category distribution by warehouse:');
  for (const wh of warehouses) {
    const whItems = await prisma.inventoryItem.groupBy({
      by: ['category'],
      where: { warehouseId: wh.id },
      _count: { category: true },
    });
    console.log(`     ${wh.name}:`);
    whItems.forEach(item => {
      console.log(`       - ${item.category}: ${item._count.category}`);
    });
  }

  // ----------------------------------------
  // Done
  // ----------------------------------------
  console.log('\n✅ Seed completed successfully!');
  console.log('\n📝 Login credentials:');
  console.log('   Admin: admin@example.com / password123');
  console.log('   Manager: manager@example.com / password123');
  console.log('   User: user@example.com / password123');
  console.log('   Viewer: viewer@example.com / password123');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
