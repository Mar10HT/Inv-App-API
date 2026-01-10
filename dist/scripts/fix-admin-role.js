"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🔧 Fixing ADMIN role to SYSTEM_ADMIN...');
    try {
        const result = await prisma.$executeRawUnsafe(`UPDATE users SET role = 'SYSTEM_ADMIN' WHERE role = 'ADMIN'`);
        console.log(`✅ Updated ${result} users from ADMIN to SYSTEM_ADMIN`);
        const users = await prisma.$queryRawUnsafe(`SELECT id, email, name, role FROM users`);
        console.log('\n📋 Current users:');
        console.table(users);
    }
    catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}
main()
    .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=fix-admin-role.js.map