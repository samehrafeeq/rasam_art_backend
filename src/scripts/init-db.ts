/**
 * init-db.ts
 * -------------------------------------------------
 * Runs automatically before the app starts (via npm pre-hooks).
 * 1. Creates the MySQL database if it does not exist.
 * 2. Runs Prisma migrations (prisma migrate deploy).
 * 3. Seeds the admin account if it does not exist.
 * -------------------------------------------------
 */

import * as mysql from 'mysql2/promise';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

// ─── Parse DATABASE_URL ──────────────────────────────────────────────────────

function parseDatabaseUrl(url: string) {
  // mysql://user:password@host:port/database
  const match = url.match(
    /^mysql:\/\/([^:]*):([^@]*)@([^:]+):(\d+)\/(.+)$/,
  );
  if (!match) {
    throw new Error(`Invalid DATABASE_URL format: ${url}`);
  }
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: Number(match[4]),
    database: match[5],
  };
}

// ─── Step 1: Create Database ─────────────────────────────────────────────────

async function createDatabaseIfNotExists() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is not defined in .env');

  const { user, password, host, port, database } = parseDatabaseUrl(dbUrl);

  console.log(`\n🔌 Connecting to MySQL at ${host}:${port} as '${user}'...`);

  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password: password || undefined,
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    );
    console.log(`✅ Database '${database}' is ready.`);
  } finally {
    await connection.end();
  }
}

// ─── Step 2: Run Prisma Migrations ───────────────────────────────────────────

function runMigrations() {
  console.log('\n📦 Running Prisma migrations...');
  // Use local prisma binary to avoid npx downloading the latest version (v7+)
  // which is incompatible with our schema format
  const prismaBin = process.env.PRISMA_BIN ||
    (process.platform === 'win32'
      ? '.\\node_modules\\.bin\\prisma'
      : './node_modules/.bin/prisma');
  try {
    execSync(`${prismaBin} migrate deploy`, { stdio: 'pipe' });
    console.log('✅ Migrations applied successfully.');
  } catch (err: any) {
    const output = (err.stdout?.toString() || '') + (err.stderr?.toString() || '') + err.message;
    
    // Check if it's a P3009 failed migration error
    const match = output.match(/The \`([^\`]+)\` migration started at/);
    if (match && match[1]) {
      const failedMigration = match[1];
      console.log(`\n⚠️ Detected failed migration: ${failedMigration}`);
      console.log(`Attempting to mark it as rolled-back and retry...`);
      try {
        execSync(`${prismaBin} migrate resolve --rolled-back ${failedMigration}`, { stdio: 'inherit' });
        console.log(`✅ Resolved ${failedMigration}. Retrying deploy...`);
        execSync(`${prismaBin} migrate deploy`, { stdio: 'inherit' });
        console.log('✅ Migrations applied successfully.');
        return;
      } catch (resolveErr: any) {
        console.error('❌ Auto-resolve failed:', resolveErr.message);
      }
    }
    
    console.error('❌ Migration failed:\n', output);
    process.exit(1);
  }
}

// ─── Step 3: Seed Admin Account ──────────────────────────────────────────────

async function seedAdmin() {
  const prisma = new PrismaClient();
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@rasamart.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  try {
    console.log('\n🌱 Checking admin account...');
    const existing = await prisma.user.findUnique({
      where: { email: adminEmail },
    });

    if (!existing) {
      const hashed = await bcrypt.hash(adminPassword, 10);
      await prisma.user.create({
        data: {
          name: 'مدير النظام',
          email: adminEmail,
          phone: process.env.ADMIN_PHONE || '0500000000',
          password: hashed,
          role: 'ADMIN',
        },
      });
      console.log(`✅ Admin account created: ${adminEmail}`);
    } else {
      console.log('ℹ️  Admin account already exists, skipping seed.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Initializing database...');
  await createDatabaseIfNotExists();
  runMigrations();
  await seedAdmin();
  console.log('\n✨ Database initialization complete. Starting app...\n');
}

main().catch((err) => {
  console.error('❌ Database initialization failed:', err.message);
  process.exit(1);
});
