import {
  PrismaClient,
  InventoryStatus,
  Currency,
  ItemType,
  UserRole,
  LoanStatus,
  RequestStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ============================================
// Configuration
// ============================================

const HNL_TO_USD_RATE = 0.04;

// ============================================
// Data Definitions
// ============================================

const categoriesData = [
  { name: 'Electronics',         description: 'Electronic devices and equipment' },
  { name: 'Furniture',           description: 'Office and workspace furniture' },
  { name: 'Hardware',            description: 'Tools, screws, and hardware supplies' },
  { name: 'Office Supplies',     description: 'Paper, pens, and general office items' },
  { name: 'Computer Components', description: 'RAM, storage, processors, and PC parts' },
  { name: 'Accessories',         description: 'Cables, stands, and peripheral accessories' },
  { name: 'Networking',          description: 'Routers, switches, and network equipment' },
  { name: 'Cleaning',            description: 'Cleaning products and janitorial supplies' },
];

const warehousesData = [
  {
    name: 'Bodega Principal',
    location: 'Tegucigalda Centro',
    description: 'Bodega principal — Electrónicos y componentes',
    primaryCategories: ['Electronics', 'Computer Components', 'Networking'],
    weight: 40,
  },
  {
    name: 'Bodega Norte',
    location: 'San Pedro Sula',
    description: 'Bodega regional norte — Muebles y accesorios',
    primaryCategories: ['Furniture', 'Accessories', 'Office Supplies'],
    weight: 30,
  },
  {
    name: 'Bodega Sur',
    location: 'Choluteca',
    description: 'Bodega regional sur — Ferretería y suministros',
    primaryCategories: ['Hardware', 'Office Supplies', 'Cleaning'],
    weight: 20,
  },
  {
    name: 'Bodega Atlántida',
    location: 'La Ceiba',
    description: 'Bodega costa atlántica — Suministros generales',
    primaryCategories: ['Office Supplies', 'Accessories', 'Cleaning'],
    weight: 10,
  },
];

const suppliersData = [
  {
    name: 'Tech Solutions HN',
    location: 'Tegucigalda',
    phone: '+504 2222-1111',
    email: 'ventas@techsolutions.hn',
    categories: ['Electronics', 'Computer Components'],
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
    location: 'Tegucigalda',
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
    categories: ['Electronics', 'Computer Components', 'Accessories', 'Networking'],
  },
  {
    name: 'Muebles y Más',
    location: 'Tegucigalda',
    phone: '+504 2235-7777',
    email: 'ventas@mueblesymas.hn',
    categories: ['Furniture'],
  },
  {
    name: 'NetPro Honduras',
    location: 'San Pedro Sula',
    phone: '+504 2553-8888',
    email: 'ventas@netpro.hn',
    categories: ['Networking'],
  },
  {
    name: 'Suministros Limpios',
    location: 'Tegucigalda',
    phone: '+504 2240-9999',
    email: 'info@suministroslimpios.hn',
    categories: ['Cleaning'],
  },
];

const usersData = [
  { name: 'System Administrator',  email: 'admin@example.com',       role: UserRole.SYSTEM_ADMIN },
  { name: 'Ana Reyes',             email: 'ana.reyes@obsid.hn',      role: UserRole.WAREHOUSE_MANAGER },
  { name: 'Luis Mendoza',          email: 'luis.m@obsid.hn',         role: UserRole.WAREHOUSE_MANAGER },
  { name: 'Carmen Flores',         email: 'carmen.f@obsid.hn',       role: UserRole.USER },
  { name: 'Jorge Espinal',         email: 'jorge.e@obsid.hn',        role: UserRole.USER },
  { name: 'Sofía Núñez',          email: 'sofia.n@obsid.hn',        role: UserRole.USER },
  { name: 'Ricardo Alvarado',      email: 'ricardo.a@obsid.hn',      role: UserRole.VIEWER },
  { name: 'Daniela Cruz',          email: 'daniela.c@obsid.hn',      role: UserRole.VIEWER },
  { name: 'Carlos Martínez',       email: 'carlos.m@external.hn',    role: UserRole.EXTERNAL },
  { name: 'Mariana López',         email: 'mariana.l@external.hn',   role: UserRole.EXTERNAL },
  { name: 'Pedro Sánchez',         email: 'pedro.s@external.hn',     role: UserRole.EXTERNAL },
  { name: 'Valeria Ortega',        email: 'valeria.o@external.hn',   role: UserRole.EXTERNAL },
  { name: 'Héctor Villanueva',     email: 'hector.v@external.hn',    role: UserRole.EXTERNAL },
];

type ProductDef = {
  name: string;
  basePrice: number;
  variation: number;
  isUnique: boolean;
};

const productsByCategory: Record<string, ProductDef[]> = {
  Electronics: [
    { name: 'Laptop Dell XPS 15',          basePrice: 1200, variation: 500,  isUnique: true  },
    { name: 'Laptop HP ProBook 450 G10',   basePrice: 950,  variation: 300,  isUnique: true  },
    { name: 'Laptop Lenovo ThinkPad E15',  basePrice: 880,  variation: 300,  isUnique: true  },
    { name: 'MacBook Pro 14"',             basePrice: 2000, variation: 500,  isUnique: true  },
    { name: 'PC Desktop Dell OptiPlex',    basePrice: 900,  variation: 400,  isUnique: true  },
    { name: 'PC All-in-One HP',            basePrice: 750,  variation: 300,  isUnique: true  },
    { name: 'Monitor Samsung 27"',         basePrice: 300,  variation: 200,  isUnique: false },
    { name: 'Monitor LG UltraWide 34"',   basePrice: 500,  variation: 300,  isUnique: false },
    { name: 'Keyboard Mechanical RGB',     basePrice: 120,  variation: 80,   isUnique: false },
    { name: 'Mouse Logitech MX Master',    basePrice: 80,   variation: 40,   isUnique: false },
    { name: 'Webcam Logitech C920',        basePrice: 100,  variation: 50,   isUnique: false },
    { name: 'Headset HyperX Cloud II',     basePrice: 90,   variation: 60,   isUnique: false },
    { name: 'Tablet Samsung Galaxy Tab',   basePrice: 400,  variation: 300,  isUnique: true  },
    { name: 'Printer HP LaserJet Pro',     basePrice: 350,  variation: 150,  isUnique: true  },
    { name: 'UPS APC 650VA',              basePrice: 80,   variation: 30,   isUnique: false },
  ],
  Furniture: [
    { name: 'Office Chair Ergonomic',      basePrice: 250, variation: 200, isUnique: false },
    { name: 'Standing Desk Electric',      basePrice: 500, variation: 300, isUnique: false },
    { name: 'Conference Table 8-Person',   basePrice: 800, variation: 500, isUnique: false },
    { name: 'Filing Cabinet 4-Drawer',     basePrice: 150, variation: 100, isUnique: false },
    { name: 'Bookshelf 5-Tier',            basePrice: 120, variation: 80,  isUnique: false },
    { name: 'Office Desk L-Shape',         basePrice: 400, variation: 250, isUnique: false },
    { name: 'Reception Desk',              basePrice: 600, variation: 400, isUnique: false },
    { name: 'Executive Chair Leather',     basePrice: 450, variation: 300, isUnique: false },
    { name: 'Meeting Room Chair',          basePrice: 180, variation: 120, isUnique: false },
    { name: 'Storage Cabinet Metal',       basePrice: 200, variation: 150, isUnique: false },
    { name: 'Locker 6-Compartment',        basePrice: 300, variation: 180, isUnique: false },
  ],
  Hardware: [
    { name: 'Screws Phillips M4x20 (Box 100)', basePrice: 5,  variation: 3,  isUnique: false },
    { name: 'Bolts Hex M8x40 (Box 50)',         basePrice: 12, variation: 5,  isUnique: false },
    { name: 'Drill Bits Set HSS 10pc',          basePrice: 35, variation: 20, isUnique: false },
    { name: 'Hammer Claw 16oz',                 basePrice: 25, variation: 15, isUnique: false },
    { name: 'Screwdriver Set 10pc',             basePrice: 30, variation: 20, isUnique: false },
    { name: 'Pliers Set 3pc',                   basePrice: 40, variation: 25, isUnique: false },
    { name: 'Tape Measure 5m',                  basePrice: 10, variation: 5,  isUnique: false },
    { name: 'Level Tool 24"',                   basePrice: 20, variation: 10, isUnique: false },
    { name: 'Wall Anchors (Box 50)',             basePrice: 4,  variation: 2,  isUnique: false },
    { name: 'Cable Ties 100pc',                 basePrice: 6,  variation: 3,  isUnique: false },
  ],
  'Office Supplies': [
    { name: 'Paper A4 500 Sheets',             basePrice: 8,  variation: 3,  isUnique: false },
    { name: 'Pen Blue (Box 50)',               basePrice: 15, variation: 8,  isUnique: false },
    { name: 'Marker Permanent (Pack 12)',       basePrice: 12, variation: 6,  isUnique: false },
    { name: 'Stapler Heavy Duty',              basePrice: 20, variation: 10, isUnique: false },
    { name: 'Staples (Box 5000)',              basePrice: 5,  variation: 2,  isUnique: false },
    { name: 'Folders Manila (Pack 100)',        basePrice: 25, variation: 15, isUnique: false },
    { name: 'Notebook Spiral A5',              basePrice: 3,  variation: 2,  isUnique: false },
    { name: 'Sticky Notes (Pack 12)',          basePrice: 10, variation: 5,  isUnique: false },
    { name: 'Whiteboard Markers (Pack 8)',     basePrice: 15, variation: 8,  isUnique: false },
    { name: 'Calculator Casio Scientific',     basePrice: 25, variation: 15, isUnique: false },
    { name: 'Tape Dispenser + Rolls 3pk',      basePrice: 12, variation: 5,  isUnique: false },
  ],
  'Computer Components': [
    { name: 'RAM DDR4 16GB',                  basePrice: 80,  variation: 40,  isUnique: false },
    { name: 'RAM DDR4 32GB',                  basePrice: 150, variation: 70,  isUnique: false },
    { name: 'SSD NVMe 512GB',                 basePrice: 70,  variation: 40,  isUnique: false },
    { name: 'SSD NVMe 1TB',                   basePrice: 120, variation: 60,  isUnique: false },
    { name: 'HDD 2TB 7200RPM',               basePrice: 60,  variation: 30,  isUnique: false },
    { name: 'Graphics Card RTX 4060',         basePrice: 500, variation: 250, isUnique: false },
    { name: 'Processor Intel i5-13400',       basePrice: 250, variation: 100, isUnique: false },
    { name: 'Processor Intel i7-13700',       basePrice: 400, variation: 150, isUnique: false },
    { name: 'Motherboard ATX B660',           basePrice: 200, variation: 100, isUnique: false },
    { name: 'Power Supply 650W 80+ Gold',     basePrice: 100, variation: 50,  isUnique: false },
    { name: 'CPU Cooler Tower',               basePrice: 50,  variation: 30,  isUnique: false },
  ],
  Accessories: [
    { name: 'USB Cable Type-C 2m',            basePrice: 10, variation: 5,  isUnique: false },
    { name: 'HDMI Cable 3m',                  basePrice: 15, variation: 8,  isUnique: false },
    { name: 'Power Strip 6 Outlet',           basePrice: 25, variation: 15, isUnique: false },
    { name: 'Laptop Stand Aluminum',          basePrice: 40, variation: 25, isUnique: false },
    { name: 'Monitor Arm Dual',               basePrice: 80, variation: 50, isUnique: false },
    { name: 'Mouse Pad XL',                   basePrice: 30, variation: 20, isUnique: false },
    { name: 'Laptop Sleeve 15"',             basePrice: 25, variation: 15, isUnique: false },
    { name: 'USB Hub 7-Port',                 basePrice: 35, variation: 15, isUnique: false },
    { name: 'Ethernet Cable Cat6 5m',         basePrice: 8,  variation: 4,  isUnique: false },
    { name: 'KVM Switch 2-Port',              basePrice: 45, variation: 20, isUnique: false },
    { name: 'Docking Station USB-C',          basePrice: 90, variation: 40, isUnique: false },
  ],
  Networking: [
    { name: 'Router Mikrotik hEX',            basePrice: 80,  variation: 40,  isUnique: false },
    { name: 'Switch TP-Link 24-Port',         basePrice: 200, variation: 100, isUnique: false },
    { name: 'Access Point Ubiquiti UAP',      basePrice: 120, variation: 60,  isUnique: false },
    { name: 'Patch Panel 24-Port Cat6',       basePrice: 60,  variation: 30,  isUnique: false },
    { name: 'Cat6 Cable 305m Box',            basePrice: 90,  variation: 30,  isUnique: false },
    { name: 'RJ45 Keystone Jack (Pack 25)',   basePrice: 20,  variation: 10,  isUnique: false },
    { name: 'SFP Module 1G Multimode',        basePrice: 30,  variation: 15,  isUnique: false },
    { name: 'Rack Cabinet 12U Wall-Mount',    basePrice: 180, variation: 80,  isUnique: false },
  ],
  Cleaning: [
    { name: 'Screen Cleaning Kit',            basePrice: 8,  variation: 4,  isUnique: false },
    { name: 'Compressed Air Can',             basePrice: 5,  variation: 2,  isUnique: false },
    { name: 'Microfiber Cloths (Pack 10)',    basePrice: 12, variation: 5,  isUnique: false },
    { name: 'All-Purpose Cleaner 1L',         basePrice: 6,  variation: 3,  isUnique: false },
    { name: 'Hand Sanitizer 500ml',           basePrice: 5,  variation: 2,  isUnique: false },
    { name: 'Trash Bags (Roll 50)',           basePrice: 8,  variation: 4,  isUnique: false },
    { name: 'Mop Set Complete',               basePrice: 20, variation: 10, isUnique: false },
    { name: 'Disinfectant Spray 750ml',       basePrice: 7,  variation: 3,  isUnique: false },
  ],
};

const transactionNotes = [
  'Monthly stock replenishment',
  'Emergency restock from supplier',
  'Quarterly inventory rebalance',
  'New project equipment delivery',
  'Returned items from field team',
  'End-of-year stock adjustment',
  'Damaged goods removal',
  'Branch opening supplies',
  'IT department upgrade batch',
  'Maintenance supply top-up',
  'Client project materials',
  null,
];

const loanNotes = [
  'Temporary loan for remote work setup',
  'Loan for external client project',
  'Field assignment — returned after mission',
  'Training session equipment',
  'Event setup — 3 days',
  'Audit team equipment',
  null,
];

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
  const prefixes = ['DEL', 'HP', 'LEN', 'ASUS', 'ACER', 'SAM', 'APL', 'MSI'];
  const prefix = random(prefixes);
  const numbers = String(randomInt(100000, 999999));
  const suffix =
    String.fromCharCode(65 + randomInt(0, 25)) +
    String.fromCharCode(65 + randomInt(0, 25));
  return `${prefix}${numbers}${suffix}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function getWarehouseForCategory(categoryName: string, warehouses: any[]): any {
  const primary = warehouses.filter(w => w.primaryCategories.includes(categoryName));
  if (primary.length > 0 && Math.random() < 0.8) return random(primary);
  const total = warehouses.reduce((s, w) => s + w.weight, 0);
  let r = Math.random() * total;
  for (const wh of warehouses) {
    r -= wh.weight;
    if (r <= 0) return wh;
  }
  return warehouses[0];
}

function getSupplierForCategory(categoryName: string, suppliers: any[]): any | null {
  const matched = suppliers.filter(s => s.categories.includes(categoryName));
  if (matched.length === 0) return Math.random() > 0.7 ? random(suppliers) : null;
  return Math.random() < 0.85 ? random(matched) : null;
}

// ============================================
// Main Seed Function
// ============================================

async function main() {
  console.log('🌱 Starting fake data seed...\n');

  // ----------------------------------------
  // Clear existing data
  // ----------------------------------------
  console.log('🗑️  Clearing existing data...');

  await prisma.stockTakeItem.deleteMany();
  await prisma.stockTake.deleteMany();
  await prisma.dischargeRequestItem.deleteMany();
  await prisma.dischargeRequest.deleteMany();
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
  // Categories
  // ----------------------------------------
  console.log('📁 Creating categories...');
  const categories: Record<string, any> = {};

  for (const catData of categoriesData) {
    const cat = await prisma.category.create({ data: catData });
    categories[cat.name] = cat;
  }
  console.log(`   ✓ ${Object.keys(categories).length} categories\n`);

  // ----------------------------------------
  // Warehouses
  // ----------------------------------------
  console.log('🏢 Creating warehouses...');
  const warehouses: any[] = [];

  for (const whData of warehousesData) {
    const wh = await prisma.warehouse.create({
      data: {
        name: whData.name,
        location: whData.location,
        description: whData.description,
      },
    });
    warehouses.push({ ...wh, primaryCategories: whData.primaryCategories, weight: whData.weight });
  }
  console.log(`   ✓ ${warehouses.length} warehouses\n`);

  // ----------------------------------------
  // Suppliers
  // ----------------------------------------
  console.log('🚚 Creating suppliers...');
  const suppliers: any[] = [];

  for (const suppData of suppliersData) {
    const supp = await prisma.supplier.create({
      data: {
        name: suppData.name,
        location: suppData.location,
        phone: suppData.phone,
        email: suppData.email,
      },
    });
    suppliers.push({ ...supp, categories: suppData.categories });
  }
  console.log(`   ✓ ${suppliers.length} suppliers\n`);

  // ----------------------------------------
  // Users
  // ----------------------------------------
  console.log('👥 Creating users...');
  const hashedPassword = await bcrypt.hash('password123', 10);
  const users: any[] = [];
  const internalUsers: any[] = [];
  const externalUsers: any[] = [];
  const managerUsers: any[] = [];

  for (const userData of usersData) {
    const user = await prisma.user.create({ data: { ...userData, password: hashedPassword } });
    users.push(user);
    if (userData.role === UserRole.EXTERNAL) externalUsers.push(user);
    else if (userData.role === UserRole.WAREHOUSE_MANAGER) managerUsers.push(user);
    else if (userData.role === UserRole.USER || userData.role === UserRole.SYSTEM_ADMIN) internalUsers.push(user);
  }
  console.log(`   ✓ ${users.length} users (${externalUsers.length} external, ${managerUsers.length} managers)\n`);

  const adminUser = users.find(u => u.role === UserRole.SYSTEM_ADMIN);

  // ----------------------------------------
  // Inventory Items
  // ----------------------------------------
  console.log('📦 Creating inventory items...');

  const categoryNames = Object.keys(productsByCategory);
  let itemIndex = 0;
  let uniqueCount = 0;
  let bulkCount = 0;
  const createdItems: any[] = [];

  // Create 250 items for richer transaction/loan data
  for (let i = 0; i < 250; i++) {
    const categoryName = random(categoryNames);
    const category = categories[categoryName];
    const product = random(productsByCategory[categoryName]);
    const warehouse = getWarehouseForCategory(categoryName, warehouses);
    const itemType = product.isUnique ? ItemType.UNIQUE : ItemType.BULK;

    const quantity = itemType === ItemType.UNIQUE ? 1 : randomInt(0, 200);
    const minQuantity = itemType === ItemType.UNIQUE ? 1 : randomInt(5, 30);
    const status = getStatus(quantity, minQuantity);

    const supplier = getSupplierForCategory(categoryName, suppliers);

    const currency = Math.random() > 0.5 ? Currency.USD : Currency.HNL;
    const basePriceUSD = randomPrice(product.basePrice, product.variation);
    const price = currency === Currency.USD
      ? basePriceUSD
      : Number((basePriceUSD / HNL_TO_USD_RATE).toFixed(2));

    const variants = ['Pro', 'Plus', 'Standard', 'Premium', 'Basic', 'Elite', 'Gen2'];
    let name = product.name;
    if (Math.random() > 0.6 && !name.includes('Box') && !name.includes('Pack') && !name.includes('Set')) {
      name += ` ${random(variants)}`;
    }

    const categoryPrefix = categoryName.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase();
    const sku = `${categoryPrefix}-${String(++itemIndex).padStart(4, '0')}`;
    const barcode = Math.random() > 0.3 ? `${randomInt(100000000, 999999999)}${randomInt(100, 999)}` : null;
    const serviceTag = itemType === ItemType.UNIQUE ? generateServiceTag() : null;

    // Assign some UNIQUE items to external users
    const assignedUser =
      itemType === ItemType.UNIQUE && status === InventoryStatus.IN_STOCK && Math.random() > 0.55
        ? random(externalUsers)
        : null;

    const item = await prisma.inventoryItem.create({
      data: {
        name,
        description: `${name} — ${categoryName.toLowerCase()} for office and operations use`,
        quantity,
        minQuantity,
        category: categoryName,
        categoryId: category.id,
        status,
        price,
        currency,
        sku,
        barcode,
        itemType,
        serviceTag,
        warehouseId: warehouse.id,
        supplierId: supplier?.id,
        createdById: adminUser.id,
        assignedToUserId: assignedUser?.id ?? null,
        assignedAt: assignedUser ? daysAgo(randomInt(5, 90)) : null,
      },
    });

    createdItems.push({ ...item, warehouseId: warehouse.id });
    if (itemType === ItemType.UNIQUE) uniqueCount++;
    else bulkCount++;
  }

  console.log(`   ✓ 250 inventory items (${uniqueCount} unique, ${bulkCount} bulk)\n`);

  // Filter bulk items with enough stock for transactions
  const bulkItemsWithStock = createdItems.filter(
    it => it.itemType === ItemType.BULK && it.quantity >= 5,
  );

  // ----------------------------------------
  // Transactions (IN / OUT / TRANSFER)
  // ----------------------------------------
  console.log('🔄 Creating transactions...');

  const txTypes = ['IN', 'OUT', 'TRANSFER'];
  let txCount = 0;

  for (let i = 0; i < 45; i++) {
    const type = random(txTypes);
    const user = random([...internalUsers, ...managerUsers]);
    const date = daysAgo(randomInt(1, 180));

    const sourceWh = type === 'IN' ? null : random(warehouses);
    const destWh = type === 'OUT' ? null :
      type === 'IN' ? random(warehouses) :
      warehouses.find(w => w.id !== sourceWh?.id) ?? warehouses[0];

    // Pick 1–4 bulk items for this transaction from the relevant warehouse
    const eligible = bulkItemsWithStock.filter(it =>
      type === 'IN' ? true :
      type === 'OUT' ? it.warehouseId === sourceWh?.id :
      it.warehouseId === sourceWh?.id,
    );

    if (eligible.length === 0) continue;

    const selectedItems = [];
    const used = new Set<string>();
    const count = Math.min(randomInt(1, 4), eligible.length);
    while (selectedItems.length < count) {
      const candidate = random(eligible);
      if (!used.has(candidate.id)) {
        used.add(candidate.id);
        selectedItems.push(candidate);
      }
    }

    const tx = await prisma.transaction.create({
      data: {
        type,
        sourceWarehouseId: sourceWh?.id ?? null,
        destinationWarehouseId: destWh?.id ?? null,
        userId: user.id,
        date,
        notes: random(transactionNotes),
        items: {
          create: selectedItems.map(item => ({
            inventoryItemId: item.id,
            quantity: randomInt(1, Math.min(10, item.quantity)),
            notes: Math.random() > 0.7 ? 'Verified before shipment' : null,
          })),
        },
      },
    });

    txCount++;
  }

  console.log(`   ✓ ${txCount} transactions\n`);

  // ----------------------------------------
  // Loans
  // ----------------------------------------
  console.log('📋 Creating loans...');

  // Use both bulk items with stock and unique items for loans
  const loanableItems = createdItems.filter(
    it => (it.itemType === ItemType.BULK && it.quantity >= 2) || it.itemType === ItemType.UNIQUE,
  );

  const loanStatusScenarios: Array<{
    status: LoanStatus;
    weight: number;
    daysAgoCreated: [number, number];
    dueDaysFromCreated: [number, number];
    isReturned: boolean;
    isOverdue: boolean;
  }> = [
    { status: LoanStatus.PENDING,        weight: 15, daysAgoCreated: [1, 5],    dueDaysFromCreated: [14, 30], isReturned: false, isOverdue: false },
    { status: LoanStatus.SENT,           weight: 15, daysAgoCreated: [2, 10],   dueDaysFromCreated: [14, 30], isReturned: false, isOverdue: false },
    { status: LoanStatus.RECEIVED,       weight: 20, daysAgoCreated: [5, 20],   dueDaysFromCreated: [14, 30], isReturned: false, isOverdue: false },
    { status: LoanStatus.RETURN_PENDING, weight: 10, daysAgoCreated: [10, 25],  dueDaysFromCreated: [7, 20],  isReturned: false, isOverdue: false },
    { status: LoanStatus.RETURNED,       weight: 20, daysAgoCreated: [20, 90],  dueDaysFromCreated: [7, 21],  isReturned: true,  isOverdue: false },
    { status: LoanStatus.OVERDUE,        weight: 10, daysAgoCreated: [30, 90],  dueDaysFromCreated: [7, 14],  isReturned: false, isOverdue: true  },
    { status: LoanStatus.CANCELLED,      weight: 10, daysAgoCreated: [5, 60],   dueDaysFromCreated: [14, 30], isReturned: false, isOverdue: false },
  ];

  function pickLoanScenario() {
    const total = loanStatusScenarios.reduce((s, sc) => s + sc.weight, 0);
    let r = Math.random() * total;
    for (const sc of loanStatusScenarios) {
      r -= sc.weight;
      if (r <= 0) return sc;
    }
    return loanStatusScenarios[0];
  }

  let loanCount = 0;

  for (let i = 0; i < 35; i++) {
    if (loanableItems.length === 0) break;

    const item = random(loanableItems);
    const scenario = pickLoanScenario();

    const srcWh = warehouses.find(w => w.id === item.warehouseId) ?? warehouses[0];
    const dstWh = warehouses.find(w => w.id !== srcWh.id) ?? warehouses[1];

    const createdAt = daysAgo(randomInt(...scenario.daysAgoCreated));
    const loanDate = createdAt;
    const dueDaysOffset = randomInt(...scenario.dueDaysFromCreated);
    const dueDate = new Date(createdAt);
    dueDate.setDate(dueDate.getDate() + dueDaysOffset);

    const createdByUser = random([...internalUsers, ...managerUsers]);
    const receiverUser = random([...internalUsers, ...managerUsers]);

    let receivedAt: Date | null = null;
    let receivedById: string | null = null;
    let returnDate: Date | null = null;
    let returnConfirmedAt: Date | null = null;
    let returnConfirmedById: string | null = null;

    if (scenario.status === LoanStatus.RECEIVED || scenario.status === LoanStatus.RETURN_PENDING || scenario.status === LoanStatus.RETURNED) {
      receivedAt = new Date(loanDate);
      receivedAt.setDate(receivedAt.getDate() + randomInt(1, 3));
      receivedById = receiverUser.id;
    }

    if (scenario.isReturned) {
      returnDate = new Date(dueDate);
      returnDate.setDate(returnDate.getDate() - randomInt(0, 5));
      returnConfirmedAt = new Date(returnDate);
      returnConfirmedAt.setDate(returnConfirmedAt.getDate() + 1);
      returnConfirmedById = random(managerUsers).id;
    }

    const quantity = item.itemType === ItemType.UNIQUE ? 1 : randomInt(1, Math.min(5, item.quantity));

    await prisma.loan.create({
      data: {
        inventoryItemId: item.id,
        quantity,
        sourceWarehouseId: srcWh.id,
        destinationWarehouseId: dstWh.id,
        loanDate,
        dueDate,
        returnDate,
        status: scenario.status,
        notes: random(loanNotes),
        createdById: createdByUser.id,
        createdAt,
        receivedAt,
        receivedById,
        returnConfirmedAt,
        returnConfirmedById,
      },
    });

    loanCount++;
  }

  console.log(`   ✓ ${loanCount} loans\n`);

  // ----------------------------------------
  // Transfer Requests
  // ----------------------------------------
  console.log('↔️  Creating transfer requests...');

  const trStatusScenarios: Array<{ status: RequestStatus; daysAgo: number }> = [
    { status: RequestStatus.PENDING,   daysAgo: 2  },
    { status: RequestStatus.PENDING,   daysAgo: 4  },
    { status: RequestStatus.APPROVED,  daysAgo: 3  },
    { status: RequestStatus.SENT,      daysAgo: 5  },
    { status: RequestStatus.RECEIVED,  daysAgo: 7  },
    { status: RequestStatus.COMPLETED, daysAgo: 14 },
    { status: RequestStatus.COMPLETED, daysAgo: 25 },
    { status: RequestStatus.COMPLETED, daysAgo: 40 },
    { status: RequestStatus.REJECTED,  daysAgo: 10 },
    { status: RequestStatus.CANCELLED, daysAgo: 8  },
  ];

  let trCount = 0;

  for (const scenario of trStatusScenarios) {
    const srcWh = random(warehouses);
    const dstWh = warehouses.find(w => w.id !== srcWh.id) ?? warehouses[1];
    const requester = random([...internalUsers, ...managerUsers]);
    const approver = random(managerUsers);
    const createdAt = daysAgo(scenario.daysAgo);

    const eligible = bulkItemsWithStock.filter(it => it.warehouseId === srcWh.id);
    if (eligible.length === 0) continue;

    const itemsForRequest = [];
    const used = new Set<string>();
    const count = Math.min(randomInt(1, 3), eligible.length);
    while (itemsForRequest.length < count) {
      const candidate = random(eligible);
      if (!used.has(candidate.id)) {
        used.add(candidate.id);
        itemsForRequest.push(candidate);
      }
    }

    const isApproved = [
      RequestStatus.APPROVED,
      RequestStatus.SENT,
      RequestStatus.RECEIVED,
      RequestStatus.COMPLETED,
    ].includes(scenario.status);

    const isRejected = scenario.status === RequestStatus.REJECTED;

    await prisma.transferRequest.create({
      data: {
        status: scenario.status,
        sourceWarehouseId: srcWh.id,
        destinationWarehouseId: dstWh.id,
        requestedById: requester.id,
        approvedById: isApproved || isRejected ? approver.id : null,
        approvedAt: isApproved ? new Date(createdAt.getTime() + 60 * 60 * 1000) : null,
        rejectedAt: isRejected ? new Date(createdAt.getTime() + 2 * 60 * 60 * 1000) : null,
        rejectedReason: isRejected ? 'Insufficient stock levels at source warehouse' : null,
        notes: Math.random() > 0.5 ? 'Branch rebalancing — monthly cycle' : null,
        createdAt,
        items: {
          create: itemsForRequest.map(item => ({
            inventoryItemId: item.id,
            quantity: randomInt(1, Math.min(8, item.quantity)),
          })),
        },
      },
    });

    trCount++;
  }

  console.log(`   ✓ ${trCount} transfer requests\n`);

  // ----------------------------------------
  // Audit Logs
  // ----------------------------------------
  console.log('📝 Creating audit logs...');

  const auditActions = ['CREATE', 'UPDATE', 'DELETE'];
  const auditEntities = ['InventoryItem', 'Transaction', 'Loan', 'TransferRequest', 'User', 'Category'];

  let auditCount = 0;

  for (let i = 0; i < 80; i++) {
    const user = random(users);
    const action = random(auditActions);
    const entity = random(auditEntities);
    const targetItem = Math.random() > 0.4 ? random(createdItems) : null;

    await prisma.auditLog.create({
      data: {
        action,
        entity,
        entityId: targetItem?.id ?? `fake-${randomInt(1000, 9999)}`,
        changes: action === 'UPDATE'
          ? { before: { quantity: randomInt(0, 100) }, after: { quantity: randomInt(0, 100) } }
          : action === 'CREATE'
          ? { after: { status: 'IN_STOCK' } }
          : { before: { status: 'IN_STOCK' } },
        userId: user.id,
        itemId: targetItem?.id ?? null,
        createdAt: daysAgo(randomInt(1, 120)),
      },
    });

    auditCount++;
  }

  console.log(`   ✓ ${auditCount} audit log entries\n`);

  // ----------------------------------------
  // Stock Alerts
  // ----------------------------------------
  console.log('🔔 Creating stock alerts...');

  const lowAndOutItems = createdItems.filter(
    it => it.status === InventoryStatus.LOW_STOCK || it.status === InventoryStatus.OUT_OF_STOCK,
  );

  let alertCount = 0;

  for (const item of lowAndOutItems.slice(0, 25)) {
    const alertType = item.status === InventoryStatus.OUT_OF_STOCK ? 'OUT_OF_STOCK' : 'LOW_STOCK';
    await prisma.stockAlert.create({
      data: {
        itemId: item.id,
        type: alertType as any,
        threshold: item.minQuantity,
        currentQty: item.quantity,
        notified: Math.random() > 0.4,
        notifiedAt: Math.random() > 0.4 ? daysAgo(randomInt(1, 30)) : null,
        createdAt: daysAgo(randomInt(1, 60)),
      },
    });
    alertCount++;
  }

  console.log(`   ✓ ${alertCount} stock alerts\n`);

  // ----------------------------------------
  // Summary Statistics
  // ----------------------------------------
  console.log('📊 Summary:\n');

  const statusStats = await prisma.inventoryItem.groupBy({
    by: ['status'],
    _count: { status: true },
  });
  console.log('   Items by status:');
  statusStats.forEach(s => console.log(`     ${s.status}: ${s._count.status}`));

  const warehouseStats = await prisma.inventoryItem.groupBy({
    by: ['warehouseId'],
    _count: { warehouseId: true },
  });
  console.log('\n   Items by warehouse:');
  for (const s of warehouseStats) {
    const wh = warehouses.find(w => w.id === s.warehouseId);
    console.log(`     ${wh?.name}: ${s._count.warehouseId}`);
  }

  const loanStats = await prisma.loan.groupBy({
    by: ['status'],
    _count: { status: true },
  });
  console.log('\n   Loans by status:');
  loanStats.forEach(s => console.log(`     ${s.status}: ${s._count.status}`));

  // ----------------------------------------
  // Done
  // ----------------------------------------
  console.log('\n✅ Fake data seed completed!\n');
  console.log('📝 Login credentials (all passwords: password123):');
  console.log('   Admin:   admin@example.com');
  console.log('   Manager: ana.reyes@obsid.hn  |  luis.m@obsid.hn');
  console.log('   User:    carmen.f@obsid.hn   |  jorge.e@obsid.hn  |  sofia.n@obsid.hn');
  console.log('   Viewer:  ricardo.a@obsid.hn  |  daniela.c@obsid.hn');
}

main()
  .catch(e => {
    console.error('❌ Error seeding fake data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
