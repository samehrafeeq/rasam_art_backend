import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@rasamart.com';
  
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await prisma.user.create({
      data: {
        name: 'مدير النظام',
        email: adminEmail,
        phone: '0500000000',
        password: hashedPassword,
        role: 'ADMIN',
      },
    });
    console.log('Admin account created: admin@rasamart.com / admin123');
  } else {
    console.log('Admin account already exists.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
