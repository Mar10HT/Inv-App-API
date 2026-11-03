import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Same rule as IsStrongPassword() (src/auth/decorators/strong-password.decorator.ts),
// duplicated here rather than imported so this plain ts-node script doesn't have to
// pull in class-validator/DTO machinery for one check.
const STRONG_PASSWORD =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

async function main() {
  console.log('🔐 Creating admin user...');

  const isProduction = process.env.NODE_ENV === 'production';
  const envEmail = process.env.ADMIN_EMAIL;
  const envPassword = process.env.ADMIN_PASSWORD;

  // In production there is no demo fallback — refusing to run is safer than silently
  // creating admin@example.com/password123 on a real client's database.
  if (isProduction && (!envEmail || !envPassword)) {
    console.error(
      '❌ ADMIN_EMAIL and ADMIN_PASSWORD are required when NODE_ENV=production (no demo fallback in production).',
    );
    process.exit(1);
  }
  if (envPassword && !STRONG_PASSWORD.test(envPassword)) {
    console.error(
      '❌ ADMIN_PASSWORD must be 8+ chars with an uppercase letter, a lowercase letter, a digit and a special character (@$!%*?&).',
    );
    process.exit(1);
  }

  const email = envEmail ?? 'admin@example.com';
  const password = envPassword ?? 'password123';
  const hashedPassword = await bcrypt.hash(password, 10);

  // Check if admin already exists. email isn't @unique in the schema, so
  // findUnique() doesn't type-check here — same findFirst() pattern
  // users.service.ts's findByEmail() uses for the real login lookup.
  const existingAdmin = await prisma.user.findFirst({
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
      name: process.env.ADMIN_NAME ?? 'Administrator',
      role: UserRole.SYSTEM_ADMIN,
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
