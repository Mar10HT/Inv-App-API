import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🔐 Creating admin user...');

  const email = 'admin@example.com';
  const password = 'password123';
  const hashedPassword = await bcrypt.hash(password, 10);

  // Check if admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email },
  });

  if (existingAdmin) {
    console.log('⚠️  Admin user already exists');
    console.log(`📧 Email: ${email}`);
    return;
  }

  const admin = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name: 'Administrator',
      role: UserRole.ADMIN,
    },
  });

  console.log('✅ Admin user created successfully!');
  console.log('');
  console.log('📧 Email:', email);
  console.log('🔑 Password:', password);
  console.log('👤 Name:', admin.name);
  console.log('🎭 Role:', admin.role);
  console.log('');
  console.log('Use these credentials to login to the application.');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
