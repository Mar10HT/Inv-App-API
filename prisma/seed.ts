import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Running database seed...');

  // Check if admin user already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin@example.com' },
  });

  if (existingAdmin) {
    console.log('ℹ️  Admin user already exists');
    return;
  }

  // Create admin user
  const hashedPassword = await bcrypt.hash('password123', 10);
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      password: hashedPassword,
      name: 'System Administrator',
      role: UserRole.SYSTEM_ADMIN,
    },
  });

  console.log(`✅ Admin user created: ${adminUser.email}`);
  console.log('🎉 Seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
