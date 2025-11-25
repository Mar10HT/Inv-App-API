"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const HNL_TO_USD_RATE = 0.04;
const categories = [
    'Electronics',
    'Furniture',
    'Hardware',
    'Office Supplies',
    'Computer Components',
    'Accessories',
];
const locations = [
    'Warehouse A',
    'Warehouse B',
    'Store Front',
    'Storage Room 1',
    'Storage Room 2',
    'Distribution Center',
];
const products = {
    Electronics: [
        { name: 'Laptop Dell XPS', basePrice: 1200, variation: 500 },
        { name: 'Laptop HP Pavilion', basePrice: 800, variation: 300 },
        { name: 'Monitor Samsung 27"', basePrice: 300, variation: 200 },
        { name: 'Monitor LG UltraWide', basePrice: 500, variation: 300 },
        { name: 'Keyboard Mechanical', basePrice: 120, variation: 80 },
        { name: 'Mouse Logitech MX', basePrice: 80, variation: 40 },
        { name: 'Webcam Logitech C920', basePrice: 100, variation: 50 },
        { name: 'Headset HyperX Cloud', basePrice: 90, variation: 60 },
        { name: 'Tablet Samsung Galaxy', basePrice: 400, variation: 300 },
        { name: 'Smartphone iPhone', basePrice: 800, variation: 600 },
    ],
    Furniture: [
        { name: 'Office Chair Ergonomic', basePrice: 250, variation: 200 },
        { name: 'Standing Desk', basePrice: 500, variation: 300 },
        { name: 'Conference Table', basePrice: 800, variation: 500 },
        { name: 'Filing Cabinet', basePrice: 150, variation: 100 },
        { name: 'Bookshelf 5-Tier', basePrice: 120, variation: 80 },
        { name: 'Office Desk L-Shape', basePrice: 400, variation: 250 },
        { name: 'Reception Desk', basePrice: 600, variation: 400 },
        { name: 'Executive Chair Leather', basePrice: 450, variation: 300 },
        { name: 'Meeting Room Chair', basePrice: 180, variation: 120 },
        { name: 'Storage Cabinet', basePrice: 200, variation: 150 },
    ],
    Hardware: [
        { name: 'Screws Phillips M4x20mm (Box 100)', basePrice: 5, variation: 3 },
        { name: 'Screws Flathead M5x30mm (Box 100)', basePrice: 6, variation: 3 },
        { name: 'Bolts Hex M8x40mm (Box 50)', basePrice: 12, variation: 5 },
        { name: 'Nuts Hex M8 (Box 100)', basePrice: 8, variation: 4 },
        { name: 'Washers M8 (Box 200)', basePrice: 5, variation: 2 },
        { name: 'Anchors Wall Plastic (Box 50)', basePrice: 4, variation: 2 },
        { name: 'Drill Bits Set HSS', basePrice: 35, variation: 20 },
        { name: 'Hammer Claw 16oz', basePrice: 25, variation: 15 },
        { name: 'Screwdriver Set 10pc', basePrice: 30, variation: 20 },
        { name: 'Pliers Set 3pc', basePrice: 40, variation: 25 },
    ],
    'Office Supplies': [
        { name: 'Paper A4 500 Sheets', basePrice: 8, variation: 3 },
        { name: 'Pen Blue (Box 50)', basePrice: 15, variation: 8 },
        { name: 'Pen Black (Box 50)', basePrice: 15, variation: 8 },
        { name: 'Marker Permanent (Pack 12)', basePrice: 12, variation: 6 },
        { name: 'Stapler Heavy Duty', basePrice: 20, variation: 10 },
        { name: 'Staples (Box 5000)', basePrice: 5, variation: 2 },
        { name: 'Paper Clips (Box 1000)', basePrice: 4, variation: 2 },
        { name: 'Binder Clips Assorted', basePrice: 8, variation: 4 },
        { name: 'Folders Manila (Pack 100)', basePrice: 25, variation: 15 },
        { name: 'Notebook Spiral A5', basePrice: 3, variation: 2 },
    ],
    'Computer Components': [
        { name: 'RAM DDR4 16GB', basePrice: 80, variation: 40 },
        { name: 'RAM DDR4 32GB', basePrice: 150, variation: 70 },
        { name: 'SSD NVMe 512GB', basePrice: 70, variation: 40 },
        { name: 'SSD NVMe 1TB', basePrice: 120, variation: 60 },
        { name: 'HDD 2TB 7200RPM', basePrice: 60, variation: 30 },
        { name: 'Graphics Card GTX 1660', basePrice: 300, variation: 150 },
        { name: 'Graphics Card RTX 3060', basePrice: 500, variation: 250 },
        { name: 'Processor Intel i5', basePrice: 250, variation: 100 },
        { name: 'Processor Intel i7', basePrice: 400, variation: 150 },
        { name: 'Motherboard ATX', basePrice: 200, variation: 100 },
    ],
    Accessories: [
        { name: 'USB Cable Type-C 2m', basePrice: 10, variation: 5 },
        { name: 'HDMI Cable 3m', basePrice: 15, variation: 8 },
        { name: 'Power Strip 6 Outlet', basePrice: 25, variation: 15 },
        { name: 'Laptop Stand Aluminum', basePrice: 40, variation: 25 },
        { name: 'Monitor Arm Dual', basePrice: 80, variation: 50 },
        { name: 'Cable Management Box', basePrice: 20, variation: 10 },
        { name: 'Desk Organizer', basePrice: 15, variation: 10 },
        { name: 'Mouse Pad RGB', basePrice: 30, variation: 20 },
        { name: 'Laptop Sleeve 15"', basePrice: 25, variation: 15 },
        { name: 'Phone Holder Adjustable', basePrice: 12, variation: 8 },
    ],
};
function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function getRandomPrice(basePrice, variation) {
    return Number((basePrice + (Math.random() * variation * 2 - variation)).toFixed(2));
}
function getStatus(quantity, minQuantity) {
    if (quantity === 0)
        return client_1.InventoryStatus.OUT_OF_STOCK;
    if (quantity <= minQuantity)
        return client_1.InventoryStatus.LOW_STOCK;
    return client_1.InventoryStatus.IN_STOCK;
}
async function main() {
    console.log('🌱 Starting seed...');
    await prisma.inventoryItem.deleteMany();
    console.log('🗑️  Cleared existing inventory items');
    const itemsToCreate = [];
    for (let i = 0; i < 200; i++) {
        const category = getRandomElement(categories);
        const productList = products[category];
        const product = getRandomElement(productList);
        const quantity = getRandomInt(0, 200);
        const minQuantity = getRandomInt(5, 25);
        const location = getRandomElement(locations);
        const status = getStatus(quantity, minQuantity);
        const currency = Math.random() > 0.5 ? client_1.Currency.USD : client_1.Currency.HNL;
        let price;
        if (currency === client_1.Currency.USD) {
            price = getRandomPrice(product.basePrice, product.variation);
        }
        else {
            const priceUSD = getRandomPrice(product.basePrice, product.variation);
            price = Number((priceUSD / HNL_TO_USD_RATE).toFixed(2));
        }
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
        const categoryPrefix = category.substring(0, 3).toUpperCase();
        const sku = `${categoryPrefix}-${String(i + 1).padStart(4, '0')}`;
        const barcode = Math.random() > 0.3 ? `${getRandomInt(100000000, 999999999)}${getRandomInt(100, 999)}` : null;
        const description = `${name} - High quality ${category.toLowerCase()} item for office and business use`;
        itemsToCreate.push({
            name,
            description,
            quantity,
            minQuantity,
            category,
            location,
            status,
            price,
            currency,
            sku,
            barcode,
        });
    }
    for (const item of itemsToCreate) {
        await prisma.inventoryItem.create({
            data: item,
        });
    }
    console.log(`✅ Created ${itemsToCreate.length} inventory items`);
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
//# sourceMappingURL=seed-data.js.map