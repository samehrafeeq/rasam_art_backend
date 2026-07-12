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

/**
 * Some schema changes (like adding a required column to WhatsappSession)
 * cannot run against existing rows. We clear those rows safely before pushing
 * since they are just temporary auth tokens — not user data.
 * The user will need to re-scan the WhatsApp QR once after this migration.
 */
async function clearObsoleteWhatsappSessions() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return;

  const { user, password, host, port, database } = parseDatabaseUrl(dbUrl);

  const connection = await mysql.createConnection({
    host, port, user, password: password || undefined, database,
  });

  try {
    // Check if WhatsappSession table exists and has old rows without instanceId
    const [cols] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'WhatsappSession' AND COLUMN_NAME = 'instanceId'`,
      [database]
    ) as any[];

    if (cols.length === 0) {
      // Column doesn't exist yet → old schema → clear sessions to allow migration
      const [rows] = await connection.query(
        `SELECT COUNT(*) as count FROM \`${database}\`.\`WhatsappSession\``
      ) as any[];
      const count = rows[0]?.count ?? 0;
      if (count > 0) {
        await connection.query(`DELETE FROM \`${database}\`.\`WhatsappSession\``);
        console.log(`🧹 Cleared ${count} old WhatsApp session rows (schema migration — re-scan QR once).`);
      }
    }
  } catch {
    // Table may not exist yet on first run — that's fine
  } finally {
    await connection.end();
  }
}

async function runMigrations() {
  // Clear incompatible session rows before schema push
  await clearObsoleteWhatsappSessions();

  console.log('\n📦 Pushing Prisma schema to database...');
  // Use local prisma binary to avoid npx downloading the latest version (v7+)
  // which is incompatible with our schema format
  const prismaBin = process.env.PRISMA_BIN ||
    (process.platform === 'win32'
      ? '.\\node_modules\\.bin\\prisma'
      : './node_modules/.bin/prisma');
  try {
    execSync(`${prismaBin} db push`, { stdio: 'pipe' });
    console.log('✅ Schema pushed successfully.');
  } catch (err: any) {
    const output = (err.stdout?.toString() || '') + (err.stderr?.toString() || '') + err.message;
    console.error('❌ Schema push failed:\n', output);
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
  await runMigrations();
  await seedAdmin();
  console.log('\n✨ Database initialization complete. Starting app...\n');
}

main().catch((err) => {
  console.error('❌ Database initialization failed:', err.message);
  process.exit(1);
});
